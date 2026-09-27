// Conversation moves: the research, turned into one concrete move per turn.
//
// A prompt full of principles gets applied unevenly. So code picks the move for this turn
// (from the state of the conversation), the model writes the words, and each agent message
// records which move produced it and where the idea comes from. The side panel shows that,
// so you can see the research working. Sources: docs/journal/03-principles.md, 05-research.md.
import type { Channel, Move, Session } from "./types";

export interface MoveDef extends Move {
  instruction: string;
}

const lastUser = (s: Session) => [...s.transcript].reverse().find((m) => m.role === "user")?.text ?? "";
const used = (s: Session, id: string) => (s.movesUsed ?? []).includes(id);

// "ok", "cool", "yeah ok", "lol": they're along for the ride but not steering anywhere.
const STALL = /^\s*(ok(ay)?|k|cool|nice|sure|yeah( ok)?|yep|lol|haha|hmm+|idk|i guess|sounds good|got it)[.!]*\s*$/i;
const OFF_TOPIC = /\?\s*$|\b(who|what|why|how|can you|do you|are you)\b/i;

export const MOVES = {
  askCall: {
    id: "ask-call",
    label: "permission with a reason, easy no",
    source: "brown & levinson, politeness (1987); tan et al., chi 2014",
    instruction: "Ask permission for a quick call, give the reason (it's faster to get set up by voice, about a minute), and make texting an equally easy yes.",
  },
  discover: {
    id: "discover",
    label: "ask about a specific recent moment",
    source: "fitzpatrick, the mom test (2013)",
    instruction:
      "Find what they could use help with by asking about THEIR recent life, not about you: a specific, past moment. e.g. \"what ate the most time this week?\" or \"what's something you kept putting off lately?\" No hypotheticals like \"would you use...\". No pitching.",
  },
  dig: {
    id: "dig",
    label: "dig into the last time it happened",
    source: "fitzpatrick, the mom test (2013)",
    instruction:
      "They named a problem. Before offering anything, ask ONE follow-up about the last concrete time it happened or how they handle it today (their current workaround). e.g. \"when did that last bite you?\" or \"what do you do about it right now?\" Listen; don't pitch yet.",
  },
  playback: {
    id: "playback",
    label: "mirror their words, reframe the real problem",
    source: "pink, to sell is human (2012): attunement + clarity; voss, never split the difference (2016): labeling",
    instruction:
      "Play back what they said in THEIR words (short), name the real problem underneath it if there is one, and give one small piece of real advice or comfort they can use today. Specific to them, not a feature list. Don't ask for gmail in this same message.",
  },
  giveFirst: {
    id: "give-first",
    label: "give value before asking",
    source: "cialdini, influence (1984): reciprocity; sierra, badass (2015)",
    instruction:
      "Don't ask for anything this turn. Give them something useful about their situation: a quick tip, a first step, a tiny draft. Make them a little more capable right now.",
  },
  askGmail: {
    id: "ask-gmail",
    label: "reason first, name the worry, easy no",
    source: "tan et al., chi 2014; voss (2016): accusation audit; brown & levinson (1987)",
    instruction:
      "Ask to connect Gmail with the specific reason tied to their need, name the obvious worry before they have to (\"you might be wondering why i'd want your email\"), say it's read only and you never send without asking, and offer an alternative (paste an email instead). Ask it as a question, like: want me to text you a link to connect it?. Do NOT call send_gmail_link until they say yes.",
  },
  askName: {
    id: "ask-name",
    label: "remember and use their name",
    source: "carnegie, how to win friends and influence people (1936)",
    instruction: "Ask what to call them, lightly, as part of the conversation (not a form field). Once you have it, use it now and then.",
  },
  offramp: {
    id: "offramp",
    label: "offer an easy next step as a question",
    source: "pink, to sell is human (2012): offramps; fitzpatrick (2013): pull, don't push",
    instruction:
      "They're going along but not steering anywhere. Offer the next step as an easy yes question tied to what they told you, e.g. \"want to hear how i'd handle [their thing]?\" or \"want me to show you with [something of theirs]?\". One question, no pressure.",
  },
  bridge: {
    id: "bridge",
    label: "answer, then bridge back",
    source: "grice (1975): relevance; packard & berger (2021): concrete language",
    instruction:
      "They asked something off to the side. Answer it briefly and honestly first. Then bridge back with one concrete, specific next step (not generic). If you're parking their topic, say you'll come back to it.",
  },
  help: {
    id: "help",
    label: "get out of the way and help",
    source: "hulick, the elements of user onboarding (2014); guidara, unreasonable hospitality (2022)",
    instruction: "Setup is done or skipped. Just help with what they want, warmly and concretely.",
  },
  answer: {
    id: "answer",
    label: "just answer; no question this turn",
    source: "grice (1975): quantity; fitzpatrick (2013): talk less, listen more",
    instruction: "Answer what they said, briefly and warmly, and stop. No question this turn: you asked something recently, so let the conversation breathe.",
  },
  graduate: {
    id: "graduate",
    label: "they know what they need: let them in",
    source: "the brief; hulick (2014)",
    instruction: "They already know what they want. Offer to skip the rest of setup and start on it; graduate if they say yes.",
  },
} satisfies Record<string, MoveDef>;

