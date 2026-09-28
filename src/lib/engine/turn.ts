import { type Attachment, type Channel, type Msg, type Session, type SlotKey, type TurnResult } from "../types";
import { computeDirective, directiveText, recordAsk, HOLD_MS, MAX_CALL_OFFERS } from "../policy";
import { SYSTEM_PROMPT } from "../prompt";
import { mockReply } from "../mock";
import { provider, runToolLoop, type Part, type Turn } from "../llm";
import { recordOutcome } from "../triage";
import { connectDemo } from "../google";
import { EVENT_MOVES, chooseMove, markUsed, pick, withAngle } from "../moves";
import { applyExtracted, extract } from "../extract";
import { webEnabled } from "../web";
import { teamActive, teamLine, teamLineVoice, teamMatch, teamNote, teamYes, teamYesVoice } from "../team";

import { currentMeter, metered, percentile, recordTurn, type Meter } from "../usage";
import { type Ctx, emitAgentText, ensureCard, goodbyeLine, guard, msg, outageLine } from "./context";
import { CALL_NO, CARD_ASK, LAUGH_LEAD, CARD_WANT, CLEAR_BYE, DELEGATE, firstSentenceName, fixCallTypos, hintedAgentName, ownNameIn, DEMO_YES, GMAIL_TROUBLE, HOLD, INSULT_NAME, LAUGH, NAME_ASK, NAME_HINT, NEGATED_CALL, NOT_A_NAME, NO_CALLS, OFFERED_CALL, OWN_NAME, SEND_CMD, SEND_REQUEST, SENT_Q, SKIP_SETUP, JUST_DO, SIGN_OFF, HANGUP_ASK, DONT_BYE, callbackIn, STOP_TALKING, repliedElsewhere, THANKS, USER_BYE, WAITING_ON_THEM, WANTS_OUT, YES, asTurnBy, asksForLink, gmailConsent, lastUserText, saidNow, saysBye } from "./intents";
import { cleanModelText, dropDraftEcho, dropSelfAck, fence, nowLine, parseTypedEmail } from "./text";
import { GMAIL_ASK_MARK, GUARD_PIPELINE, type TurnOpts, makeGuardEnv, sealGoodbye } from "./guards";
import { LOOKUP_TOOLS, MAX_TOOL_ROUNDS, TERMS_LINK, TOOLS, WEB_TOOLS, gifAllowed, makeGif, runTool, saveDraftTool, sendEmailTool } from "./tools";
import { handleEvent } from "./events";

export const HISTORY_LIMIT = 16; // recent context is what matters; slots and STATE carry the rest (and it keeps each call small)

export const usingMock = () => provider === null;

export function attachmentText(a: Attachment) {
  return `[${a.kind}: ${a.name}${a.summary ? ` | ${a.summary}` : ""}]`;
}

export function toTurns(s: Session): Turn[] {
  const convo = s.transcript.filter((m) => m.role !== "event" && m.kind !== "contact_card").slice(-HISTORY_LIMIT);
  const lastUserIdx = convo.map((m) => m.role).lastIndexOf("user");
  const out: Turn[] = [];
  convo.forEach((m, i) => {
    const role = m.role === "user" ? "user" : "assistant";
    // Two streams: what's said on the call, and what's in the text chat. Label both once a call exists.
    const hadCall = s.call.active || s.transcript.some((x) => x.channel === "voice");
    const prefix = !hadCall ? "" : m.role === "user" ? (m.channel === "voice" ? "(said on the call) " : "(texted in the chat) ") : m.channel === "text" ? "(posted in the chat) " : "";
    let text = m.kind === "gmail_link" ? `${prefix}[the Connect Gmail link card]` : m.kind === "gif" ? `${prefix}[a gif]` : prefix + (m.role === "user" ? fence("user_said", m.text) : m.text);
    if (m.cutOff) text += " [they cut in here; the rest wasn't heard]";
    // replying to one message (swipe / hover "reply"): say which, so "that one" is never a guess
    const q = m.replyTo ? s.transcript.find((x) => x.id === m.replyTo) : undefined;
    if (q) text = `[replying to ${q.role === "agent" ? (/^to:/i.test(q.text) ? "your email draft" : "your message") : "their own earlier message"}: ${JSON.stringify(q.kind === "gif" ? "a gif" : q.text.replace(/\s+/g, " ").slice(0, 200))}] ${text}`;
    if (m.attachments?.length) text += "\n" + m.attachments.map(attachmentText).join("\n");
    const parts: Part[] = [];
    // Only the latest user message carries actual image pixels; older ones use the summary.
    if (i === lastUserIdx) {
      for (const a of m.attachments ?? []) {
        const match = a.kind === "image" && a.dataUrl?.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/);
        if (match) parts.push({ type: "image", mime: match[1], data: match[2] });
      }
    }
    parts.push({ type: "text", text: text || "(empty)" });
    const prev = out[out.length - 1];
    if (prev && prev.role === role) prev.parts.push(...parts);
    else out.push({ role, parts });
  });
  if (out.length === 0 || out[0].role !== "user") out.unshift({ role: "user", parts: [{ type: "text", text: "[chat opened]" }] });
  // APIs need a final user turn; if the agent spoke last (e.g. event-triggered turn), add a nudge.
  if (out[out.length - 1].role !== "user") out.push({ role: "user", parts: [{ type: "text", text: "[no new message]" }] });
  return out;
}

export async function generate(ctx: Ctx, extraInstruction?: string): Promise<string> {
  const { s, channel } = ctx;
  if (!provider) return extraInstruction ? "" : mockReply(ctx, runTool);
  // The directive is computed once per turn; tool effects show up in the next turn's STATE.
  const d = computeDirective(s, channel);
  let state = directiveText(s, d, channel, !extraInstruction);
  if (s.draft && !s.draft.sent) {
    state += `\nUNSENT DRAFT in the chat: to ${s.draft.to || "(no address yet)"}, "${s.draft.subject}". ${s.slots.gmail.status === "filled" ? "They can send it with a clear yes (send_email)." : "Gmail isn't connected, so it can't be sent until they connect."} Never say it was sent unless send_email succeeded.`;
  }
  if (s.lastSent && (!s.draft || s.draft.sent || !s.draft.to)) {
    state += `\nLAST EMAIL SENT: to ${s.lastSent.to}, "${s.lastSent.subject}". If they mean the same person ("him", "her", "them", "again"), use that address in save_draft; don't ask for it. A reply or follow up on it: save_draft with follow_up true (same thread). If they want to edit that one, it's already sent: say so, a new version would be a second email.`;
  }
  // What they typed in the chat can fall out of the history window (a long call's lines push it out): links and
  // addresses always stay in view, and on a call so do their last few texts.
  const typed = s.transcript.filter((m) => m.role === "user" && m.channel === "text");
  const keep = [...new Set([...typed.filter((m) => /https?:\/\/|www\.|\S@\S/.test(m.text)).slice(-4), ...(s.call.active ? typed.slice(-3) : [])])];
  if (keep.length) state += `\nTHEY TYPED IN THE CHAT (recent; "the link i sent" means these): ${keep.map((m) => JSON.stringify(m.text.slice(0, 240))).join(", ")}`;
  const member = teamActive(s);
  if (member) state += `\n${teamNote(member)}`;
  if (extraInstruction) state += `\n\nINSTRUCTION: ${extraInstruction}`;
  if (!extraInstruction || ctx.softInstruction) {
    // One research-backed move per turn, chosen in code, so the principles actually get applied.
    const move = withAngle(s, chooseMove(s, channel, { callFirst: d.callFirst, mayAsk: d.mayAsk }));
    markUsed(s, move.id);
    ctx.move = { id: move.id, label: move.label, source: move.source };
    state += `\n\nMOVE THIS TURN (${move.label}): ${move.instruction}`;
    // Help first: gmail only comes up on its own turn (or if they raise it).
    if (move.id !== "ask-gmail" && s.slots.gmail.status === "missing" && !/\b(gmail|email|inbox|link)\b/i.test(lastUserText(s))) {
      state += "\nNot this turn: don't bring up gmail or a link.";
    }
  }
  state += `\n${nowLine(s.tz)}`;
  if (!webEnabled()) state += "\nNo web access right now: help from memory and say so.";
  const tools = webEnabled() ? TOOLS : TOOLS.filter((t) => !WEB_TOOLS.has(t.name));
  const r = await runToolLoop({ system: SYSTEM_PROMPT, state, turns: toTurns(s), tools, maxRounds: MAX_TOOL_ROUNDS, lookup: LOOKUP_TOOLS }, async (c) => {
    // Our own "error: ..." notes stay bare (the loop keys off that prefix); everything a tool brought back is fenced.
    const out = (await runTool(ctx, c.name, c.input)).replace(/<\/?\s*tool_result\b[^>]*>/gi, "");
    return out.startsWith("error") ? out : `<tool_result name="${c.name}">${out}</tool_result>`;
  });
  if (r.refused) return "hmm, i can't help with that one. anything else on your mind?";
  // It typed an email out instead of using save_draft: save it for it, so "send" has something real to send.
  if (!ctx.shownDraft && ctx.channel === "text") {
    const typed = parseTypedEmail(r.text);
    if (typed) await saveDraftTool(ctx, typed);
  }
  return ctx.shownDraft ? dropDraftEcho(r.text, ctx.shownDraft) : r.text;
}

