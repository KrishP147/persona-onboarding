// Conversation moves: the research, turned into one concrete move per turn.
//
// A prompt full of principles gets applied unevenly. So code picks the move for this turn
// (from the state of the conversation), the model writes the words, and each agent message
// records which move produced it and where the idea comes from. The side panel shows that,
// so you can see the research working. Sources: docs/journal/03-principles.md, 05-research.md.
import type { Channel, Move, Session } from "./types";
import { INBOUND_OWN_TURNS, userTurnsThisCall } from "./policy";
import { replyFocus, taskNow } from "./engine/intents";

export interface MoveDef extends Move {
  instruction: string;
}

// Seeded variety: the same session and turn always pick the same wording (reproducible), but two
// reviewers (two sessions) don't both get the exact same opener. crc32 of session id + salt + turn.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function crc32(str: string) {
  let c = 0xffffffff;
  for (const ch of new TextEncoder().encode(str)) c = CRC_TABLE[(c ^ ch) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function pick<T>(s: Session, salt: string, options: readonly T[]): T {
  const turn = s.transcript.filter((m) => m.role === "user").length;
  return options[crc32(`${s.id}:${salt}:${turn}`) % options.length];
}

// Different ways into the same move, so the wording doesn't repeat across sessions.
const ANGLES: Record<string, readonly string[]> = {
  discover: [
    "ask about the last week (what ate the most time).",
    "ask about something they keep putting off.",
    "ask what the most annoying part of their day was lately.",
  ],
  "ask-call": [
    "lead with speed (a call is quicker than typing).",
    "lead with ease (they can just talk, you'll handle the rest).",
    "lead with time (about a minute, then back to their day).",
  ],
  offramp: [
    "offer one concrete example that fits what they said.",
    "make it tiny: one small thing you could take off their plate today.",
    "a light, honest check: is now a bad time, want to pick it up later?",
  ],
};
export function withAngle(s: Session, move: MoveDef): MoveDef {
  const angles = ANGLES[move.id];
  return angles ? { ...move, instruction: `${move.instruction} Angle this time: ${pick(s, move.id, angles)}` } : move;
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
    instruction:
      "If they just told you something, react to it in a few words first (their words, e.g. \"oof, [their thing]\"). Then ONE short call offer with the benefit in it, e.g. \"want me to just call you? way faster than typing this out\", and make texting an equally easy yes. One question total; don't explain how the call works or what you'll do on it.",
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
      "Play back what they said in THEIR words (short), if they named a bigger problem underneath it, say it back in their words (never a guess of your own), and give one small piece of real advice or comfort they can use today. Specific to them, not a feature list. Don't ask for gmail in this same message.",
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
      "Give them one small, concrete piece of help about their situation (a tip, a first step, a reassurance). Do NOT mention gmail, email access, or a link: the system adds that question right after your words.",
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
  nameMe: {
    id: "name-me",
    label: "a light second try at a name, with a suggestion",
    source: "cialdini (1984): commitment through a small yes; brown & levinson (1987): easy to decline",
    instruction:
      "Respond to what they said first. Then, lightly, since there's no name for you yet: suggest one name that fits what you've been doing together and ask if it works, e.g. \"btw, want to name me? how about sage? or pick your own.\" One line, easy to ignore, never pointing out that they didn't name you.",
  },
  steerBack: {
    id: "steer-back",
    label: "help, then one light step back",
    source: "pink, to sell is human (2012): offramps; hulick (2014): get to value, then finish setup",
    instruction:
      "Help with what they asked first, briefly. Then take ONE light step toward whatever the STATE shows is still missing (naming you, what to call them, the quick call, or gmail), tied to what they're doing right now, as an easy yes or no. Never a list of what's missing.",
  },
  bridge: {
    id: "bridge",
    label: "answer, then bridge back",
    source: "grice (1975): relevance; packard & berger (2021): concrete language",
    instruction:
      "They asked something off to the side. Answer it briefly and honestly first. Then bridge back with one concrete, specific next step (not generic). If you're parking their topic, say you'll come back to it.",
  },
  follow: {
    id: "follow",
    label: "they lead, you follow",
    source: "rogers & farson, active listening (1957); nichols, the lost art of listening (1995)",
    instruction:
      "They just told you where they want to go. Go there now: help with exactly that, concretely. Don't redirect, don't dig into something else, don't \"back up\". If a setup step is what unlocks it, offer that step as the way to do it.",
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
  replied: {
    id: "replied",
    label: "they pointed at one message: answer about that one",
    source: "clark & brennan (1991): grounding; grice (1975): relation",
    instruction: "They used Reply on one message (quoted before their text). Answer about that message only, the way they asked (\"explain\" means explain it). No setup this turn: don't ask for a name, don't offer a call, don't bring up gmail.",
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
  honest: { id: "honest-status", label: "say exactly what did and didn't happen", source: "grice (1975): maxim of quality" },
  greet: { id: "greet", label: "pick up where the texts left off", source: "dixon et al. (2013): never make them repeat themselves" },
  nudge: { id: "nudge", label: "left on read: one easy double text, then let it be", source: "pink, to sell is human (2012): buoyancy; brown & levinson (1987): low imposition" },
  defaultName: { id: "default-name", label: "no name yet: a default they can change", source: "thaler & sunstein, nudge (2008): smart defaults; hulick (2014)" },
} satisfies Record<string, Move>;

export function chooseMove(s: Session, channel: Channel, opts: { callFirst: boolean; mayAsk: boolean }): MoveDef {
  const text = lastUser(s);
  const need = s.slots.helpNeed;
  if (s.phase === "graduated") return MOVES.help;
  // Reply on one message: that message is the topic, not setup.
  if (replyFocus(s)) return MOVES.replied;
  // A real task: do it (a run offered a call over "create a weather report..." and ignored it).
  if (taskNow(s)) return MOVES.follow;
  if (opts.callFirst && channel === "text") return MOVES.askCall;
  // Two turns of pure help with setup still open: help again, then one light step back toward what's
  // missing (a run went a whole meal plan without ever returning to the name or the call).
  const lastTwo = (s.movesUsed ?? []).slice(-2);
  const openSlots = (["agentName", "userName", "helpNeed", "gmail"] as const).some((k) => s.slots[k].status === "missing");
  if (opts.mayAsk && openSlots && lastTwo.length === 2 && lastTwo.every((m) => PURE_HELP.has(m))) return MOVES.steerBack;
  // They skipped naming it: a few turns later, one light try with a suggestion (never on a call, at most twice).
  if (channel === "text" && opts.mayAsk && s.slots.agentName.status === "missing" && s.slots.agentName.asks < 2 && !USER_LEADS.test(text)) {
    const lastNameAsk = s.transcript.findLastIndex((m) => m.role === "agent" && (m.move?.id === "intro" || m.move?.id === "name-me"));
    const turnsSince = s.transcript.slice(lastNameAsk + 1).filter((m) => m.role === "user").length;
    if (turnsSince >= 3) return MOVES.nameMe;
  }
  // The user leads. When they say what they want ("i want to use you for email"), go there now:
  // for email that's the gmail offer (the setup step that unlocks it), otherwise just help. No more digging.
  if (USER_LEADS.test(text) || ASKS_FOR_HELP.test(text)) {
    if (s.slots.gmail.status === "missing" && !used(s, "ask-gmail") && !linkOut(s) && /\b(e-?mails?|inbox|gmail|mail)\b/i.test(text)) return MOVES.askGmail;
    return MOVES.follow;
  }
  // They called us: listen and follow their lead.
  if (channel === "voice" && s.call.byUser && userTurnsThisCall(s) < INBOUND_OWN_TURNS) return STALL.test(text) ? MOVES.offramp : MOVES.answer;
  // On the call, the name comes first and naturally (the greeting asks it).
  if (channel === "voice" && s.slots.userName.status === "missing" && !used(s, "ask-name")) return MOVES.askName;
  // This is onboarding for a service they already signed up for, not customer discovery (journal 09):
  // once we know what's bothering them, one mom test style question at most, then the gmail offer,
  // on the call, while they're still talking about it. Asking to help ("anything you can offer?") skips the question.
  if (channel === "voice" && need.status === "filled" && s.slots.gmail.status === "missing" && !used(s, "ask-gmail") && !linkOut(s)) {
    // Any question it already asked on this call counts (the move label doesn't matter).
    const start = s.call.startedAt ?? 0;
    const questionsAsked = Math.max(
      (s.movesUsed ?? []).filter((m) => DISCOVERY.has(m)).length,
      s.transcript.filter((m) => m.role === "agent" && m.channel === "voice" && m.ts >= start && m.move?.id !== "greet" && m.move?.id !== "silence" && m.text.trim().endsWith("?")).length,
    );
    if (questionsAsked >= 1 || ASKS_FOR_HELP.test(text)) return MOVES.askGmail;
  }
  if (OFF_TOPIC.test(text) && text.length > 3 && !/\b(call|gmail|email|link)\b/i.test(text)) return opts.mayAsk ? MOVES.bridge : MOVES.answer;
  if (need.status === "missing") {
    // Only a clear "i know what i want, skip this", not every "just" or "can you".
    if (/\b(skip (all (of )?)?(this|that|setup|the setup|it|the rest)|already know what i (want|need)|just (want|need) you to|let'?s (just )?get (to it|started))\b/i.test(text)) return MOVES.graduate;
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
  // Once per conversation, and never while the link is already in their texts.
  if (s.slots.gmail.status === "missing" && !used(s, "ask-gmail") && !linkOut(s)) return MOVES.askGmail;
  return MOVES.help;
}

export function markUsed(s: Session, id: string) {
  (s.movesUsed ??= []).push(id);
  if (s.movesUsed.length > 40) s.movesUsed.splice(0, s.movesUsed.length - 40);
}

// Moves that dig into their situation (each one is a question to them, even "give first" usually ends in one).
const DISCOVERY = new Set(["discover", "dig", "give-first", "playback", "offramp"]);
// They're asking what we can do for them: that's the cue to offer, not to ask another question.
const ASKS_FOR_HELP = /\b(anything (you|u) (can|could) (do|offer)|what can (you|u) do|can (you|u) help|how (can|could|would) (you|u) help|is there (a|any|some) (way|solution|fix)|any (ideas|solution|suggestions))\b/i;

// They're steering: saying what they want, not answering our question.
const USER_LEADS = /\b(i'?m (interested in|looking for|trying to)|i (want|need|would like|wanna) (you )?to|i'?d like (you )?to|(use|using) you (for|to)|let'?s (do|talk about|start|get)|help me (with|to)|can we (do|talk about|start))\b/i;

// Turns that only helped, with no step toward setup.
const PURE_HELP = new Set(["follow", "help", "answer", "give-first"]);

// The connect link is already in their texts (sent, not failed): don't ask again.
function linkOut(s: Session) {
  const lastLink = s.transcript.map((m) => m.kind).lastIndexOf("gmail_link");
  const lastFail = s.transcript.findLastIndex((m) => m.kind === "event" && /^Gmail connection/.test(m.text));
  return lastLink >= 0 && lastLink > lastFail;
}
