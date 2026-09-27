import type { Msg } from "./types";

// Cheap, deterministic read of how the user is showing up right now.
// Humans misread tone in text about half the time while feeling ~90% sure (Kruger et al. 2005),
// so this outputs a soft guess with a confidence, and the guidance is phrased as a nudge.
// Evidence per signal: docs/journal/05-research.md.
export type Mood = "cooperative" | "rushed" | "curious" | "resistant" | "confused" | "playful";

const RUSHED = /\b(skip|just|quick(ly)?|hurry|asap|busy|whatever|get to it|move on|let'?s go|tl;?dr|no time)\b/i;
const RESIST = /\b(no|nope|nah|don'?t|won'?t|rather not|not telling|none of your|why do you (need|want)|stop asking|privacy|creepy|leave me)\b/i;
const CONFUSED = /\b(huh|confused|don'?t (get|understand)|what do you mean|how does (this|that|it) work|i'?m lost|wdym)\b/i;
const PLAYFUL = /(\blol\b|lmao|haha|😂|🤣|😜|😏|\bjk\b|bruh)/i;
const ACRONYM_OK = /^(OK|OMG|LOL|ASAP|FYI|BTW|IDK|TBH|AI|US|UK|NYC|CEO|PM|AM|USA|DM)$/;

function gibberish(t: string) {
  const letters = t.replace(/[^a-z]/gi, "");
  if (letters.length < 4) return false;
  const vowels = (letters.match(/[aeiou]/gi) ?? []).length;
  return vowels / letters.length < 0.15 || /([^aeiou\s])\1{3,}/i.test(t);
}

const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

// Shouting = several all-caps words that aren't acronyms or a single emphasized word ("that's HUGE").
function shouting(t: string) {
  const caps = t.split(/\s+/).filter((w) => /^[A-Z]{2,}[!?.]*$/.test(w) && !ACRONYM_OK.test(w.replace(/[!?.]/g, "")));
  return caps.length >= 2 && caps.length / Math.max(1, wordCount(t)) >= 0.5;
}

export interface MoodRead {
  mood: Mood;
  confidence: "low" | "medium";
  intensity: "normal" | "high";
  signals: string[];
}

export function readMood(transcript: Msg[]): MoodRead {
  const users = transcript.filter((m) => m.role === "user");
  const lastUser = users[users.length - 1];
  const last = lastUser?.text.trim() ?? "";
  const signals: string[] = [];
  if (!last) return { mood: "cooperative", confidence: "low", intensity: "normal", signals };

  const n = wordCount(last);
  // Judge brevity against this person's own baseline: some people always text short.
  const prior = users.slice(-6, -1).map((m) => wordCount(m.text));
  const baseline = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : 6;
  const lastAgent = [...transcript].reverse().find((m) => m.role === "agent" && m.ts <= (lastUser?.ts ?? 0));

  const score: Record<Mood, number> = { cooperative: 0.5, rushed: 0, curious: 0, resistant: 0, confused: 0, playful: 0 };
  const add = (mood: Mood, w: number, why: string) => {
    score[mood] += w;
    signals.push(why);
  };

  if (gibberish(last)) add("confused", 2, "gibberish");
  if (/^\?+$/.test(last)) add("confused", 2, "lone question mark");
  if (CONFUSED.test(last)) add("confused", 1.5, "confusion words");
  if (RUSHED.test(last)) add("rushed", 1.5, "rush words");
  if (RESIST.test(last)) add("resistant", 1.2, "refusal words");
  if (PLAYFUL.test(last)) add("playful", 1, "laughing");
  if (/\?/.test(last) && !/^\?+$/.test(last) && !CONFUSED.test(last)) add("curious", 1, "asking something");
  // "k" after a long message from us reads as disengaged or rushed.
  if (/^(k|kk|ok|okay)\.?$/i.test(last) && lastAgent && wordCount(lastAgent.text) > 25) add("rushed", 1, "'k' after a long message");
  // A period on a one or two word reply reads as abrupt (Houghton et al. 2018). Only on short messages.
  if (n <= 2 && /[a-z]\.$/i.test(last)) add("resistant", 0.6, "clipped reply with a period");
  if (n <= 2 && prior.length >= 2 && baseline >= 6) add("rushed", 0.8, "much shorter than their usual");
  if (shouting(last)) add("resistant", 1, "all caps");
  // Exclamation marks read as sincere and positive (Gunraj et al. 2016).
  if (/!/.test(last) && !shouting(last)) add("cooperative", 0.5, "exclamation");
  // Emoji are ambiguous across people and platforms (Miller et al. 2016): tiny weight only.
  if (/\p{Extended_Pictographic}/u.test(last) && !PLAYFUL.test(last)) add("playful", 0.3, "emoji");

  // Letter stretching ("sooo", "noooo") raises intensity; direction comes from the words (Brody & Diakopoulos 2011).
  const intensity = /([a-z])\1{2,}/i.test(last) || shouting(last) ? "high" : "normal";

  const ranked = (Object.entries(score) as [Mood, number][]).sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  const mood = top[1] >= 1 ? top[0] : "cooperative";
  // No single weak signal should ever produce a confident read.
  const confidence = top[1] >= 2 && top[1] - second[1] >= 1 ? "medium" : "low";
  return { mood, confidence, intensity, signals };
}

// How each mood nudges the agent. Soft by design: a wrong guess should cost little.
export const MOOD_GUIDANCE: Record<Mood, string> = {
  cooperative: "They're with you. Keep momentum: acknowledge in a few words, then the next natural step.",
  rushed: "They may be short on patience. Compress: one short bubble, skip small talk, offer to skip ahead or graduate. Never make them repeat themselves.",
  curious: "They're asking things. Answer their question properly first (that's the value), then only if it fits, one light step forward.",
  resistant: "They may be pushing back. Don't argue or re-ask. Acknowledge in a few words, give something useful with no strings, and let them lead.",
  confused: "They may be lost. Get concrete: say plainly what you are and what happens next, and offer two easy options instead of an open question.",
  playful: "They seem to be having fun. Match the energy briefly, then steer back with a smile. Accept joke answers if they're usable.",
};
