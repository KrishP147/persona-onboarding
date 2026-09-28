import { type InboxItem, type Msg, type Session, type SlotKey, type TurnResult } from "../types";
import { computeDirective, recordAsk, MAX_CALL_OFFERS, MAX_SILENCE_STRIKES, SILENCE_BEFORE_WARN_MS, SILENCE_SECOND_MS, SILENCE_WARN_GAP_MS, SILENCE_WARN_STRIKE } from "../policy";
import { RECAP_INSTRUCTION } from "../prompt";

import { DEMO_INBOX, triageInbox } from "../triage";
import { EVENT_MOVES, pick } from "../moves";
import { reconcileCall } from "../extract";
import { metered } from "../usage";
import { setSecret } from "../store";
import { type Ctx, emitAgentText, eventMsg, heardThemThisCall, msg, recapFallback, shortNeed } from "./context";
import { OFFERED_CALL, asTurnBy, saysBye } from "./intents";
import { discardDraft, editDraft } from "./tools";
import { linkPending, rememberEmails, sealGoodbye } from "./guards";
import { DEMO_ASK, DEMO_MARK, INTRO_CAPABILITIES, noteMetrics, turn } from "./turn";

export type SessionEvent =
  | { type: "open" }
  | { type: "call_started"; byUser?: boolean }
  | { type: "call_declined" }
  | { type: "call_ended"; reason: "user_hangup" | "agent_ended" | "error" }
  | { type: "silence" }
  | { type: "text_idle" } // over text, their turn and they went quiet (left on read)
  | { type: "contact_saved" }
  | { type: "mic_denied" }
  | { type: "gmail_connected"; email?: string }
  | { type: "inbox_scan" } // right after gmail_connected over text: the (slower) inbox look
  | { type: "gmail_failed"; error: string }
  | { type: "forget_slot"; slot: Exclude<SlotKey, "agentName"> } // "forget" on the what-i-know card
  | { type: "draft_edit"; to: string; subject: string; body: string } // edited in place on the draft card
  | { type: "draft_discard" }; // discard on the draft card

export async function handleEvent(s: Session, e: SessionEvent): Promise<TurnResult> {
  const start = s.transcript.length;
  const [inner, meter] = await metered(() => asTurnBy(s, "event", () => handleEventInner(s, e)));
  noteMetrics(s, meter);
  const r = sealGoodbye(s, inner);
  // Anything the event added to the transcript (e.g. "Call ended (12s)") goes out with the reply, in order.
  const added = s.transcript.slice(start);
  const updated = r.newMessages.filter((m) => !added.includes(m));
  r.newMessages = [...updated, ...added.filter((m) => m.kind === "event" || r.newMessages.includes(m))];
  return r;
}

export async function handleEventInner(s: Session, e: SessionEvent): Promise<TurnResult> {
  const idle = (): TurnResult => ({ session: s, newMessages: [], chips: computeDirective(s, "text").chips, actions: [] });
  return EVENT_HANDLERS[e.type]({ s, e: e as never, idle });
}