export const INTRO_CAPABILITIES = [
  "You can text me or call me anytime and I can help with:",
  "📞 calling places on your behalf",
  "💻 browsing the web",
  "🛍️ shopping for you",
  "📩 managing your email and calendar",
  "🚗 finding DoorDash or Uber options",
  "",
  "By continuing to text or use Persona, you agree to our Terms of Service and SMS Terms, and acknowledge our Privacy Policy: yourpersona.com/legal",
].join("\n");

export async function turn(
  s: Session,
  channel: Channel,
  extraInstruction?: string,
  fallback?: string,
  opts: TurnOpts = {},
): Promise<TurnResult> {
  const resendOk = /\b(resend|send (it|the link) again|another link|new link|lost the link)\b/i.test(saidNow(s));
  const ctx: Ctx = { s, channel, actions: [], newMessages: [], resendOk, move: opts.move, allowEnd: !!opts.forceEnd, softInstruction: opts.soft };
  let text = "";
  let failed = false;
  if (s.turnBy === "event" && (USER_BYE.test(lastUserText(s)) || WANTS_OUT.test(lastUserText(s)) || SEND_REQUEST.test(lastUserText(s)))) guard(ctx, "ignored: not user-said");
  try {
    // Model latency: request to full reply, tool rounds included (a failed call isn't timed).
    const t0 = Date.now();
    const raw = await generate(ctx, extraInstruction);
    const meter = currentMeter();
    if (meter) meter.latencyMs = (meter.latencyMs ?? 0) + Date.now() - t0;
    const hits: string[] = [];
    text = cleanModelText(raw, s.slots.userName.value, hits);
    for (const h of hits) guard(ctx, h);
  } catch (err) {
    // Provider down or overloaded: fall through to the scripted line rather than go quiet.
    console.error("llm turn failed", err);
    failed = true;
  }
  // An empty reply (no words, nothing shown) gets one retry before the scripted "say that again?": a run asked
  // "yeah send her an email" and got "sorry, i lost my train of thought" (the model had gone quiet, not down).
  if (!failed && provider && !text.trim() && !ctx.newMessages.some((m) => m.kind !== "contact_card") && ctx.actions.length === 0) {
    try {
      const again = "Your last reply came out empty. Answer their last message now in one or two short sentences. If you need a detail to do what they asked (a time, an address, what to say), ask for just that.";
      const raw = await generate(ctx, [extraInstruction, again].filter(Boolean).join(" "));
      text = cleanModelText(raw, s.slots.userName.value);
      guard(ctx, "empty reply: retried once");
    } catch (err) {
      console.error("llm retry failed", err);
    }
  }
  s.llmFailures = failed ? (s.llmFailures ?? 0) + 1 : 0;
  // A turn that did something (sent the link, a gif, a card) doesn't need "say that again?" beside it.
  // Only things they can see (a link, a gif, a posted message) or a call action count; re-saving a
  // name re-sends the same contact card, which shows nothing new (that once swallowed a recap).
  const didSomething = ctx.newMessages.some((m) => m.kind !== "contact_card") || ctx.actions.length > 0;
  let usedFallback = false;
  if (!text.trim() && fallback && (failed || !didSomething)) {
    usedFallback = true;
    guard(ctx, failed ? "model failed: scripted line" : "empty reply: scripted line");
    // The same "say that again?" on repeat looks broken; after the first miss, be honest about it.
    text = failed && (s.llmFailures ?? 0) > 1 ? outageLine(s, channel) : fallback;
    // On a call, "i'll text you instead" means actually hanging up (with that line as the goodbye).
    // On a call, one failure is a hiccup ("say that again?"); a second means we genuinely can't talk
    // right now: say so once and hang up for real (a final hangup: talking over it can't restart the loop).
    if (failed && channel === "voice" && (s.llmFailures ?? 0) > 1) {
      ctx.actions = ctx.actions.filter((a) => a.type !== "end_call");
      ctx.actions.push({ type: "end_call", final: true });
    }
  }
  // Every post-model safety net, in order (guards.ts). Each names itself in Msg.guards when it changes the reply.
  const env = makeGuardEnv({ ctx, s, channel, text, failed, usedFallback, extraInstruction, fallback, opts });
  for (const step of GUARD_PIPELINE) await step.run(env);
  text = env.text;
  // Ask bookkeeping: credit a question to the slot this turn's move was about (never the fallback line).
  const isQuestion = !usedFallback && text.includes("?");
  const MOVE_SLOT: Record<string, SlotKey> = { "name-me": "agentName", discover: "helpNeed", dig: "helpNeed", offramp: "helpNeed", "ask-name": "userName", "ask-gmail": "gmail" };
  const moveSlot = ctx.move ? MOVE_SLOT[ctx.move.id] : undefined;
  recordAsk(s, isQuestion && moveSlot && s.slots[moveSlot].status === "missing" ? moveSlot : null, isQuestion);
  emitAgentText(ctx, text);
  await Promise.all(ctx.pending ?? []);
  if (ctx.newCard) {
    s.transcript.push(ctx.newCard);
    ctx.newMessages.push(ctx.newCard);
  }
  const final = computeDirective(s, channel);
  return { session: s, newMessages: ctx.newMessages, chips: final.chips, actions: ctx.actions };
}

// Right after the agent asks for its name, a short reply like "Julia" or "call you Max" is the name.
export async function captureAgentName(s: Session, channel: Channel, text: string): Promise<{ card?: Msg; pending: Promise<void>[] } | undefined> {
  // A late name also replaces the "persona" default they got for moving on ("call me", then "luna").
  const renamingDefault = !!s.agentNameDefaulted && s.slots.agentName.value === "Persona";
  if (channel !== "text" || (!renamingDefault && (s.slots.agentName.status !== "missing" || s.lastAskedSlot !== "agentName"))) return;
  // Only as the direct answer to the name question: a later "send" or "help" is never a name.
  // The name question was asked in the last couple of exchanges ("call me" first, then "luna" still answers it).
  const askIdx = s.transcript.findLastIndex((m) => m.role === "agent" && NAME_ASK.test(m.text));
  if (askIdx < 0 || s.transcript.slice(askIdx + 1).filter((m) => m.role === "user").length > 2) return;
  // a Reply to another message ("explain" on the intro) is about that message
  if (repliedElsewhere(s, s.transcript.findLast((m) => m.role === "user")) && !NAME_HINT.test(text)) return;
  // a newer question ("what's up?") means this answers that, not the name
  if (!renamingDefault && !NAME_HINT.test(text) && !nameAskIsNewest(s, s.transcript.findLast((m) => m.role === "user"))) return;
  const own = text.trim().match(OWN_NAME);
  if (own) {
    if (s.slots.userName.status !== "filled") {
      s.slots.userName = { ...s.slots.userName, value: own[1].replace(/^\p{L}/u, (c) => c.toUpperCase()), status: "filled", source: channel, updatedAt: Date.now() };
    }
    return; // the model re-asks what to call the assistant (prompt covers it)
  }
  // Typos like "Ju.lia" or "Ju_lia": drop stray punctuation between letters.
  const m = text.trim().replace(/(\p{L})[.·_*,](?=\p{L})/gu, "$1").match(/^(?:(?:i'?ll |let'?s |i wanna|i want to )?call (?:you|yourself) |how about |go with |name(?: you)?(?: is)? )?([\p{L}][\p{L}'-]{0,19}(?: [\p{L}][\p{L}'-]{0,19})?)[.!]?$/iu);
  if (!m || NOT_A_NAME.test(m[1])) return;
  const value = m[1].replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  const ctx: Ctx = { s, channel, actions: [], newMessages: [] };
  await runTool(ctx, "set_slot", { slot: "agentName", value });
  // A rename updates the one card in place; it still goes out again so they see the new name.
  return { card: ctx.newCard ?? ctx.newMessages.find((x) => x.kind === "contact_card"), pending: ctx.pending ?? [] };
}

