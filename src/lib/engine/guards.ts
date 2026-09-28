import { type Channel, type InboxItem, type Session, type TurnResult } from "../types";
import { provider, quick } from "../llm";
import { EVENT_MOVES } from "../moves";
import { type Ctx, emitAgentText, goodbyeLine, shortNeed } from "./context";
import { GOODBYE, SENTENCE_BREAK, capSentences, cleanModelText } from "./text";

// The gmail ask is written by code (one clear question, the reason, the reassurance, an easy no).
export const GMAIL_ASK_MARK = "text you a link to connect your gmail";
export function gmailAsk(s: Session, channel: Channel = "text") {
  const need = shortNeed(s);
  // Out loud it's one short question (the voice cap is 3 sentences, and "paste an email here" makes no sense on a call).
  // Gmail only "helps with" needs that involve email; otherwise say what it actually adds.
  const emailish = !!need && /\b(e-?mails?|inbox|mail|recruiters?|replies|reply|applications?|newsletters?|invites?|messages?)\b/i.test(need);
  if (channel === "voice") {
    return emailish
      ? `want me to ${GMAIL_ASK_MARK}, so i can actually help with ${need}?`
      : `want me to ${GMAIL_ASK_MARK}? that way i can keep an eye on the emails that come with it, like confirmations and sign-ups.`;
  }
  const why = emailish ? ` then i can help with ${need} for real.` : " that way i can keep an eye on confirmations, sign-ups and anything that needs a reply.";
  return `want me to ${GMAIL_ASK_MARK}?${why} i never send anything without your ok. or you can just paste an email here.`;
}
// Gmail pitches the model slips into other turns (help first, ask later).
// Gmail framed as a requirement rather than an offer.
export const GMAIL_DEMAND = /\b(i'?ll need|i need|you'?ll need|need you to|i have to have|have to (connect|get)|first,? (though,? )?(i'?ll |we'?ll )?need)\b[^.?!]{0,50}\b(gmail|inbox|email|google)\b/i;

// Even when they brought up their inbox, gmail is never a demand ("first though, i'll need your gmail
// connected"): that line becomes the one polite, skippable ask (once, never while a link is out).
export function softenGmailDemand(s: Session, channel: Channel, text: string) {
  if (s.slots.gmail.status !== "missing" || !GMAIL_DEMAND.test(text)) return text;
  const kept = text.split(SENTENCE_BREAK).filter((x) => !GMAIL_DEMAND.test(x)).join(" ").trim();
  const askedBefore = s.transcript.some((m) => m.role === "agent" && m.text.includes(GMAIL_ASK_MARK));
  const ask = !askedBefore && !linkPending(s) ? gmailAsk(s, channel) : "";
  const lead = channel === "voice" ? capSentences(kept.replace(/\?[^?]*$/, "."), 1) : kept;
  return `${lead}${lead && ask ? (channel === "voice" ? " " : "\n\n") : ""}${ask}`.trim() || text;
}
export const GMAIL_PITCH =/\b(gmail|link|connect (your|my) (email|inbox|account)|read[- ]only|paste an email|without asking|pull up (your|the|those) (emails|inbox))\b/i;

// Questions it asked before, normalized ("what's eating your time?" == "what is eating your time").
export const Q_FILLER = /\b(so|and|but|oh|okay|ok|hey|just|quick(ly)?|real quick|btw|by the way|then|now|also|anyway)\b/g;
export function normQuestion(q: string) {
  return q.toLowerCase().replace(/'s\b/g, " is").replace(/'re\b/g, " are").replace(/[^a-z0-9 ]+/g, " ").replace(Q_FILLER, " ").replace(/\s+/g, " ").trim();
}
export function sameQuestion(a: string, b: string) {
  if (a === b) return true;
  const A = new Set(a.split(" ")), B = new Set(b.split(" "));
  const shared = [...A].filter((w) => B.has(w)).length;
  // "what should i call you" vs "what should i call myself": a different pronoun is a different question.
  const diff = [...A, ...B].filter((w) => !(A.has(w) && B.has(w)));
  if (diff.some((w) => /^(you|your|me|my|myself|yourself|i|we|us)$/.test(w))) return false;
  return shared / Math.max(A.size, B.size) >= 0.8;
}
export const questionsIn = (text: string) => text.split(SENTENCE_BREAK).filter((x) => x.trim().endsWith("?"));