// One handler per event type (the old switch, case for case).
type EventOf<K extends SessionEvent["type"]> = Extract<SessionEvent, { type: K }>;
type EventHandler<K extends SessionEvent["type"]> = (a: { s: Session; e: EventOf<K>; idle: () => TurnResult }) => Promise<TurnResult>;
export const EVENT_HANDLERS: { [K in SessionEvent["type"]]: EventHandler<K> } = {
  open: async ({ s, idle }) => {
    if (s.transcript.length > 0) return idle(); // resume after refresh: no duplicate greeting
    // Scripted, like Persona's real first text: who it is, what it does, the legal line, then the one ask.
    const intro = [
      msg("agent", "text", "Hey! I'm your new personal assistant"),
      msg("agent", "text", INTRO_CAPABILITIES),
      msg("agent", "text", "yourpersona.com/legal", { kind: "link_preview" }),
      msg("agent", "text", "What do you want to call me?", { move: EVENT_MOVES.intro }),
    ];
    s.transcript.push(...intro);
    recordAsk(s, "agentName");
    return { session: s, newMessages: intro, chips: computeDirective(s, "text").chips, actions: [] };
  },
  call_started: async ({ s, e, idle }) => {
    if (s.call.active) return idle();
    s.call = { active: true, startedAt: Date.now(), silenceStrikes: 0, byUser: !!e.byUser };
    const callingBack = !e.byUser && !!s.callbackAt;
    s.callbackAt = undefined;
    s.prePhase = s.phase;
    s.phase = "on_call";
    eventMsg(s, "Call started");
    {
      // Written by code so the first words come right away (no model wait on the line).
      const ctx: Ctx = { s, channel: "voice", actions: [], newMessages: [], move: EVENT_MOVES.greet };
      const who = s.slots.agentName.value ?? "me";
      const name = s.slots.userName.value;
      // They called us: they're bringing something. Warm, open, no agenda, nothing from before.
      // Seeded per session, so two people calling in don't hear word-for-word the same opener.
      const next = e.byUser
        ? pick(s, "greet-inbound", ["really good to hear from you. what's going on?", "good timing. what's up?", "glad you called. what's on your mind?"])
        : s.slots.userName.status === "missing"
          ? pick(s, "greet-name", ["what should i call you?", "what do you like to be called?", "first things first, what's your name?"])
          : s.slots.helpNeed.status === "missing"
            ? pick(s, "greet-need", ["what's been taking up most of your time lately?", "what's been eating your week?", "what's the thing you keep putting off lately?"])
            : pick(s, "greet", ["how's it going?", "how's your day going?", "how are things?"]);
      const line = callingBack
        ? `hey${name ? ` ${name}` : ""}, it's ${who}, calling you back like i said. is now a better time?`
        : e.byUser ? `hey${name ? ` ${name}` : ""}! ${next}` : `hey${name ? ` ${name}` : ""}, it's ${who}! ${next}`;
      // Right after hello, a quick "can you hear me?" (10s) catches a dead mic; after that, quiet is fine.
      ctx.actions.push({ type: "patience", ms: 10000 });
      emitAgentText(ctx, line);
      recordAsk(s, !e.byUser && s.slots.userName.status === "missing" ? "userName" : !e.byUser && s.slots.helpNeed.status === "missing" ? "helpNeed" : null, true);
      return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "voice").chips, actions: ctx.actions };
    }
  },
  call_declined: async ({ s }) => {
    s.call = { ...s.call, active: false, endedReason: "declined" };
    s.callOffers = Math.max(s.callOffers, 1);
    if (s.phase === "call_offered") s.phase = "intro";
    eventMsg(s, "Call declined");
    {
      // Written by code: the model once answered a decline with "i'll wait here for you to pick up".
      const ctx: Ctx = { s, channel: "text", actions: [], newMessages: [], move: EVENT_MOVES.declined };
      emitAgentText(ctx, "no worries, we can keep it to text. what's on your mind?");
      recordAsk(s, null);
      return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "text").chips, actions: [] };
    }
  },
  call_ended: async ({ s, e, idle }) => {
    if (!s.call.active) return idle(); // duplicate hangup events
    s.call = { ...s.call, active: false, endedAt: Date.now(), endedReason: e.reason };
    if (s.pendingVoice) {
      s.voice = s.pendingVoice;
      s.pendingVoice = undefined;
    }
    s.phase = s.prePhase === "graduated" || s.graduateAfterCall ? "graduated" : "post_call";
    if (s.phase === "graduated") s.graduatedAt ??= new Date().toISOString();
    if (s.graduateAfterCall) {
      s.graduateAfterCall = false;
      for (const k of Object.keys(s.slots) as SlotKey[]) if (s.slots[k].status === "missing") s.slots[k].status = "deferred";
    }
    const secs = Math.round(((s.call.endedAt ?? 0) - (s.call.startedAt ?? 0)) / 1000);
    eventMsg(s, `Call ended (${secs}s)`);
    // They asked us to hang up and call back: the text says when, not "got cut off".
    if (s.callbackAt && s.callbackAt > Date.now()) {
      const mins = Math.max(1, Math.round((s.callbackAt - Date.now()) / 60_000));
      const ctx: Ctx = { s, channel: "text", actions: [], newMessages: [], move: EVENT_MOVES.recap, guards: ["recap written by code (callback)"] };
      emitAgentText(ctx, `talk soon. i'll call you back in ${mins === 1 ? "a minute" : `about ${mins} minutes`}, or text me if that's not a good time.`);
      return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "text").chips, actions: [] };
    }
    // They hung up once things were settled (a bye, or our last line wasn't waiting on them): on purpose, not a drop.
    const lastVoice = s.transcript.findLast((m) => m.channel === "voice" && m.role !== "event");
    const onPurpose = e.reason === "user_hangup" && !!lastVoice && (lastVoice.role === "user" ? saysBye(lastVoice.text) : !/\?\s*$/.test(lastVoice.text.trim()));
    const how =
      e.reason === "agent_ended"
        ? "You ended it after saying goodbye, so don't say you got cut off."
        : onPurpose
          ? "They hung up once you'd wrapped up, on purpose. Don't say you got cut off."
          : e.reason === "user_hangup"
            ? "They hung up (maybe on purpose, maybe not)."
            : "The line dropped on our side.";
    const draftNote = s.draft && !s.draft.sent ? ` Their email${s.draft.to ? ` to ${s.draft.to}` : ""} is still an unsent draft: remind them in a few words (they can send it or keep working on it); don't paste it.` : "";
    // One strict pass over the call fills slots still empty (never overwrites); the recap says what it caught.
    const caught = await reconcileCall(s);
    // Nothing to recap (no need heard): written in code. The model once "remembered" job applications nobody mentioned.
    const r: TurnResult = !s.slots.helpNeed.value
      ? (() => {
          const ctx: Ctx = { s, channel: "text", actions: [], newMessages: [], move: EVENT_MOVES.recap, guards: ["recap written by code (nothing to recap)"] };
          emitAgentText(ctx, recapFallback(s, onPurpose ? "agent_ended" : e.reason));
          return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "text").chips, actions: [] };
        })()
      : await turn(s, "text", `${RECAP_INSTRUCTION} ${how}${draftNote} Call lasted ${secs}s.${Object.keys(caught).length ? " A separate line after yours says what you caught from the call; don't repeat it." : ""}`, recapFallback(s, onPurpose ? "agent_ended" : e.reason), {
      move: EVENT_MOVES.recap,
      avoid: e.reason === "agent_ended" || onPurpose ?/\b(cut off|dropped|lost you|got disconnected)\b/i : undefined,
    });
    // A text always follows a call. If the model's recap got filtered to nothing, the code-written one goes out.
    const recaps = r.newMessages.filter((m) => m.role === "agent" && m.channel === "text" && !m.kind);
    if (!recaps.length) {
      const ctx: Ctx = { s, channel: "text", actions: [], newMessages: [], move: EVENT_MOVES.recap, guards: ["recap written by code"] };
      emitAgentText(ctx, recapFallback(s, onPurpose ? "agent_ended" : e.reason));
      r.newMessages.push(...ctx.newMessages);
    } else if (recaps.length > 1) {
      // Exactly one recap text: extra bubbles fold into the first.
      recaps[0].text = recaps.map((m) => m.text).join(" ");
      recaps[0].guards = [...new Set([...(recaps[0].guards ?? []), "recap bubbles merged into one"])];
      const extra = new Set(recaps.slice(1));
      r.newMessages = r.newMessages.filter((m) => !extra.has(m));
      s.transcript = s.transcript.filter((m) => !extra.has(m));
    }
    const got = [caught.userName && `you go by ${caught.userName}`, caught.helpNeed && `you want help with ${caught.helpNeed}`].filter(Boolean);
    const recap = r.newMessages.find((m) => m.role === "agent" && m.channel === "text" && !m.kind);
    if (got.length && recap) recap.text = `${recap.text.trim()} caught after ${e.reason === "user_hangup" ? "you" : "we"} hung up: ${got.join(", and ")}.`;
    return r;
  },
  silence: async ({ s, idle }) => {
    if (!s.call.active) return idle();
    s.call.silenceStrikes += 1;
    const strike = s.call.silenceStrikes;
    const name = s.slots.userName.value;
    const n = name ? `, ${name}` : "";
    const ctx: Ctx = { s, channel: "voice", actions: [], newMessages: [], move: EVENT_MOVES.silence };
    const out = () => ({ session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "voice").chips, actions: ctx.actions });
    // Quiet is fine, for a long time. The ladder (client waits 25s for the first, 45s after "hold on"):
    // a check-in that picks up where they were, a softer one 30s later, a heads-up at about two minutes,
    // then a goodbye and a hangup 12s after that. Never re-pitches setup, never hangs up without warning.
    if (strike >= MAX_SILENCE_STRIKES) {
      emitAgentText(ctx, `okay, talk soon${name ? ` ${name}` : ""}! i'll text you.`);
      ctx.actions.push({ type: "end_call" });
      return out();
    }
    if (strike === SILENCE_WARN_STRIKE) {
      emitAgentText(ctx, `i haven't heard anything for a bit${n}, so i'll hang up in a few seconds. i'll text you, and you can call me back anytime.`);
      ctx.actions.push({ type: "patience", ms: SILENCE_WARN_GAP_MS });
      return out();
    }
    const need = shortNeed(s);
    const line =
      strike === 1
        ? !heardThemThisCall(s)
          ? `hello${name ? ` ${name}` : ""}? can you hear me okay?`
          : s.call.holding
            ? `still there${n}? no rush.`
            : need
              ? `still thinking about ${need}${n}? no rush.`
              : `no rush${n}. what's on your mind?`
        : `i'm still here${n}, take your time. we can also just text if that's easier.`;
    ctx.actions.push({ type: "patience", ms: strike === 1 ? SILENCE_SECOND_MS : SILENCE_BEFORE_WARN_MS });
    emitAgentText(ctx, line);
    return out();
  },
  text_idle: async ({ s, idle }) => {
    // Left on read over text. A friend doesn't go silent and doesn't nag: at most one easy double text,
    // then quiet until they're back. Silence never names the agent (only answering something else does).
    if (s.call.active) return idle();
    const lastUserIdx = s.transcript.findLastIndex((m) => m.role === "user");
    const since = s.transcript.slice(lastUserIdx + 1);
    const lastAgent = since.findLast((m) => m.role === "agent" && (!m.kind || m.kind === "text"));
    const firstTime = lastUserIdx < 0;
    // Before their first message they may still be reading the intro: only after a real while.
    if (!lastAgent || Date.now() - lastAgent.ts < (firstTime ? IDLE_FIRST_MS : IDLE_MIN_MS)) return idle();
    if (countNudges(since) >= MAX_IDLE_NUDGES) return idle();
    // They signed off ("thanks, bye"), or we already said goodbye: nothing to chase.
    if (!firstTime && saysBye(s.transcript[lastUserIdx].text)) return idle();
    // A call just ended and the recap went out: that text already covers it.
    if (since.some((m) => m.move?.id === "recap" || (m.kind === "event" && m.text.startsWith("Call ended")))) return idle();
    const ctx: Ctx = { s, channel: "text", actions: [], newMessages: [], move: EVENT_MOVES.nudge };
    const name = s.slots.userName.value?.toLowerCase();
    if (firstTime) {
      // One gentle line, no question, no default name: they didn't skip anything, they just haven't started.
      emitAgentText(ctx, `btw no rush${name ? ` ${name}` : ""}, take your time. i'm here whenever you're ready`);
      recordAsk(s, null);
      return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "text").chips, actions: [] };
    }
    // Never three texts in a row without a reply: a two-bubble reply already said enough.
    if (since.filter((m) => m.role === "agent" && (!m.kind || m.kind === "text")).length >= 2) return idle();
    // The link is sitting in their texts: they may be mid sign-in. Give room, no question.
    if (linkPending(s)) {
      // Google blocks non-test accounts on its own page and never reports back, so the way out is offered here.
      const demo = !s.demoOffered;
      s.demoOffered = true;
      emitAgentText(ctx, demo ? `no rush on the google sign in${name ? `, ${name}` : " btw"}. if google gives you trouble, i can use a ${DEMO_MARK} instead` : `no rush on the google sign in${name ? `, ${name}` : " btw"}. the card's right up there whenever you're ready`);
      recordAsk(s, null);
      return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "text").chips, actions: [] };
    }
    // An unanswered call offer: take the pressure off and keep the conversation going over text.
    if (OFFERED_CALL.test(lastAgent.text) && !s.call.active) {
      const q = s.slots.helpNeed.status === "missing" ? " what's been eating your time lately?" : "";
      emitAgentText(ctx, `no pressure on the call${name ? `, ${name}` : " btw"}. texting works just as well.${q}`);
      recordAsk(s, q ? "helpNeed" : null, !!q);
      return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "text").chips, actions: [] };
    }
    // Nothing asked, nothing pending: they're not keeping us waiting, so there's nothing to say.
    if (!/\?\s*$/.test(lastAgent.text.trim())) return idle();
    // Written by code, never the model: a model asked for "a nudge" once narrated instead ("i'll wait for them...").
    // a double text reads like one: "btw" (a person adding a point, not a bot re-pinging)
    emitAgentText(ctx, `btw no rush to respond${name ? ` ${name}` : ""}, i'm available whenever`);
    recordAsk(s, null);
    return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "text").chips, actions: [] };
  },
  draft_edit: async ({ s, e, idle }) => {
    const m = await editDraft(s, e);
    return m ? { ...idle(), newMessages: [m] } : idle();
  },
  draft_discard: async ({ s, idle }) => {
    const m = discardDraft(s);
    return m ? { ...idle(), newMessages: [m] } : idle();
  },
  forget_slot: async ({ s, e, idle }) => {
    const slot = s.slots[e.slot];
    if (!slot.value && slot.status !== "filled") return idle();
    // declined, not missing: forgetting is their call, so it never restarts the asks
    s.slots[e.slot] = { value: null, status: "declined", asks: Math.max(slot.asks, 1), updatedAt: Date.now() };
    if (e.slot === "gmail") {
      // overwrite the stored google tokens so nothing can reach the inbox again (no delete in the store)
      await Promise.all([setSecret(`gtoken:${s.id}`, "", 60), setSecret(`gscope:${s.id}`, "", 60)]).catch(() => {});
      s.gmailEmail = undefined;
      s.gmailVerified = undefined;
      s.gmailUnread = undefined;
      s.alerts = undefined;
    }
    eventMsg(s, `Forgot your ${e.slot === "userName" ? "name" : e.slot === "helpNeed" ? "request" : "Gmail connection"}`);
    return idle();
  },
  contact_saved: async ({ s, idle }) => {
    if (s.contactSaved) return idle();
    s.contactSaved = true;
    // Saving the card is them doing what we asked; if the call offer is still unanswered, pick it back up.
    const lastOffer = s.transcript.findLastIndex((m) => m.role === "agent" && (!m.kind || m.kind === "text") && OFFERED_CALL.test(m.text));
    const answered = lastOffer >= 0 && s.transcript.slice(lastOffer + 1).some((m) => m.role === "user");
    const lastText = s.transcript.findLastIndex((m) => m.role === "agent" && (!m.kind || m.kind === "text"));
    // The offer is still the last thing it said: it's right there, asking again is just noise.
    if (lastOffer < 0 || lastOffer === lastText || answered || s.call.active || s.callDeclinedAt !== undefined || s.phase === "graduated") return idle();
    const ctx: Ctx = { s, channel: "text", actions: [], newMessages: [], move: EVENT_MOVES.named };
    emitAgentText(ctx, "saved, now you'll know it's me. want me to call now?");
    return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "text").chips, actions: [] };
  },
  mic_denied: async ({ s }) => {
    eventMsg(s, "Microphone unavailable");
    s.callOffers = MAX_CALL_OFFERS; // no mic: don't keep offering calls
    s.call = { ...s.call, active: false, endedReason: "error" };
    if (s.phase === "on_call" || s.phase === "call_offered") s.phase = "intro";
    const ctx: Ctx = { s, channel: "text", actions: [], newMessages: [], move: EVENT_MOVES.honest };
    const next = s.slots.userName.status === "missing" ? " what's your name, by the way?" : s.slots.helpNeed.status === "missing" ? " so what's been taking up most of your time lately?" : "";
    emitAgentText(ctx, `looks like your mic isn't coming through, no worries. we can do this over text.${next}`);
    recordAsk(s, next ? (s.slots.userName.status === "missing" ? "userName" : "helpNeed") : null, !!next);
    return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "text").chips, actions: [] };
  },
  gmail_connected: async ({ s, e, idle }) => {
    // Only trust what the oauth callback verified (test runs may pass an email explicitly).
    const v = s.gmailVerified ?? (process.env.ALLOW_TEST_EVENTS === "1" && e.email ? { email: e.email, unread: 7, inbox: DEMO_INBOX } : null);
    if (!v) return idle();
    s.gmailVerified = undefined;
    if (s.slots.gmail.status === "filled" && s.gmailEmail === v.email) return idle();
    s.slots.gmail = { value: v.email, status: "filled", asks: s.slots.gmail.asks, source: s.call.active ? "voice" : "text", updatedAt: Date.now() };
    s.gmailEmail = v.email;
    s.gmailUnread = v.unread;
    eventMsg(s, `Gmail connected: ${v.email}`);
    const demo = "demo" in v && !!v.demo;
    const demoNote = "heads up, this is the demo inbox: sample emails only, and no real email ever leaves it, even when i tell you one did.";
    // They connected to send a draft: that's the next step, the inbox can wait.
    if (s.draft && !s.draft.sent && !s.call.active) {
      const ctx: Ctx = { s, channel: "text", actions: [], newMessages: [], move: EVENT_MOVES.callNow };
      emitAgentText(ctx, (demo ? `${demoNote} ` : "") + (s.draft.to ? `connected. want me to send the draft to ${s.draft.to} now?` : "connected. who should the draft go to? send me their email address."));
      return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "text").chips, actions: [] };
    }
    // Over text, say "connected" now (code, instant) and look through the inbox in the next event: the look
    // is a model call, and a run sat 11s silent until they asked "connected?".
    if (!s.call.active) {
      s.inboxToScan = v.inbox ?? [];
      const ctx: Ctx = { s, channel: "text", actions: [], newMessages: [], move: EVENT_MOVES.honest };
      // The demo inbox acts real later ("sent"), so the one honest line about it is here, up front.
      emitAgentText(ctx, demo ? `${demoNote} looking through it now, one sec` : "connected! looking through your inbox now, one sec");
      recordAsk(s, null);
      return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "text").chips, actions: [{ type: "inbox_scan" }] };
    }
    return scanInbox(s, v.inbox ?? [], false, demo);
  },
  inbox_scan: async ({ s, idle }) => {
    const inbox = s.inboxToScan;
    if (!inbox || s.slots.gmail.status !== "filled") return idle();
    s.inboxToScan = undefined;
    return scanInbox(s, inbox, true);
  },
  gmail_failed: async ({ s, e, idle }) => {
    if (s.slots.gmail.status === "filled") return idle(); // they picked the demo inbox in the popup instead
    const cancelled = /access_denied|cancel/i.test(e.error);
    eventMsg(s, cancelled ? "Gmail connection cancelled" : "Gmail connection didn't finish");
    // Never a dead end: the first time, offer the sample inbox (a denied sign-in is often google's test-user wall, not a no).
    if (!s.demoOffered) {
      s.demoOffered = true;
      const ctx: Ctx = { s, channel: s.call.active ? "voice" : "text", actions: [], newMessages: [], move: EVENT_MOVES.honest };
      emitAgentText(ctx, `${cancelled ? "no worries, gmail's optional." : "hm, that didn't go through, my bad."} ${DEMO_ASK}`);
      recordAsk(s, null, true);
      return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, ctx.channel).chips, actions: ctx.actions };
    }
    return turn(
      s,
      s.call.active ? "voice" : "text",
      cancelled
        ? "They closed the Google screen without connecting. That's a choice, not an error: acknowledge lightly, no pressure, and carry on with whatever they need."
        : `Connecting Gmail didn't complete (${e.error.slice(0, 80)}). Own it lightly, reassure them it's optional and they can retry anytime; don't push.`,
      cancelled ? "no worries, we can skip gmail for now." : "looks like that didn't go through, my bad. it's optional, and the link works whenever.",
    );
  },
};