const ISNT_NAME = /\b(isn'?t|is not|ain'?t|not)\s+(my|your|ur|a|the)?\s*name\b/i;
const NOT_NAME_FIX = /\b(don'?t|do not|dont)\b[^.?!]{0,12}\b(save|pick|give|set|use|take)\b[^.?!]{0,25}\bname\b|\bthat'?s not (your|ur) name\b/i;

// A reply names us for sure only as the direct answer: right after the message that asked, or a Reply to it.
// Anything else ("what's up?" came in between) could be answering something else.
export function nameAskIsNewest(s: Session, userMsg?: Msg) {
  if (userMsg?.replyTo) {
    const q = s.transcript.find((m) => m.id === userMsg.replyTo);
    return !!q && q.role === "agent" && NAME_ASK.test(q.text);
  }
  const before = userMsg ? s.transcript.slice(0, s.transcript.indexOf(userMsg)) : s.transcript;
  const prev = before.findLast((m) => m.role !== "event" && (!m.kind || m.kind === "text"));
  return !!prev && prev.role === "agent" && NAME_ASK.test(prev.text);
}

export const USER_NAME_ASK = /\b(what'?s your name|what is your name|what (should|do|can) i call you|who am i (talking|texting) (to|with)|your name\?)/i;
const MINE = /\b(my name|that'?s me|it'?s me|i'?m|i am|mine|me)\b/i;
const YOURS = /\b(call you|your name|for you|name you|you'?re|you are|yours|you)\b/i;
const titled = (v: string) => v.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

export async function nameAmbiguity(s: Session, channel: Channel, text: string, userMsg: Msg): Promise<TurnResult | null> {
  if (channel !== "text" || s.call.active) return null;
  const out = (ctx: Ctx): TurnResult => ({ session: s, newMessages: [userMsg, ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: [] });
  const ctx: Ctx = { s, channel, actions: [], newMessages: [], move: EVENT_MOVES.named };
  // "not much isn't your name" / "don't save a name for yourself yet": undo it, card and all, and ask properly.
  const named = s.slots.agentName.value;
  if (named && !s.agentNameDefaulted && (NOT_NAME_FIX.test(text) || (text.toLowerCase().includes(named.toLowerCase()) && ISNT_NAME.test(text)))) {
    s.slots.agentName = { value: null, status: "missing", asks: s.slots.agentName.asks };
    s.transcript = s.transcript.filter((m) => m.kind !== "contact_card");
    s.nameCheck = undefined;
    emitAgentText(ctx, "got it, scratch that, my bad. no name yet. whenever you want to pick one, just tell me what to call me.");
    guard(ctx, "unsaved a name they said wasn't one");
    recordAsk(s, null);
    return out(ctx);
  }
  // A Reply to some other message ("explain" on the intro) is about that message, never a name.
  if (repliedElsewhere(s, userMsg)) return null;
  // The same name as ours, two separate cases (never a silent no-op or "persona instead of persona?").
  const current = s.slots.agentName.status === "filled" ? s.slots.agentName.value : null;
  if (current && !s.nameCheck) {
    const lower = current.toLowerCase();
    const word = text.trim().replace(/[.!?]+$/, "").toLowerCase();
    const lastQ = s.transcript.slice(0, s.transcript.indexOf(userMsg)).findLast((m) => m.role === "agent" && (!m.kind || m.kind === "text"));
    // their own name is ours ("my name is persona", or "persona" to "what's your name?"): check, it's odd
    const theirs = ownNameIn(text) ?? (lastQ && USER_NAME_ASK.test(lastQ.text) && word === lower ? current : null);
    if (theirs?.toLowerCase() === lower) {
      s.nameCheck = { value: current, as: "same" };
      emitAgentText(ctx, `wait, your name's ${lower} too? so we have the same name?`);
      guard(ctx, "asked: their name is the same as ours");
      return out(ctx);
    }
    // renaming it to what it's already called ("call you persona", or "persona" answering the name question)
    const rename = hintedAgentName(text) ?? (word === lower && (nameAskIsNewest(s, userMsg) || s.agentNameDefaulted) ? current : null);
    if (rename?.toLowerCase() === lower) {
      emitAgentText(ctx, "lol that's already my name");
      guard(ctx, "renamed to its current name: said so");
      recordAsk(s, null);
      return out(ctx);
    }
  }
  // Their answer to "is rowan your name, or what you'd like to call me?"
  const check = s.nameCheck;
  if (check) {
    s.nameCheck = undefined;
    // "so we have the same name?": yes, it's theirs too; no, ask theirs
    if (check.as === "same") {
      if (/^\s*(yes|yeah|yea|ye|yep|yup|ya|sure|correct|right|mhm|lol yes|haha yes|lol yeah|haha yeah)\b/i.test(text)) {
        s.slots.userName = { ...s.slots.userName, value: check.value, status: "filled", source: channel, updatedAt: Date.now() };
        emitAgentText(ctx, `ha, twins then. nice to meet you, ${check.value.toLowerCase()}`);
        recordAsk(s, null);
        return out(ctx);
      }
      if (/^\s*(no|nah|nope|lol no|haha no|jk|just kidding)\b/i.test(text) && text.trim().split(/\s+/).length <= 3) {
        emitAgentText(ctx, "haha ok, so what's your name?");
        recordAsk(s, "userName");
        return out(ctx);
      }
      return null;
    }
    // "is 'not much' what you want to call me?": yes names it, no asks again
    if (check.as === "confirm") {
      if (/^\s*(yes|yeah|yep|yup|ya|sure|correct|right|mhm|lol yes|haha yes)\b/i.test(text)) {
        await runTool(ctx, "set_slot", { slot: "agentName", value: check.value });
        await Promise.all(ctx.pending ?? []);
        emitAgentText(ctx, `${nameAck(check.value)} save my contact card so you know it's me`);
        if (ctx.newCard) {
          s.transcript.push(ctx.newCard);
          ctx.newMessages.push(ctx.newCard);
        }
        recordAsk(s, null);
        return out(ctx);
      }
      // a bare "no" asks again; "no explain the message i replied to" is a request: the model answers it
      if (/^\s*(no|nah|nope|not really|lol no|haha no)\b/i.test(text) && text.trim().split(/\s+/).length <= 3) {
        emitAgentText(ctx, "haha no worries. so what do you want to call me?");
        recordAsk(s, "agentName");
        return out(ctx);
      }
      return null;
    }
    const mine = MINE.test(text) && !/\bcall you\b/i.test(text);
    const yours = YOURS.test(text) && !/\bmy name\b/i.test(text);
    if (check.as === "user" && yours && !mine) {
      s.slots.userName = { value: null, status: "missing", asks: s.slots.userName.asks };
      await runTool(ctx, "set_slot", { slot: "agentName", value: check.value });
      await Promise.all(ctx.pending ?? []);
      emitAgentText(ctx, `got it, ${nameAck(check.value)} save my contact card so you know it's me. and what's your name?`);
      if (ctx.newCard) {
        s.transcript.push(ctx.newCard);
        ctx.newMessages.push(ctx.newCard);
      }
      recordAsk(s, "userName");
      return out(ctx);
    }
    if (check.as === "agent" && mine && !yours) {
      s.slots.agentName = { value: null, status: "missing", asks: s.slots.agentName.asks };
      s.transcript = s.transcript.filter((m) => m.kind !== "contact_card");
      s.slots.userName = { ...s.slots.userName, value: check.value, status: "filled", source: channel, updatedAt: Date.now() };
      emitAgentText(ctx, `got it, nice to meet you ${check.value.toLowerCase()}. so what do you want to call me?`);
      recordAsk(s, "agentName");
      return out(ctx);
    }
    // "yeah my name": theirs it is, and the question about us is still open
    if (check.as === "user" && (mine || /^\s*(yes|yeah|yep|yup|ya|correct|right|mhm)\b/i.test(text))) {
      emitAgentText(ctx, `got it, ${check.value.toLowerCase()}. so what do you want to call me?`);
      recordAsk(s, "agentName");
      return out(ctx);
    }
    return null; // a yes to "that's what i call you", or something else: the lean stands, carry on
  }
  // A bare name ("rowan"), not "i'm rowan" or "call you rowan": those already say which.
  if (OWN_NAME.test(text.trim()) || NAME_HINT.test(text)) return null;
  const bare = text.trim().match(/^([\p{L}][\p{L}'-]{0,19}(?: [\p{L}][\p{L}'-]{0,19})?)[.!]?$/u)?.[1];
  if (!bare || NOT_A_NAME.test(bare)) return null;
  // A one-word answer to the name question is a name. Anything longer ("not much", "mary jane") could be a name
  // or an answer to something else: ask, don't assume.
  if (s.slots.agentName.status === "missing" && !userMsg.replyTo && nameAskIsNewest(s, userMsg) && /\s/.test(bare)) {
    s.nameCheck = { value: titled(bare), as: "confirm" };
    emitAgentText(ctx, `haha wait, is "${bare.toLowerCase()}" what you want to call me?`);
    guard(ctx, "asked before taking an odd answer as its name");
    return out(ctx);
  }
  // Both still open: each asked within their last couple of replies, neither answered yet.
  const lastUser = s.transcript.findLastIndex((m) => m.role === "user" && m !== userMsg);
  const agentAsk = s.transcript.findLastIndex((m) => m.role === "agent" && NAME_ASK.test(m.text));
  const userAsk = s.transcript.findLastIndex((m) => m.role === "agent" && USER_NAME_ASK.test(m.text));
  const recent = (i: number) => i >= 0 && s.transcript.slice(i + 1).filter((m) => m.role === "user" && m !== userMsg).length <= 2;
  const bothOpen = s.slots.agentName.status === "missing" && s.slots.userName.status !== "filled" && recent(agentAsk) && recent(userAsk) && Math.max(agentAsk, userAsk) >= lastUser;
  if (!bothOpen) {
    // A lone name-like word, but not as the direct answer to our name question (something else was said in
    // between, and it isn't a Reply to that question): it might be naming us, so ask instead of assuming.
    const unnamed = s.slots.agentName.status === "missing" || (s.agentNameDefaulted && s.slots.agentName.value === "Persona");
    // only while the name question is fresh: once it has a name (even the default), a stray word later
    // ("ye" to "send it?") is never a rename. Renaming then takes a Reply to the name question or "call you x".
    // "persona" when it already goes by persona: nothing to check ("go by persona instead of persona?")
    const same = bare.toLowerCase() === (s.slots.agentName.value ?? "").toLowerCase();
    if (unnamed && !same && recent(agentAsk) && !/\s/.test(bare) && !nameAskIsNewest(s, userMsg)) {
      const v = titled(bare);
      s.nameCheck = { value: v, as: "confirm" };
      emitAgentText(ctx, s.agentNameDefaulted ? `want me to go by ${v.toLowerCase()} instead of persona?` : `wait, is ${v.toLowerCase()} what you want to call me?`);
      guard(ctx, "asked before taking a name that wasn't the direct answer");
      return out(ctx);
    }
    return null;
  }
  const value = titled(bare);
  if (userAsk > agentAsk) {
    s.slots.userName = { ...s.slots.userName, value, status: "filled", source: channel, updatedAt: Date.now() };
    s.nameCheck = { value, as: "user" };
    emitAgentText(ctx, `nice to meet you, ${value.toLowerCase()}! quick check: is ${value.toLowerCase()} your name, or what you'd like to call me?`);
    guard(ctx, "asked which name it was (both name questions were open)");
    return out(ctx);
  }
  await runTool(ctx, "set_slot", { slot: "agentName", value });
  await Promise.all(ctx.pending ?? []);
  s.nameCheck = { value, as: "agent" };
  emitAgentText(ctx, `${nameAck(value)} quick check though: is that what you'd like to call me, or is ${value.toLowerCase()} your name?`);
  if (ctx.newCard) {
    s.transcript.push(ctx.newCard);
    ctx.newMessages.push(ctx.newCard);
  }
  guard(ctx, "asked which name it was (both name questions were open)");
  return out(ctx);
}

export async function handleUserMessage(...args: Parameters<typeof handleUserMessageInner>): Promise<TurnResult> {
  const [s, channel, text] = args;
  // easter egg follow up: a yes to "is this THE zach?" (anything else just moves on)
  const guess = s.teamGuess;
  if (guess && !(s.teamYes ?? []).includes(guess) && s.transcript.findLast((m) => m.role === "agent" && (!m.kind || m.kind === "text"))?.move?.id === "team") {
    if (YES.test(text.replace(LAUGH_LEAD, "")) || /\b(it'?s me|that'?s me|the one|in the flesh|guilty)\b/i.test(text)) (s.teamYes ??= []).push(guess);
  }
  const justMet = !!guess && (s.teamYes ?? []).includes(guess) && !(s.teamGreetedFor ?? []).includes(guess);
  if (justMet) (s.teamGreetedFor ??= []).push(guess);
  const [r, meter] = await metered(async () => sealGoodbye(s, await asTurnBy(s, "user", () => handleUserMessageInner(...args))));
  noteMetrics(s, meter);
  // their name is on the persona team: "woah, is this THE zach?" in place of this turn's words (cards, links,
  // a ringing call or a send stay; then it's back to normal)
  // a yes to "is this THE zach?": a code-written "no way" first (a run's model skipped straight to the call offer)
  if (justMet && guess) {
    const ctx: Ctx = { s, channel: s.call.active ? "voice" : channel, actions: [], newMessages: [], move: { id: "team", label: "a familiar name", source: "easter egg" } };
    emitAgentText(ctx, ctx.channel === "voice" ? teamYesVoice(guess) : teamYes(guess));
    const [m] = ctx.newMessages;
    const first = r.newMessages.findIndex((x) => x.role === "agent");
    s.transcript.splice(s.transcript.indexOf(m), 1);
    const at = first >= 0 ? s.transcript.indexOf(r.newMessages[first]) : -1;
    s.transcript.splice(at >= 0 ? at : s.transcript.length, 0, m);
    r.newMessages.splice(first >= 0 ? first : r.newMessages.length, 0, m);
    r.actions.unshift(...ctx.actions);
  }
  const key = teamMatch(s);
  if (key) {
    // a new name ("actually i'm julia") is a new ask; a yes stays with its name (back to zach: still zach)
    (s.teamAsked ??= []).push(key);
    s.teamGuess = key;
    const busy = r.actions.some((a) => a.type === "start_call" || a.type === "end_call") || !!s.lastSent;
    const words = busy ? [] : r.newMessages.filter((m) => m.role === "agent" && (!m.kind || m.kind === "text") && !m.move?.id?.startsWith("default"));
    s.transcript = s.transcript.filter((m) => !words.includes(m));
    r.newMessages = r.newMessages.filter((m) => !words.includes(m));
    if (words.length) r.actions = r.actions.filter((a) => a.type !== "speak");
    const ctx: Ctx = { s, channel: s.call.active ? "voice" : channel, actions: [], newMessages: [], move: { id: "team", label: "a familiar name", source: "easter egg" } };
    emitAgentText(ctx, ctx.channel === "voice" ? teamLineVoice(key) : teamLine(key));
    r.newMessages.push(...ctx.newMessages);
    r.actions.push(...ctx.actions);
  }
  // "what do you know about me": the what-i-know card answers it (it's never shown unasked after setup).
  if (args[1] === "text" && KNOW_ASK.test(args[2])) r.actions = [...(r.actions ?? []), { type: "show_know" }];
  return r;
}

const utter = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
export function mergeGrowingUtterance(s: Session, text: string) {
  const i = s.transcript.findLastIndex((m) => m.role === "user");
  const prev = s.transcript[i];
  if (!prev || prev.channel !== "voice" || prev.attachments?.length || Date.now() - prev.ts > 90_000) return;
  const was = utter(prev.text);
  if (was.length < 8 || !utter(text).startsWith(was)) return;
  const gone = [i, ...s.transcript.flatMap((m, k) => (k > i && m.role === "agent" && m.channel === "voice" && !m.kind && m.cutOff && m.text.trim() === "..." ? [k] : []))];
  s.transcript = s.transcript.filter((_, k) => !gone.includes(k));
  // positions stored as transcript lengths shift with it
  const shift = (n: number) => n - gone.filter((k) => k < n).length;
  if (s.draft) {
    s.draft.shownAt = shift(s.draft.shownAt);
    if (s.draft.dupWarnedAt !== undefined) s.draft.dupWarnedAt = shift(s.draft.dupWarnedAt);
  }
  if (s.lastSent) s.lastSent.at = shift(s.lastSent.at);
  if (s.callDeclinedAt !== undefined) s.callDeclinedAt = shift(s.callDeclinedAt);
}

// "no like talking to u, not uy": they fixed a typo in what they said, so what we saved from it gets the fix too
// (the need stayed "talking to uy" and the recap repeated it).
export function fixTypoInNeed(s: Session, text: string) {
  const need = s.slots.helpNeed.value;
  const m = text.match(/([\p{L}\p{N}'-]+)\s*,?\s+not\s+["']?([\p{L}\p{N}'-]+)["']?\s*[.!]?\s*$/iu);
  if (!need || !m) return;
  const [, right, wrong] = m;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${wrong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu");
  if (right.toLowerCase() === wrong.toLowerCase() || !re.test(need)) return;
  s.slots.helpNeed = { ...s.slots.helpNeed, value: need.replace(re, right), updatedAt: Date.now() };
}

export const KNOW_ASK = /\bwhat (do|did|have) you (know|remember|got|saved|learned)( so far)? (about|on|of) me\b|\bwhat('?s| is) (my profile|saved about me)\b|\bshow me what you know\b/i;

// Fold one turn's meter into the session's running numbers (and the dev ledger for `pnpm metrics`).
export function noteMetrics(s: Session, m: Meter) {
  if (!m.calls && m.latencyMs === undefined) return;
  const x = (s.metrics ??= { turns: 0, cost: 0, p50: 0, p95: 0, latencies: [], models: {} });
  x.cost = Math.round((x.cost + m.cost) * 1e6) / 1e6;
  if (m.latencyMs !== undefined) {
    x.turns += 1;
    x.latencies = [...x.latencies, m.latencyMs].slice(-100);
    x.p50 = percentile(x.latencies, 50);
    x.p95 = percentile(x.latencies, 95);
    const model = m.model ?? (provider ? `${provider} (unmetered)` : "mock");
    x.models[model] = (x.models[model] ?? 0) + 1;
    x.last = { model, latencyMs: m.latencyMs, cost: m.cost };
    void recordTurn({ ts: Date.now(), session: s.id, model, latencyMs: m.latencyMs, cost: m.cost, calls: m.calls });
  }
}

export async function handleUserMessageInner(
  s: Session,
  channel: Channel,
  text: string,
  attachments?: Attachment[],
  interrupted?: boolean,
  clientId?: string,
  heardBefore?: string,
  replyTo?: string,
): Promise<TurnResult> {
  // Curly apostrophes (phones type them) broke every "that's all" / "don't" check.
  const clean = text.slice(0, 4000).replace(/[‘’]/g, "'");
  // They cut the agent off: its history should hold only what they actually heard, so it never
  // assumes they got the rest ("as i said...").
  if (interrupted && heardBefore !== undefined && channel === "voice") {
    const last = [...s.transcript].reverse().find((m) => m.role === "agent" && m.channel === "voice" && !m.kind);
    // What shows on screen is just what they heard (with "..."); the note for the model lives in its own field.
    if (last && heardBefore.trim().length < last.text.length) {
      last.text = heardBefore.trim() ? `${heardBefore.trim()}...` : "...";
      last.cutOff = true;
    }
  }
  // After a barge-in the call re-sends the whole utterance so far ("email natasha" -> "email natasha. i'll paste
  // a link"): one message, not six, and replies cut off before a word was heard ("...") go with it. Six copies
  // pushed a pasted link out of the model's history once.
  if (channel === "voice") mergeGrowingUtterance(s, clean);
  // The client shows the message instantly under its own id; reuse it so there's no duplicate.
  // a reply to one message: only one that's really in this conversation
  const quoted = replyTo && s.transcript.some((m) => m.id === replyTo && m.role !== "event") ? replyTo : undefined;
  const userMsg = msg("user", channel, clean, { ...(attachments?.length ? { attachments } : {}), ...(clientId ? { id: clientId } : {}), ...(quoted ? { replyTo: quoted } : {}) });
  s.transcript.push(userMsg);
  recordOutcome(s, clean); // did they act on the last interruption, or wave it off?
  fixTypoInNeed(s, clean);
  // A real answer ("mostly applying to jobs and schoolwork") pays for the question: the next turn can
  // respond AND move things forward. Without this, a call went "yeah, that's a lot." and died.
  if (clean.trim().split(/\s+/).length >= 5) s.consecutiveAsks = 0;
  // "no, text is fine" right after we offered a call: same as declining the ring.
  const prevAgent = [...s.transcript].slice(0, -1).reverse().find((m) => m.role === "agent" && (!m.kind || m.kind === "text"));
  // "no calls lol i hate phone calls", said anytime (not just after an offer): never ring or offer one
  // again unless they ask for a call themselves later.
  const refusesCalls = NO_CALLS.test(clean) && !/\b(you can|now you can|ok(ay)? (you can )?call|call me (now|back))\b/i.test(clean);
  if (channel === "text" && !s.call.active && (refusesCalls || (prevAgent && OFFERED_CALL.test(prevAgent.text) && CALL_NO.test(clean) && !/\b(sure|yes|yeah|ok)\b/i.test(clean)))) {
    s.callOffers = MAX_CALL_OFFERS;
    s.callDeclinedAt = s.transcript.length;
    s.call = { ...s.call, endedReason: "declined" };
    if (s.phase === "call_offered") s.phase = "intro";
  }
  if (channel === "voice") {
    s.call.silenceStrikes = 0;
    // "hold on a sec": a person just says "sure" and waits; no questions, no check-ins for a while.
    if (HOLD.test(clean) && clean.split(/\s+/).length <= 8) {
      s.call.holding = true;
      const ctx: Ctx = { s, channel, actions: [{ type: "patience", ms: HOLD_MS }], newMessages: [], move: EVENT_MOVES.silence };
      emitAgentText(ctx, "sure, take your time.");
      return { session: s, newMessages: [userMsg, ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: ctx.actions };
    }
    // "stop talking" / "shh": yield. No words back (not even "ok i'll stop"), and a long quiet before any check-in.
    if (STOP_TALKING.test(clean)) {
      s.call.holding = true;
      const ctx: Ctx = { s, channel, actions: [{ type: "patience", ms: 90000 }], newMessages: [], move: EVENT_MOVES.silence };
      guard(ctx, "yielded: they said stop");
      return { session: s, newMessages: [userMsg], chips: computeDirective(s, channel).chips, actions: ctx.actions };
    }
    // "i'll let you know once it's connected": they're off doing something, so wait like after "hold on".
    s.call.holding = WAITING_ON_THEM.test(clean);
    // "hang up and call me back in a few" / "i'm busy right now": do it. A short goodbye, hang up, ring back when
    // asked. A run argued ("actually, i'll stay on"), pitched gmail, then filled the silence with "no rush".
    if (s.call.active && HANGUP_ASK.test(clean) && !DONT_BYE.test(clean) && !/\b(not|isn'?t) (busy|a bad time)\b/i.test(clean)) {
      const name = s.slots.userName.value?.toLowerCase();
      const ms = callbackIn(clean);
      const when = ms ? (ms < 90_000 ? "in a minute" : `in about ${Math.round(ms / 60_000)} minutes`) : null;
      const back = /\b(call|ring) me back\b|\bcall back\b/i.test(clean);
      const ctx: Ctx = { s, channel, actions: [], newMessages: [], move: EVENT_MOVES.recap };
      emitAgentText(ctx, when ? `of course${name ? `, ${name}` : ""}. i'll call you back ${when}. talk soon!` : back ? `of course${name ? `, ${name}` : ""}. i'll text you, and we can talk whenever you're free.` : `no problem${name ? `, ${name}` : ""}, i'll let you go. talk soon!`);
      guard(ctx, "hung up when asked");
      s.callbackAt = ms ? Date.now() + ms : undefined;
      ctx.actions.push({ type: "end_call", final: true });
      if (ms) ctx.actions.push({ type: "ring_later", ms });
      return { session: s, newMessages: [userMsg, ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: ctx.actions };
    }
    // They said bye: say it back (always, and audibly), then hang up. No model, nothing to go wrong.
    if (saysBye(clean, CLEAR_BYE) && clean.split(/\s+/).length <= 12 && s.call.active) {
      const name = s.slots.userName.value;
      const ctx: Ctx = { s, channel, actions: [], newMessages: [], move: EVENT_MOVES.recap };
      emitAgentText(ctx, `okay, bye${name ? ` ${name}` : ""}! i'll text you a quick recap.`);
      ctx.actions.push({ type: "end_call", final: true });
      return { session: s, newMessages: [userMsg, ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: ctx.actions };
    }
  }
  // Both name questions open ("what do you want to call me?", later "what's your name?") and a bare name back:
  // lean to the newest question, and ask which they meant.
  const unsure = await nameAmbiguity(s, channel, clean, userMsg);
  if (unsure) return unsure;
  // Name reply safety net: models sometimes say "julia it is" without saving it.
  const named = await captureAgentName(s, channel, clean);
  // A second pass reads the message for names, needs and refusals while the reply is written.
  const heard = extract(s, clean);
  // "call you nova, and can you check my email": the name and its contact card come first, then the rest.
  const early = named ? null : await nameFirst(s, channel, clean, heard);
  // Pure laughter or thanks, over text, when a gif is allowed: answer with one.
  if (channel === "text" && !s.call.active && (LAUGH.test(clean) || THANKS.test(clean)) && gifAllowed(s)) {
    const gif = makeGif(s, LAUGH.test(clean) ? "lol" : "ok");
    s.transcript.push(gif);
    recordAsk(s, null);
    return { session: s, newMessages: [userMsg, ...(early?.msgs ?? []), gif], chips: computeDirective(s, channel).chips, actions: [] };
  }
  // They just named the assistant: answer the way persona does, instantly, no model needed.
  if (named?.card && channel === "text" && s.callOffers === 0 && !s.call.active) {
    const name = s.slots.agentName.value!;
    s.callOffers = 1;
    if (s.phase === "intro") s.phase = "call_offered";
    recordAsk(s, null);
    const ctx: Ctx = { s, channel, actions: [], newMessages: [], move: EVENT_MOVES.named };
    emitAgentText(ctx, `${nameAck(name)} save my contact card so you know it's me\n\nwant me to give you a quick call to get you set up? way easier than typing it all out`);
    s.transcript.push(named.card);
    ctx.newMessages.push(named.card);
    await Promise.all(named.pending);
    return { session: s, newMessages: [userMsg, ...(early?.msgs ?? []), ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: [] };
  }
  // "send me the contact card" / "it's not there": post it again, in code (the model once claimed it had,
  // then offered to draft an email). The old card moves down instead of duplicating (one card per session).
  if (CARD_ASK.test(clean) && CARD_WANT.test(clean) && s.slots.agentName.value) {
    const ctx: Ctx = { s, channel: "text", actions: [], newMessages: [], move: EVENT_MOVES.honest };
    s.transcript = s.transcript.filter((m) => m.kind !== "contact_card");
    const card = msg("agent", "text", s.slots.agentName.value, { kind: "contact_card" });
    emitAgentText(ctx, "here it is. tap it to save me so you know it's me when i call.");
    s.transcript.push(card);
    ctx.newMessages.push(card);
    guard(ctx, "contact card resent in code");
    const spoken: Msg[] = [];
    if (s.call.active && channel === "voice") {
      const v: Ctx = { s, channel: "voice", actions: [], newMessages: [] };
      emitAgentText(v, "just sent my contact card to our texts.");
      spoken.push(...v.newMessages);
    }
    recordAsk(s, null);
    return { session: s, newMessages: [userMsg, ...(early?.msgs ?? []), ...ctx.newMessages, ...spoken], chips: computeDirective(s, channel).chips, actions: [] };
  }
  // They said yes to our call offer: ring now, the way persona does ("calling you now."), no model needed.
  const prevText = [...s.transcript].slice(0, -1).reverse().find((m) => m.role === "agent" && (!m.kind || m.kind === "text"));
  // Asking for a call is the answer; no need to confirm it back ("could we call?" -> ring).
  const callText = fixCallTypos(clean);
  const asksForCall =
    /\b(call me(?=\s*($|[.!?,]|(now|back|please|pls|plz|asap|right now|real quick|quick|when|whenever|anytime|later|today|tomorrow|so|and|if|then)\b))|(can|could|should|shall) (we|you) (hop on a call|do a call)|(can|could|should|shall) (we|you) (call|ring)(?=\s*($|[.!?,]|(now|real quick|quick|please|pls|asap)\b))|let'?s (call|hop on a call|do a call)|give me a (call|ring)|ring me|phone me|hop on a (quick )?call|(you|u) (can|could|may) (call|ring|phone) (my (phone|cell|number)|me(?=\s*($|[.!?,]|(now|right now|back|anytime|whenever)\b)))|call my (phone|cell|number)|(feel free|go ahead) (to|and) (call|ring)( me| my (phone|cell))?)\b/i.test(callText) &&
    !NEGATED_CALL.test(callText);
  // A short yes ("sure", "yeah call me") is a yes; "yes but u aren't listening..." is not (it rang once).
  const saidYesToOffer = !!prevText && OFFERED_CALL.test(prevText.text) && YES.test(clean.replace(LAUGH_LEAD, "")) && !/\bbut\b/i.test(clean) && (clean.trim().split(/\s+/).length <= 4 || /\b(call|ring)\b/i.test(clean));
  // "call me" instead of a name: they moved on without naming it, so it goes by the default (with its card).
  const defaultForCall = channel === "text" && !s.call.active && asksForCall && !CALL_NO.test(clean) && s.slots.agentName.status === "missing" && s.lastAskedSlot === "agentName";
  if (defaultForCall) defaultAgentName(s);
  if (channel === "text" && !s.call.active && s.slots.agentName.status !== "missing" && (asksForCall || saidYesToOffer) && !CALL_NO.test(clean)) {
    const ctx: Ctx = { s, channel, actions: [], newMessages: [], move: EVENT_MOVES.callNow };
    if (defaultForCall) emitAgentText({ ...ctx, move: EVENT_MOVES.defaultName }, SKIPPED_NAME_REPLY);
    const out = await runTool(ctx, "start_call", {});
    if (!out.startsWith("error")) {
      recordAsk(s, null);
      // "i'm krish, call me": take their name too, and say it, before ringing.
      const e = await heard.catch(() => null);
      const hadName = s.slots.userName.status === "filled";
      if (e) await applyExtracted(s, { ...e, agentName: null }, async () => {});
      const name = !hadName && s.slots.userName.status === "filled" ? s.slots.userName.value : null;
      ensureCard(ctx);
      // "...send me the gmail link, and call me": everything in one message still gets everything
      const linkToo = s.slots.gmail.status === "missing" && asksForLink(clean) && !(await runTool(ctx, "send_gmail_link", {})).startsWith("error");
      if (linkToo) emitAgentText(ctx, "there's the gmail link, tap it whenever.");
      const ring = pick(s, "call-now", ["sure, calling you now. it'll be quick and help get you set up.", "calling you now. quick one, just to get you set up.", "on it, calling you now. it won't take long."]);
      emitAgentText(ctx, name ? `nice to meet you ${name}! ${ring}` : ring);
      return { session: s, newMessages: [userMsg, ...(early?.msgs ?? []), ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: ctx.actions };
    }
  }
  // "send" / "did you send it?" with a draft waiting: answered in code, so it's never vague about what happened.
  const pendingDraft = channel === "text" && !s.call.active && s.draft && !s.draft.sent ? s.draft : null;
  if (channel === "text" && s.draft?.sent && SENT_Q.test(clean)) {
    const ctx: Ctx = { s, channel, actions: [], newMessages: [], move: EVENT_MOVES.honest };
    emitAgentText(ctx, `yep, it went to ${s.draft.to}.`);
    return { session: s, newMessages: [userMsg, ...(early?.msgs ?? []), ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: [] };
  }
  // "yes" right after "want me to send the draft to x?" counts too.
  const sendCmd = SEND_CMD.test(clean) || (YES.test(clean) && clean.split(/\s+/).length <= 4 && !!prevAgent && /\bsend\b[^?]*\?/i.test(prevAgent.text));
  if (pendingDraft && (sendCmd || SENT_Q.test(clean))) {
    const ctx: Ctx = { s, channel, actions: [], newMessages: [], move: EVENT_MOVES.honest };
    if (s.slots.gmail.status !== "filled") {
      const hasCard = s.transcript.some((m) => m.kind === "gmail_link");
      emitAgentText(ctx, `${sendCmd ? "not sent yet" : "no, not yet"}: i need your gmail connected to send it. ${hasCard ? "tap the \"connect your google account\" card" : "here's the link, one tap"} and i'll send it right after.`);
      if (!hasCard) {
        ctx.resendOk = true;
        const link = msg("agent", "text", "Connect your Google account", { kind: "gmail_link" });
        ctx.newMessages.push(link);
        s.transcript.push(link);
      }
    } else if (sendCmd) {
      const out = await sendEmailTool(ctx);
      emitAgentText(ctx, out.startsWith("sent") ? `sent to ${pendingDraft.to}.` : pendingDraft.to ? `couldn't send it: ${out.replace(/^error: /, "").split(".")[0]}.` : "who should it go to? send me their email address.");
    } else {
      emitAgentText(ctx, `no, not yet. want me to send it to ${pendingDraft.to || "them"}?`);
    }
    recordAsk(s, null);
    return { session: s, newMessages: [userMsg, ...(early?.msgs ?? []), ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: ctx.actions };
  }
  // "send me the terms link": that's the legal page, not gmail (a run sent the gmail link three times).
  if (TERMS_LINK.test(clean)) {
    const ctx: Ctx = { s, channel, actions: [], newMessages: [], move: EVENT_MOVES.honest };
    const card = msg("agent", "text", "yourpersona.com/legal", { kind: "link_preview" });
    if (channel === "voice") {
      s.transcript.push(card);
      ctx.newMessages.push(card);
      emitAgentText(ctx, "sure, i just texted you the terms link. it's in our chat.");
    } else {
      emitAgentText(ctx, "here are the terms and privacy policy:");
      s.transcript.push(card);
      ctx.newMessages.push(card);
    }
    recordAsk(s, null);
    return { session: s, newMessages: [userMsg, ...(early?.msgs ?? []), ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: ctx.actions };
  }
  // Google sign-in isn't working for them (not an approved test account, an error page): offer the sample inbox once.
  if (s.slots.gmail.status === "missing" && !s.demoOffered && GMAIL_TROUBLE.test(clean) && s.transcript.some((m) => m.kind === "gmail_link")) {
    s.demoOffered = true;
    const ctx: Ctx = { s, channel: s.call.active ? "voice" : channel, actions: [], newMessages: [], move: EVENT_MOVES.honest };
    emitAgentText(ctx, `ah, google only lets approved test accounts in during this trial, that's on us. ${DEMO_ASK}`);
    recordAsk(s, null, true);
    return { session: s, newMessages: [userMsg, ...(early?.msgs ?? []), ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: ctx.actions };
  }
  // Yes to the demo inbox: connect it now, the same way a real sign-in lands.
  if (s.slots.gmail.status === "missing" && prevAgent?.text.includes(DEMO_MARK) && DEMO_YES.test(clean) && !/\b(no|nah|nope|not|don'?t)\b/i.test(clean)) {
    connectDemo(s);
    const r = await handleEvent(s, { type: "gmail_connected" });
    r.newMessages.unshift(userMsg, ...(early?.msgs ?? []));
    return r;
  }
  // They said yes to the link: send it now (not left to the model), then let the reply mention it.
  let linkSent: Msg[] = [];
  let linkNote: string | undefined;
  const lastLinkAsk = [...s.transcript].slice(0, -1).reverse().find((m) => m.role === "agent" && (!m.kind || m.kind === "text"));
  const askedForLink = asksForLink(clean);
  if (s.slots.gmail.status === "missing" && (askedForLink || (lastLinkAsk?.text.includes(GMAIL_ASK_MARK) && gmailConsent(s)))) {
    const ctx: Ctx = { s, channel, actions: [], newMessages: [] };
    const out = await runTool(ctx, "send_gmail_link", {});
    if (!out.startsWith("error")) {
      linkSent = ctx.newMessages;
      linkNote =
        channel === "voice"
          ? "You just put the Gmail link in the text chat (a separate stream from this call). Say out loud that you're texting it right now, that it's the card that says 'connect your google account', and that signing in takes a few seconds. Don't send another."
          : "You just sent the Gmail link card in the chat. Say it's right there (the card that says 'connect your google account') and that it takes a few seconds. Don't send another.";
    }
  } else if (s.slots.gmail.status === "missing" && lastLinkAsk?.text.includes(GMAIL_ASK_MARK) && /^\s*(no|nah|nope|not now|later|no thanks)\b/i.test(clean)) {
    s.slots.gmail.status = "declined";
  }
  // "skip all this, just find me sushi": setup ends now, in code, and the request gets answered.
  // "no just do what i asked" is the same call: they know what they want, setup is in the way (spec: graduate early).
  const justDo = JUST_DO.test(clean);
  if (!s.call.active && s.phase !== "graduated" && (SKIP_SETUP.test(clean) || justDo)) {
    s.phase = "graduated";
    s.graduatedAt ??= new Date().toISOString();
    s.graduatedReason = justDo ? "they asked to just get their task done" : "they skipped setup";
    for (const k of Object.keys(s.slots) as SlotKey[]) if (s.slots[k].status === "missing") s.slots[k].status = "deferred";
    const bare = /^\s*(ok(ay)?,?\s*)?(can we |let'?s |i want to |just )?skip( all( of)?)?( this| that| it| setup| the setup| the rest)*\W*$/i.test(clean) || /^\s*(ok(ay)?,?\s*)?(just )?(let me in|get me in|let me (just )?(use|try) (it|you|this|the app))\W*$/i.test(clean);
    const r = await turn(
      s,
      "text",
      justDo
        ? "They told you to just do what they asked, and setup is over: you're their full assistant now. Do their most recent request (from an earlier message if this one only says to do it) right now, in full, in text. Don't offer a call, and don't ask for their name or Gmail."
        : bare
        ? "They skipped setup (\"just let me in\" means the same), and setup is over: you're their full assistant now. Tell them they're in, all set, in a few words, and ask what they want to get done first. Don't say you're \"already here\", and don't ask for their name, Gmail, or a call."
        : "They skipped setup, and setup is over: you're their full assistant now. Help with what they asked for in this same message, right now, in text. Don't offer a call, and don't ask for their name or Gmail.",
    );
    r.actions.push({ type: "graduate" });
    r.newMessages.unshift(userMsg, ...(early?.msgs ?? []));
    return r;
  }
  // Signing off after being helped ("great thanks. will reach out next time"): they got what they came for,
  // so that's a graduation too, with a code-written goodbye (and the what-i-know card at this point).
  if (channel === "text" && !s.call.active && s.phase !== "graduated" && s.slots.helpNeed.status === "filled" && (SIGN_OFF.test(clean) || saysBye(clean)) && clean.split(/\s+/).length <= 20) {
    s.phase = "graduated";
    s.graduatedAt ??= new Date().toISOString();
    s.graduatedReason = "they signed off after getting help";
    for (const k of Object.keys(s.slots) as SlotKey[]) if (s.slots[k].status === "missing") s.slots[k].status = "deferred";
    const ctx: Ctx = { s, channel, actions: [{ type: "graduate" }], newMessages: [], move: EVENT_MOVES.recap };
    const name = s.slots.userName.value;
    emitAgentText(ctx, `anytime${name ? ` ${name.toLowerCase()}` : ""}! text or call me whenever you need something`);
    recordAsk(s, null);
    return { session: s, newMessages: [userMsg, ...(early?.msgs ?? []), ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: ctx.actions };
  }
  if (/^\s*skip setup\s*$/i.test(clean) && s.phase !== "graduated") {
    const skip = s.call.active
      ? await turn(s, channel, "They want to skip the rest of setup. Say a short goodbye, say you'll pick it up over text, and call end_call.", goodbyeLine(s), { forceEnd: true })
      : await turn(s, channel, "The user asked to skip setup. Respect it: call graduate, then ask what they want to get done first.");
    if (s.call.active) s.graduateAfterCall = true;
    skip.newMessages.unshift(userMsg, ...(early?.msgs ?? []));
    return skip;
  }
  // They answered something else instead of naming it ("i need help with my inbox"): follow them, then a
  // double text takes "persona" as a default they can change. A short "hi" or "?" gets one more chance.
  let skippedName = false;
  if (channel === "text" && !s.call.active && s.phase !== "graduated" && s.slots.agentName.status === "missing" && s.lastAskedSlot === "agentName" && !repliedElsewhere(s, userMsg) && !OWN_NAME.test(clean.trim()) && !DELEGATE.test(clean) && !LAUGH.test(clean) && !NAME_HINT.test(clean)) {
    const askIdx = s.transcript.findLastIndex((m) => m.role === "agent" && NAME_ASK.test(m.text));
    const replies = s.transcript.slice(askIdx + 1).filter((m) => m.role === "user").length;
    const e0 = await heard.catch(() => null);
    if (!e0?.agentName && (clean.trim().split(/\s+/).length >= 3 || replies >= 2)) {
      defaultAgentName(s);
      skippedName = true;
    }
  }
  // They typed in the chat while we're on the call: answer out loud, and say we saw their text.
  const replyChannel: Channel = channel === "text" && s.call.active ? "voice" : channel;
  const sawText = channel === "text" && s.call.active ? "They just TEXTED this in the chat while you're on the call. Answer out loud on the call and mention you saw their text." : undefined;
  const r = await turn(
    s,
    replyChannel,
    [early?.note, linkNote ?? sawText, skippedName ? "They skipped naming you. You're going by Persona for now and a separate text just before yours already told them, so don't mention your name, don't ask for one, and don't open with \"got it\" (that would be answering your own text). Just carry on." : undefined].filter(Boolean).join(" ") || (interrupted ? "They talked over you mid-sentence. Drop what you were saying and respond to what they just said; don't repeat your cut-off line unless they ask." : undefined),
    linkNote ? (channel === "voice" ? "okay, i'm texting you the link right now. it's the card that says connect your google account, tap it whenever you're ready." : "here you go, it's the card right there. signing in takes a few seconds.") : channel === "voice" ? "sorry, i missed that. say it one more time?" : "sorry, i lost my train of thought for a sec. can you say that again?",
    // A note about an interruption or a text mid-call still gets this turn's move (like the gmail offer).
    { soft: !linkNote },
  );
  if (linkSent.length) {
    // The link sits right before the reply that mentions it.
    r.newMessages.unshift(...linkSent);
    if (s.call.active) r.actions.unshift({ type: "patience", ms: 30000 });
  }
  if (early) r.newMessages.unshift(...early.msgs);
  r.newMessages.unshift(userMsg);
  if (skippedName && !r.actions.some((a) => a.type === "start_call")) {
    // Before the reply, so its call offer (unlocked by the name) reads as the next step, not an aside.
    const ctx: Ctx = { s, channel: "text", actions: [], newMessages: [], move: EVENT_MOVES.defaultName };
    // "persona" is a name like any other: its contact card goes out with it (a rename updates that same card)
    const hasCard = s.transcript.some((x) => x.kind === "contact_card");
    emitAgentText(ctx, hasCard ? SKIPPED_NAME_REPLY : `${SKIPPED_NAME_REPLY}. save my contact card so you know it's me`);
    const [m] = ctx.newMessages;
    const card = hasCard ? [] : [msg("agent", "text", s.slots.agentName.value ?? "Persona", { kind: "contact_card" })];
    // the reply comes after that line: it can't acknowledge it ("got it, going by persona")
    for (const x of r.newMessages) if (x.role === "agent" && (!x.kind || x.kind === "text")) x.text = dropSelfAck(x.text);
    const at = s.transcript.findIndex((x) => r.newMessages.includes(x) && x.role === "agent");
    s.transcript.splice(s.transcript.indexOf(m), 1);
    s.transcript.splice(at >= 0 ? at : s.transcript.length, 0, m, ...card);
    const first = r.newMessages.findIndex((x) => x.role === "agent");
    r.newMessages.splice(first >= 0 ? first : r.newMessages.length, 0, m, ...card);
  }
  if (channel === "voice" && s.call.holding && s.call.active) r.actions.push({ type: "patience", ms: HOLD_MS });
  // Image bytes were for this one reply; storing them would bloat every later read and write.
  if (userMsg.attachments?.some((a) => a.dataUrl)) {
    const i = s.transcript.indexOf(userMsg);
    if (i >= 0) s.transcript[i] = { ...userMsg, attachments: userMsg.attachments.map(({ dataUrl, ...a }) => ({ ...a, summary: a.summary ?? (dataUrl ? "a photo they sent" : undefined) })) };
  }
  const card = named?.card;
  if (card && !r.newMessages.includes(card)) {
    // Card goes after the text, like persona's.
    if (!s.transcript.includes(card)) s.transcript.push(card);
    r.newMessages.push(card);
  }
  await Promise.all(named?.pending ?? []);
  const e = await heard;
  // Only rename the assistant from the extractor when they clearly meant to (answering the ask, or "call you X").
  const meantAgentName = (s.lastAskedSlot === "agentName" && !repliedElsewhere(s, userMsg)) || /\b(call (you|yourself)|your name|name you|rename)\b/i.test(clean) || NAME_HINT.test(clean);
  await applyExtracted(s, meantAgentName ? e : { ...e, agentName: null }, async (value) => {
    const ctx: Ctx = { s, channel, actions: [], newMessages: [] };
    await runTool(ctx, "set_slot", { slot: "agentName", value });
    await Promise.all(ctx.pending ?? []);
    const card = ctx.newCard ?? ctx.newMessages.find((m) => m.kind === "contact_card");
    if (card) {
      if (!s.transcript.includes(card)) s.transcript.push(card);
      if (!r.newMessages.includes(card)) r.newMessages.push(card);
    }
  });
  return r;
}

export async function nameFirst(s: Session, channel: Channel, text: string, heard: ReturnType<typeof extract>): Promise<{ msgs: Msg[]; note: string } | null> {
  // The "Persona" default is a placeholder: naming it for real goes through here too (ack + card before anything else).
  if (channel !== "text" || s.call.active || (s.slots.agentName.status !== "missing" && !s.agentNameDefaulted)) return null;
  if (s.lastAskedSlot !== "agentName" && !NAME_HINT.test(text)) return null;
  if (repliedElsewhere(s, s.transcript.findLast((m) => m.role === "user")) && !NAME_HINT.test(text)) return null;
  if (!NAME_HINT.test(text) && !nameAskIsNewest(s, s.transcript.findLast((m) => m.role === "user"))) return null;
  const e = await heard.catch(() => null);
  const value = (e?.agentName ?? hintedAgentName(text) ?? (s.lastAskedSlot === "agentName" ? firstSentenceName(text) : null))?.trim().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  if (!value || value.length > 30) return null;
  const ctx: Ctx = { s, channel, actions: [], newMessages: [] };
  if ((await runTool(ctx, "set_slot", { slot: "agentName", value })).startsWith("error")) return null;
  await Promise.all(ctx.pending ?? []);
  // "julia. my name is krish": their name gets said back in the same beat.
  const theirs = s.slots.userName.status !== "filled" ? (e?.userName?.trim() || ownNameIn(text)) : null;
  const meet = theirs && theirs.toLowerCase() !== value.toLowerCase() ? theirs.replace(/^\p{L}/u, (c) => c.toUpperCase()) : null;
  if (meet) s.slots.userName = { ...s.slots.userName, value: meet, status: "filled", source: channel, updatedAt: Date.now() };
  const ack = msg("agent", "text", `${nameAck(value)}${meet ? ` nice to meet you, ${meet.toLowerCase()}.` : ""} here's my contact card so you know it's me.`);
  s.transcript.push(ack);
  const msgs = [ack];
  if (ctx.newCard) {
    s.transcript.push(ctx.newCard);
    msgs.push(ctx.newCard);
  }
  return { msgs, note: `You just said "${value} it is" and sent your contact card. Don't mention your name, the contact card, or saving it again this turn. Answer the rest of their message; if there is nothing else, just greet them by name if they gave one.` };
}

export function nameAck(name: string) {
  return INSULT_NAME.test(name.trim()) ? `ouch, ${name.toLowerCase()}? harsh, but i'll wear it. ${name} it is.` : `${name} it is.`;
}

// confirms their call to skip it (not "got it": that reads as us acknowledging ourselves once the next text follows)
export const SKIPPED_NAME_REPLY = "all good, no name needed. i'll go by persona for now, rename me anytime";

// They didn't pick a name: go by "Persona" (a default they can change with one text) instead of stalling on it.
export function defaultAgentName(s: Session) {
  s.slots.agentName = { ...s.slots.agentName, value: "Persona", status: "filled", source: "text", updatedAt: Date.now() };
  s.agentNameDefaulted = true;
  if (s.lastAskedSlot === "agentName") s.lastAskedSlot = undefined;
}
// The sample inbox, for anyone google's sign-in won't let in (only approved test accounts during the trial).
export const DEMO_MARK = "demo inbox";
export const DEMO_ASK = `want to try it with a ${DEMO_MARK} instead? sample emails, same idea`;
