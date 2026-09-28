import { nanoid } from "nanoid";
import { type Channel, type ClientAction, type Msg, type Session } from "../types";

import { type Move } from "../types";
import { STAGE_BRACKETS, TOOL_NAMES, capBubbles, capSentences, keepFillIns, stopAtRepeat } from "./text";

export function msg(role: Msg["role"], channel: Channel, text: string, extra: Partial<Msg> = {}): Msg {
  return { id: nanoid(10), role, channel, text, ts: Date.now(), ...extra };
}

// When the model is unreachable more than once in a row: own it plainly, keep what we know, set an expectation.
export function outageLine(s: Session, channel: Channel) {
  const name = s.slots.userName.value;
  if (channel === "voice") return `sorry${name ? ` ${name}` : ""}, i'm having trouble on my end right now. i'll text you instead. talk soon!`;
  const need = s.slots.helpNeed.value;
  // Don't repeat the same apology over and over: after the first, keep it short and different.
  if ((s.llmFailures ?? 0) > 2) return (s.llmFailures ?? 0) % 2 ? "still catching up on my end, sorry. i'll be back to normal soon." : "still slow here, sorry about that. your messages are saved, nothing's lost.";
  return `sorry${name ? ` ${name}` : ""}, i'm running slow on my end right now.${need && need.length <= 60 ? ` i haven't forgotten about ${need}.` : ""} give me a few minutes and text me again?`;
}

export function heardThemThisCall(s: Session) {
  const started = s.transcript.findLastIndex((m) => m.kind === "event" && m.text === "Call started");
  return s.transcript.slice(started + 1).some((m) => m.role === "user" && m.channel === "voice");
}

export interface Ctx {
  s: Session;
  channel: Channel;
  actions: ClientAction[];
  newMessages: Msg[];
  resendOk?: boolean;
  newCard?: Msg;
  move?: Move;
  pending?: Promise<void>[];
  offeredCall?: boolean;
  allowEnd?: boolean; // the system decided to end the call (silence, skip setup, outage)
  sentEmail?: boolean; // send_email actually went out this turn
  shownDraft?: string; // a draft was posted this turn (the reply shouldn't repeat it)
  softInstruction?: boolean; // the extra instruction is just context: still pick a move this turn
  guards?: string[]; // code safety nets that fired this turn, copied onto the bubbles it emits
}

// Name a safety net that changed this turn's reply, so "why it said that" can show it.
export function guard(ctx: Ctx, label: string) {
  const g = (ctx.guards ??= []);
  if (!g.includes(label)) g.push(label);
}

export function shortNeed(s: Session) {
  const n = s.slots.helpNeed.value;
  return n && n.length <= 60 ? n : null;
}

// Never vanish from a call: a hangup the agent initiates always carries a real goodbye.
export function goodbyeLine(s: Session) {
  const name = s.slots.userName.value;
  const need = shortNeed(s);
  return `okay${name ? ` ${name}` : ""}, i'll let you go${need ? ` and get started on ${need}` : ""}. i'll text you a quick recap, and you can call me back anytime. bye for now.`;
}

// Used only if the model produced nothing: the post-call text must always arrive.
export function recapFallback(s: Session, reason: string) {
  const need = shortNeed(s);
  const keep = need ? ` i'll keep ${need} in mind.` : "";
  if (reason === "user_hangup" || reason === "error") return `got cut off, no worries.${keep} text me whenever.`;
  return `thanks for the chat!${keep} text or call me anytime.`;
}

export function emitAgentText(ctx: Ctx, raw: string) {
  // House style: no em dashes, no stage directions like "(waiting for reply)".
  const text = stopAtRepeat(raw.replace(TOOL_NAMES, " ").replace(STAGE_BRACKETS, keepFillIns)).replace(/\s*[—]\s*/g, ", ").replace(/\((?:[a-z]+ ){0,3}(?:on|in) (?:the |our )?(?:call|chat)\)\s*/gi, "").replace(/^\s*\*?\([^)]*\)\*?\s*$/gm, "").trim();
  // On a call, three sentences is already a lot to listen to; trim anything longer.
  const spoken = ctx.channel === "voice" ? capSentences(text.replace(/\n+/g, " ").trim(), 3) : text;
  // An email typed out in the reply stays one bubble (split per paragraph it read like several texts).
  const isEmail = /^\s*subject:/im.test(text);
  const bubbles =
    ctx.channel === "voice"
      ? [spoken]
      : isEmail
        ? [text.replace(/^\s*-{3,}\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim()]
        : capBubbles(text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean), 3);
  for (const b of bubbles.filter(Boolean)) {
    const m = msg("agent", ctx.channel, b, { ...(ctx.move ? { move: ctx.move } : {}), ...(ctx.guards?.length ? { guards: [...ctx.guards] } : {}) });
    ctx.newMessages.push(m);
    ctx.s.transcript.push(m);
  }
  if (ctx.channel === "voice" && spoken) ctx.actions.push({ type: "speak", text: spoken });
}

export function eventMsg(s: Session, text: string): Msg {
  const m = msg("event", "text", text, { kind: "event" });
  s.transcript.push(m);
  return m;
}

// The contact card always comes before the first call (so the incoming call shows who it is), even when
// the name is still the "Persona" default. Returns true if it sent one now.
export function ensureCard(ctx: Ctx): boolean {
  const { s } = ctx;
  const name = s.slots.agentName.value;
  if (!name || s.transcript.some((m) => m.kind === "contact_card")) return false;
  const line = msg("agent", "text", "here's my contact card so you know it's me.");
  const card = msg("agent", "text", name, { kind: "contact_card" });
  s.transcript.push(line, card);
  ctx.newMessages.push(line, card);
  guard(ctx, "contact card before the call");
  return true;
}