// The first look through a just-connected inbox: raise one item only if waiting would cost them, else a digest line.
async function scanInbox(s: Session, inbox: InboxItem[], saidConnected = false, demo = false): Promise<TurnResult> {
  {
    rememberEmails(s, inbox);
    const t = await triageInbox(s, inbox);
    let inboxNote: string;
    let fallback: string;
    if (t.interrupt) {
      const it = t.interrupt.item;
      (s.alerts ??= []).push({ id: it.id, category: t.interrupt.category!, reason: t.interrupt.reason, subject: it.subject, from: it.fromName, shownAt: Date.now(), outcome: "pending" });
      inboxNote = `From their unread mail, ONE item is worth raising now: "${it.subject}" from ${it.fromName} (${it.snippet.slice(0, 120)}). Why it matters: ${t.interrupt.reason}. Mention just this one, say briefly why (the evidence), and offer one concrete thing you can do about it. Say the rest can wait for a digest. Don't list other emails.`;
      fallback = `gmail's connected. one thing that looks like it can't wait: "${it.subject}" from ${it.fromName}. want me to draft a reply?`;
    } else {
      inboxNote = `Nothing in their unread mail looks urgent (no deadlines, money issues, or people waiting). Don't list emails or invent any. Just say it's connected and nothing needs them right now; you'll keep the rest for a digest.`;
      fallback = "gmail's connected. nothing urgent in there, i'll keep the rest for a digest.";
    }
    // A promise made while they signed in ("i'll pull the shopping list together once it's done") comes first.
    const waiting = "If you told them you'd do something once it connected (a list, a plan, a draft), deliver it now, in full, before anything else, and give the inbox item one short line after it.";
    // "connected!" already went out (inbox_scan): straight to what's in there
    const demoSaid = demo ? " It's the demo inbox: say once, in a few words, that it's sample mail and nothing really gets sent." : "";
    const said = demoSaid + (saidConnected ? " You already told them it's connected and that you're looking; don't say that again, go straight to what you found." : "");
    return turn(s, s.call.active ? "voice" : "text", `Their Gmail just connected. ${waiting}${said} ${inboxNote}`, saidConnected ? fallback.replace(/^gmail's connected\. /, "") : fallback, t.interrupt ? { move: EVENT_MOVES.interrupt } : {});
  }
}

// Left on read over text: first double text after about 45s (client timer), a lighter one minutes later, then quiet.
export const MAX_IDLE_NUDGES = 1;
export const IDLE_FIRST_MS = 60000; // before their first message: they may still be reading the intro
export const IDLE_MIN_MS = 20000;
// Double texts sent since their last message (a two-bubble nudge counts once).
export function countNudges(msgs: Msg[]) {
  const isNudge = (m?: Msg) => m?.move?.id === "nudge" || m?.move?.id === "default-name";
  return msgs.filter((m, i) => isNudge(m) && !(isNudge(msgs[i - 1]) && m.ts - msgs[i - 1].ts < 5000)).length;
}