export function rememberQuestions(s: Session, text: string) {
  const qs = questionsIn(text).map(normQuestion).filter(Boolean);
  if (!qs.length) return;
  s.askedQuestions = [...(s.askedQuestions ?? []), ...qs].slice(-12);
}

// Returns the text unchanged (no label) when it's fine. Double question: keep the last one. Repeat: drop it.
export function cutRepeatQuestions(s: Session, text: string): { text: string; label?: string } {
  const asked = s.askedQuestions ?? [];
  const qs = questionsIn(text);
  const repeats = qs.filter((q) => asked.some((a) => sameQuestion(normQuestion(q), a)));
  if (!repeats.length && qs.length <= 1) return { text };
  const keepQ = qs.filter((q) => !repeats.includes(q)).slice(-1)[0];
  const kept = text.split(SENTENCE_BREAK).filter((x) => !x.trim().endsWith("?") || x === keepQ).join(" ").trim();
  if (!kept) return { text };
  return { text: kept, label: repeats.length ? "blocked repeat question" : "cut a double question" };
}

export async function noRepeatQuestions(s: Session, text: string): Promise<{ text: string; label?: string }> {
  const cut = cutRepeatQuestions(s, text);
  if (!cut.label || !provider) return cut;
  // One cheap rewrite keeps the reply natural; if it still misses, the cut stands.
  try {
    const asked = (s.askedQuestions ?? []).slice(-6).map((q) => `- ${q}`).join("\n") || "(none)";
    const out = await quick({
      tag: "repeat-rewrite",
      maxTokens: 200,
      system: "Rewrite the assistant's message so it asks at most ONE question and doesn't re-ask anything already asked (listed). Keep its meaning, tone, length and lowercase style. Reply with only the rewritten message.",
      user: `Already asked:\n${asked}\n\nMessage:\n${text}`,
    });
    const clean = cleanModelText(out);
    if (clean && !cutRepeatQuestions(s, clean).label) return { text: clean, label: "rewrote a repeat question" };
  } catch {
    // provider hiccup: the cut is fine
  }
  return cut;
}

// Last line of defense: whatever path hung up, a spoken goodbye went out first.
export function sealGoodbye(s: Session, r: TurnResult): TurnResult {
  if (!r.actions.some((a) => a.type === "end_call")) return r;
  if (r.newMessages.some((m) => m.role === "agent" && m.channel === "voice" && GOODBYE.test(m.text))) return r;
  const ctx: Ctx = { s, channel: "voice", actions: [], newMessages: [], move: EVENT_MOVES.recap, guards: ["goodbye added before hangup"] };
  emitAgentText(ctx, goodbyeLine(s));
  r.newMessages.push(...ctx.newMessages);
  return r;
}

// Asking for (or pushing) the gmail connection again.
export const GMAIL_ASKISH = /\b(connect|hook up|link|sign in)\b[^.?!]{0,40}\b(gmail|google|email|inbox)\b|\b(gmail|google) (link|card)\b|\bwant me to (text|send) you (a|the) link\b/i;
// The connect link went out and hasn't failed or been used yet: it's in their texts.
export function linkPending(s: Session) {
  if (s.slots.gmail.status !== "missing") return false;
  const lastLink = s.transcript.map((m) => m.kind).lastIndexOf("gmail_link");
  const lastFail = s.transcript.findLastIndex((m) => m.kind === "event" && /^Gmail connection/.test(m.text));
  return lastLink >= 0 && lastLink > lastFail;
}

// Provenance: email text the agent has seen this session, so values that only an email "said" never become slots.
export function rememberEmails(s: Session, items: InboxItem[]) {
  const seen = new Set(s.emailSeen ?? []);
  for (const m of items) seen.add(`${m.fromName} ${m.subject} ${m.snippet}`.slice(0, 400));
  s.emailSeen = [...seen].slice(-40);
}
export const WORDS_OF = (t: string) => new Set(t.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter((w) => w.length >= 3));
export function fromEmailOnly(s: Session, value: string): boolean {
  if (!s.emailSeen?.length) return false;
  const words = [...WORDS_OF(value)];
  if (!words.length) return false;
  const inEmail = WORDS_OF(s.emailSeen.join(" "));
  const saidByThem = WORDS_OF(s.transcript.filter((m) => m.role === "user").map((m) => m.text).join(" "));
  // Every word of it is in an email, and none of it in anything they said or typed.
  return words.every((w) => inEmail.has(w)) && !words.some((w) => saidByThem.has(w));
}