// Named moves for system events, so the panel explains those too.
export const EVENT_MOVES = {
  recap: { id: "recap", label: "answer \"what now?\" before they ask", source: "dixon, toman & delisi, the effortless experience (2013): next issue avoidance" },
  silence: { id: "silence", label: "escalate gently on silence", source: "pearl, designing voice user interfaces (2016); koudenburg et al. (2011)" },
  declined: { id: "declined", label: "a no is fine, stay easy", source: "brown & levinson (1987); pink (2012): buoyancy" },
  interrupt: { id: "interrupt", label: "interrupt only if waiting costs them", source: "praxic-style triage with evidence (journal 07)" },
  intro: { id: "intro", label: "a small first yes: name me", source: "cialdini (1984): commitment; eyal, hooked (2014): investment" },
  named: { id: "named", label: "their name choice, then the call ask (persona's own line)", source: "persona's real flow (journal 02); brown & levinson (1987): permission with a reason" },
  callNow: { id: "call-now", label: "they said yes: do it right away", source: "dixon et al. (2013): low effort" },
  greet: { id: "greet", label: "pick up where the texts left off", source: "dixon et al. (2013): never make them repeat themselves" },
} satisfies Record<string, Move>;

export function chooseMove(s: Session, channel: Channel, opts: { callFirst: boolean; mayAsk: boolean }): MoveDef {
  const text = lastUser(s);
  const need = s.slots.helpNeed;
  if (s.phase === "graduated") return MOVES.help;
  if (opts.callFirst && channel === "text") return MOVES.askCall;
  // They called us: listen and follow their lead.
  if (channel === "voice" && s.call.byUser) return STALL.test(text) ? MOVES.offramp : MOVES.answer;
  // On the call, the name comes first and naturally (the greeting asks it).
  if (channel === "voice" && s.slots.userName.status === "missing" && !used(s, "ask-name")) return MOVES.askName;
  if (OFF_TOPIC.test(text) && text.length > 3 && !/\b(call|gmail|email|link)\b/i.test(text)) return opts.mayAsk ? MOVES.bridge : MOVES.answer;
  if (need.status === "missing") {
    // Only a clear "i know what i want, skip this", not every "just" or "can you".
    if (/\b(skip (this|setup|the setup|it|all this)|already know what i (want|need)|just (want|need) you to|let'?s (just )?get (to it|started))\b/i.test(text)) return MOVES.graduate;
    if (!opts.mayAsk) return MOVES.giveFirst;
    return STALL.test(text) && used(s, "discover") ? MOVES.offramp : MOVES.discover;
  }
  // Dig only when the need is still vague; if they already gave the details, asking more feels like a form.
  const vague = (need.value ?? "").split(/\s+/).length <= 4 && text.split(/\s+/).length < 14;
  if (need.status === "filled" && !used(s, "dig") && vague) return MOVES.dig;
  if (need.status === "filled" && !used(s, "playback")) return MOVES.playback;
  if (STALL.test(text)) return MOVES.offramp;
  if (!opts.mayAsk) return MOVES.giveFirst;
  if (s.slots.userName.status === "missing") return MOVES.askName;
  if (s.slots.gmail.status === "missing") return MOVES.askGmail;
  return MOVES.help;
}

export function markUsed(s: Session, id: string) {
  (s.movesUsed ??= []).push(id);
  if (s.movesUsed.length > 40) s.movesUsed.splice(0, s.movesUsed.length - 40);
}
