import type { Msg } from "./types";

// Cheap, deterministic read of how the user is showing up right now.
// Drives style, not content: the goal is to meet people where they are.
export type Mood = "cooperative" | "rushed" | "curious" | "resistant" | "confused" | "playful";

const RUSHED = /\b(skip|just|quick(ly)?|hurry|asap|busy|whatever|get to it|move on|let'?s go|tl;?dr|no time)\b/i;
const RESIST = /\b(no|nope|nah|don'?t|won'?t|rather not|not telling|none of your|why do you (need|want)|stop asking|privacy|creepy|leave me)\b/i;
const CONFUSED = /\b(what\?|huh|confused|don'?t (get|understand)|what do you mean|how does|i'?m lost|wdym|\?\?)\b/i;
const PLAYFUL = /(lol|lmao|haha|😂|🤣|😜|😏|jk|bruh)/i;

function gibberish(t: string) {
  const letters = t.replace(/[^a-z]/gi, "");
  if (letters.length < 4) return false;
  const vowels = (letters.match(/[aeiou]/gi) ?? []).length;
  return vowels / letters.length < 0.15 || /(.)\1{4,}/.test(t);
}

export interface MoodRead {
  mood: Mood;
  signals: string[];
}

export function readMood(transcript: Msg[]): MoodRead {
  const users = transcript.filter((m) => m.role === "user").slice(-3);
  const last = users[users.length - 1]?.text.trim() ?? "";
  const signals: string[] = [];
  if (!last) return { mood: "cooperative", signals };

  if (gibberish(last)) signals.push("gibberish");
  if (RUSHED.test(last)) signals.push("rush words");
  if (RESIST.test(last)) signals.push("refusal words");
  if (CONFUSED.test(last)) signals.push("confusion words");
  if (PLAYFUL.test(last)) signals.push("playful");
  const questions = (last.match(/\?/g) ?? []).length;
  if (questions >= 1 && !CONFUSED.test(last)) signals.push("asking questions");
  const shortStreak = users.length >= 2 && users.every((m) => m.text.trim().split(/\s+/).length <= 2);
  if (shortStreak) signals.push("terse replies");

  let mood: Mood = "cooperative";
  if (signals.includes("gibberish") || signals.includes("confusion words")) mood = "confused";
  else if (signals.includes("rush words")) mood = "rushed";
  else if (signals.includes("refusal words")) mood = "resistant";
  else if (signals.includes("asking questions")) mood = "curious";
  else if (signals.includes("playful")) mood = "playful";
  else if (shortStreak) mood = "rushed";
  return { mood, signals };
}

// How each mood should change the agent's move. Grounded in docs/journal/03-principles.md.
export const MOOD_GUIDANCE: Record<Mood, string> = {
  cooperative: "They're with you. Keep momentum: acknowledge in a few words, then the next natural step.",
  rushed: "They're short on patience. Compress: one short bubble, skip small talk, offer to skip ahead or graduate. Never make them repeat themselves.",
  curious: "They're asking things. Answer their question properly first (that's the value), then only if it fits, one light step forward.",
  resistant: "They're pushing back. Don't argue or re-ask. Label it lightly (\"totally fair\"), give something useful with no strings, and let them lead.",
  confused: "They're lost. Get concrete: say plainly what you are and what happens next, and offer two easy options instead of an open question.",
  playful: "They're having fun. Match the energy briefly, then steer back with a smile. Accept joke answers if they're usable.",
};
