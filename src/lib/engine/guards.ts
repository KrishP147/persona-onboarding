import { type Channel, type InboxItem, type Move, type Session, type TurnResult } from "../types";
import { provider, quick } from "../llm";
import { EVENT_MOVES } from "../moves";
import { type Ctx, emitAgentText, ensureCard, goodbyeLine, guard, msg, shortNeed } from "./context";
import { CARD_ASK, NAME_ASK, SEND_REQUEST, gmailConsent, saidNow, userWrappingUp } from "./intents";
import { runTool } from "./tools";
import { ACCUSING, ASSUMING, CLAIMS_LINK, CLAIMS_SENT, GOODBYE, SENTENCE_BREAK, capSentences, cleanModelText } from "./text";

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

// The post-model safety nets, in the order they run (moved out of turn()). Each step reads and
// rewrites e.text; e.fix(label, next) swaps in a new version and names the guard only if it changed.
export type TurnOpts = { forceEnd?: boolean; move?: Move; avoid?: RegExp; soft?: boolean };
export interface GuardEnv {
  ctx: Ctx;
  s: Session;
  channel: Channel;
  text: string;
  failed: boolean;
  usedFallback: boolean;
  extraInstruction?: string;
  fallback?: string;
  opts: TurnOpts;
  fix(label: string, next: string): void;
}
export interface GuardStep {
  name: string;
  run(e: GuardEnv): void | Promise<void>;
}
export const GUARD_PIPELINE: GuardStep[] = [
  {
    name: "avoid",
    async run(e) {
      // Some things must never be said in this moment (e.g. "got cut off" after we hung up ourselves).
      if (e.opts.avoid && e.fallback && e.opts.avoid.test(e.text)) e.fix("blocked a line not allowed here", e.fallback);
    },
  },
  {
    name: "force-end",
    async run(e) {
      const { ctx } = e;
      if (e.opts.forceEnd && !ctx.actions.some((a) => a.type === "end_call")) ctx.actions.push({ type: "end_call" });
    },
  },
  {
    name: "placing-call",
    async run(e) {
      const { ctx, channel } = e;
      // Placing a call: the e.text is just the heads up; the talking happens on the call.
      if (channel === "text" && ctx.actions.some((a) => a.type === "start_call")) {
        e.text = "calling you now.";
        ensureCard(ctx);
        ctx.move = EVENT_MOVES.callNow;
      }
    },
  },
  {
    name: "goodbye-before-hangup",
    async run(e) {
      const { ctx, s, channel } = e;
      if (channel === "voice" && ctx.actions.some((a) => a.type === "end_call") && !GOODBYE.test(e.text)) {
        e.fix("goodbye added before hangup", `${e.text.trim()} ${goodbyeLine(s)}`.trim());
      }
    },
  },
  {
    name: "hang-up-after-goodbye",
    async run(e) {
      const { ctx, s, channel } = e;
      // Said goodbye on a call but didn't hang up: hang up (a silence prompt after "bye" is the worst).
      if (channel === "voice" && s.call.active && !e.failed && GOODBYE.test(e.text) && userWrappingUp(s) && !ctx.actions.some((a) => a.type === "end_call")) {
        ctx.actions.push({ type: "end_call" });
        guard(ctx, "hung up after goodbye");
      }
    },
  },
  {
    name: "gmail-by-the-book",
    async run(e) {
      const { ctx, s, channel } = e;
      // Gmail, by the book: the gmail turn ends with the code-written question; other turns don't pitch it.
      if ((!e.extraInstruction || ctx.softInstruction) && s.slots.gmail.status === "missing" && !ctx.newMessages.some((m) => m.kind === "gmail_link")) {
        const raisedIt = /\b(gmail|email|inbox|link)\b/i.test(saidNow(s));
        const help = e.text.split(SENTENCE_BREAK).filter((x) => !GMAIL_PITCH.test(x) && !(ctx.move?.id === "ask-gmail" && /\b(without your (ok|okay)|won.?t send)/i.test(x))).join(" ").trim();
        if (ctx.move?.id === "ask-gmail") {
          // On a call: one sentence of help, then the ask, so the question is never cut off.
          const lead = channel === "voice" ? capSentences(help.replace(/\?[^?]*$/, "."), 1) : help;
          e.fix("gmail ask written by code", `${lead}${lead ? (channel === "voice" ? " " : "\n\n") : ""}${gmailAsk(s, channel)}`.trim());
        }
        else if (!raisedIt && help) e.fix("gmail pitch held for its own turn", help);
        // Even when they brought up their inbox, gmail is never a demand ("first though, i'll need your gmail
        // connected"): that line becomes the one polite, skippable ask (once, never while a link is out).
        else if (ctx.move?.id !== "ask-gmail") e.fix("gmail demand softened", softenGmailDemand(s, channel, e.text));
      }
    },
  },
  {
    name: "no-repeat-gmail-ask",
    async run(e) {
      const { ctx, s } = e;
      // Already connected, declined, or the link is already sitting in their texts: no more gmail asks
      // (the most common grader note: "repeated the gmail request after it was connected / agreed").
      const linkWaiting = linkPending(s) && !ctx.newMessages.some((m) => m.kind === "gmail_link");
      if ((s.slots.gmail.status !== "missing" || linkWaiting) && !/\b(gmail|google|link|connect)\b/i.test(saidNow(s))) {
        const kept = e.text.split(SENTENCE_BREAK).filter((x) => !GMAIL_ASKISH.test(x)).join(" ").trim();
        if (kept) e.fix("repeat gmail ask dropped", kept);
      }
    },
  },
  {
    name: "no-third-question",
    async run(e) {
      const { ctx, s, channel } = e;
      // On a call, never three questions in a row: after two, it just responds and lets them talk
      // (a call went question, question, question, question...). The gmail ask is the one exception.
      if (channel === "voice" && e.text.trim().endsWith("?") && ctx.move?.id !== "ask-gmail") {
        const lastTwo = s.transcript.filter((m) => m.role === "agent" && m.channel === "voice" && m.move?.id !== "silence").slice(-2);
        if (lastTwo.length === 2 && lastTwo.every((m) => m.text.trim().endsWith("?"))) {
          const kept = e.text.split(SENTENCE_BREAK).filter((x) => !x.trim().endsWith("?")).join(" ").trim();
          if (kept) e.fix("blocked a third question in a row", kept);
        }
      }
    },
  },
  {
    name: "no-repeat-name-ask",
    async run(e) {
      const { s } = e;
      // Already named: never ask "what should i go by?" again (it did, on a call, right after being named).
      if (s.slots.agentName.status === "filled" && NAME_ASK.test(e.text)) {
        const kept = e.text.split(SENTENCE_BREAK).filter((x) => !NAME_ASK.test(x)).join(" ").trim();
        if (kept) e.fix("blocked repeat name question", kept);
      }
    },
  },
  {
    name: "no-accusing-or-assuming",
    async run(e) {
      // Never "you skipped..." / "why didn't you...", and never a guess about them stated as fact
      // ("sounds like you're busy"). Only the offending sentence goes; bubbles keep their breaks.
      const hits = new Set<string>();
      const kept = e.text
        .split(/\n\s*\n/)
        .map((b) =>
          b
            .split(SENTENCE_BREAK)
            .filter((x) => {
              if (ACCUSING.test(x)) return !hits.add("dropped an accusing line");
              if (ASSUMING.test(x)) return !hits.add("dropped a guess stated as fact");
              return true;
            })
            .join(" ")
            .trim(),
        )
        .filter(Boolean)
        .join("\n\n");
      if (!hits.size || !kept) return;
      const [first, ...rest] = [...hits];
      e.fix(first, kept);
      for (const h of rest) guard(e.ctx, h);
    },
  },
  {
    name: "name-rate",
    async run(e) {
      // Their name about once every 3 turns, never twice in a row: past that it reads like a sales script.
      // Only the name used to address them goes ("ok krish, ..."); "krish's resume" stays.
      const n = (e.s.slots.userName.value ?? "").replace(/[^\p{L}\p{N}' -]/gu, "").trim();
      if (n.length < 2) return;
      const said = new RegExp(`\\b${n}\\b`, "i");
      if (!said.test(e.text)) return;
      const recent = e.s.transcript.filter((m) => m.role === "agent" && (!m.kind || m.kind === "text")).slice(-2);
      if (!recent.some((m) => said.test(m.text))) return;
      const vocative = new RegExp(`,\\s*${n}\\b(?!')|^\\s*${n},\\s*|\\b(hey|hi|ok|okay|so|sure|thanks|got it|oh|yeah)\\s+${n}\\b(?!')|\\s+${n}(?=\\s*[.!?]\\s*$)`, "gim");
      const kept = e.text.replace(vocative, (m, w) => (w ? w : "")).replace(/\s+([.!?,])/g, "$1").trim();
      if (kept && kept !== e.text) e.fix("name held back (used it just now)", kept);
    },
  },
  {
    name: "no-false-sent",
    async run(e) {
      const { ctx, s } = e;
      // "sent!" only if send_email actually went out this turn.
      if (!ctx.sentEmail && !s.draft?.sent && SEND_REQUEST.test(saidNow(s)) && !CARD_ASK.test(saidNow(s)) && CLAIMS_SENT.test(e.text)) {
        e.fix("blocked a false 'sent' claim", s.draft && !s.draft.sent ? "i haven't sent it yet. want me to send the draft above as is?" : "i haven't sent anything. want me to write it up as a draft first?");
      }
    },
  },
  {
    name: "call-offer-and-link-claims",
    async run(e) {
      const { ctx, s, channel } = e;
      const sentences = e.text.split(/(?<=[.!?])\s+|\n+/);
      // An offer to call made in words counts as an offer (so it isn't repeated next turn).
      const offerSentence = sentences.some((x) => x.trim().endsWith("?") && /\b(quick call|give you a (quick )?(call|ring)|hop on a (quick )?call|mind if i call|want me to call)\b/i.test(x) && !/\b(skip|no worries)\b/i.test(x));
      if (channel === "text" && !s.call.active && offerSentence && !ctx.offeredCall) {
        s.callOffers += 1;
        if (s.phase === "intro") s.phase = "call_offered";
      }
      // Keep words and actions in sync: if it SAYS the link is in their texts (not asks whether to send it), it is.
      const claimsLink = sentences.some((x) => CLAIMS_LINK.test(x) && !x.trim().endsWith("?") && !/\b(want me to|should i|can i|shall i)\b/i.test(x));
      if (claimsLink && s.slots.gmail.status === "missing" && !ctx.newMessages.some((m) => m.kind === "gmail_link")) {
        if (gmailConsent(s)) {
          await runTool(ctx, "send_gmail_link", {});
          guard(ctx, "sent the link it said it sent");
        }
        // Never say it's sent when it isn't: drop the claim instead of sending a link they didn't ask for.
        else e.fix("dropped a false 'link sent' claim", sentences.filter((x) => !(CLAIMS_LINK.test(x) && !x.trim().endsWith("?"))).join(" ").trim() || e.text);
      }
    },
  },
  {
    name: "long-text-to-chat",
    async run(e) {
      const { ctx, s, channel } = e;
      // On a call, a draft (or anything long) is for reading, not listening: post it to the chat and say so.
      const looksLikeDraft = /---|\bsubject:|\bdear\b|\bhi \[|\[(landlord|name|recipient)[^\]]*\]/i.test(e.text) || e.text.length > 320;
      if (channel === "voice" && !e.extraInstruction && looksLikeDraft && !ctx.newMessages.some((m) => m.kind !== "gmail_link" && m.role === "agent" && m.channel === "text")) {
        const draft = e.text.replace(/^[^\n]*?(here'?s (something|a draft|one)[^:\n]*:|---)\s*/i, "").replace(/---/g, "").trim();
        const posted = msg("agent", "text", draft);
        ctx.newMessages.push(posted);
        s.transcript.push(posted);
        const isDraft = /---|\bsubject:|\bdear\b|\bhi \[|\[(landlord|name|recipient)[^\]]*\]/i.test(draft);
        e.fix("long text moved to the chat", isDraft ? "okay, i put the draft in our chat. take a look and tell me what to change." : "that's a lot to say out loud, so i put it in our chat.");
      }
    },
  },
  {
    name: "link-said-aloud",
    async run(e) {
      const { ctx, channel } = e;
      // On a call, if the link just went to their texts, say so (the written ask alone isn't enough).
      if (channel === "voice" && ctx.newMessages.some((m) => m.kind === "gmail_link") && !/\b(text|link)\b/i.test(e.text)) {
        e.fix("said out loud that the link is in texts", `${e.text.trim()} i'm texting you the link right now. it's the card that says connect your google account, tap it whenever you're ready.`.trim());
      }
    },
  },
  {
    name: "no-repeat-questions",
    async run(e) {
      const { ctx, s } = e;
      // One question per message, and never one it already asked: a targeted rewrite on a miss, else the cut.
      if (!e.usedFallback && ctx.move?.id !== "ask-gmail") {
        const fixed = await noRepeatQuestions(s, e.text);
        if (fixed.label) e.fix(fixed.label, fixed.text);
      }
    },
  },
];
