// the research families behind each move (src/lib/moves.ts), six at most, always shown with a text label
import type { Msg, Move } from "@/lib/types";

export interface Framework {
  id: string;
  label: string;
  color: string; // stripe + ring only; the label carries the meaning
  gist: string; // one line on why this family of moves exists
}

export const FRAMEWORKS: Record<string, Framework> = {
  mom: { id: "mom", label: "mom test", color: "#059669", gist: "ask about their real, recent life, not hypotheticals, and don't pitch yet." },
  attune: { id: "attune", label: "attunement", color: "#DB2777", gist: "mirror their words and follow where they lead, so they feel heard first." },
  recip: { id: "recip", label: "reciprocity", color: "#D97706", gist: "give something useful before asking for anything back." },
  polite: { id: "polite", label: "permission", color: "#7C3AED", gist: "ask with a reason and make no an easy answer." },
  clarity: { id: "clarity", label: "clarity", color: "#0891B2", gist: "say only what's true, relevant and short enough to read." },
  other: { id: "other", label: "craft", color: "#6E6E73", gist: "onboarding and service practice: low effort, no repeats, get out of the way." },
};

// by move id first (src/lib/moves.ts), then by who the source cites
const BY_ID: Record<string, string> = {
  discover: "mom",
  dig: "mom",
  playback: "attune",
  follow: "attune",
  offramp: "attune",
  "steer-back": "attune",
  "ask-name": "attune",
  "give-first": "recip",
  intro: "recip",
  "name-me": "recip",
  "ask-call": "polite",
  "ask-gmail": "polite",
  declined: "polite",
  named: "polite",
  bridge: "clarity",
  answer: "clarity",
  "honest-status": "clarity",
};

export function frameworkOf(move: Move): Framework {
  const id = BY_ID[move.id];
  if (id) return FRAMEWORKS[id];
  const s = move.source.toLowerCase();
  if (s.includes("fitzpatrick")) return FRAMEWORKS.mom;
  if (/pink|voss|rogers|nichols|carnegie/.test(s)) return FRAMEWORKS.attune;
  if (/cialdini|sierra/.test(s)) return FRAMEWORKS.recip;
  if (/brown|levinson|tan et al/.test(s)) return FRAMEWORKS.polite;
  if (s.includes("grice")) return FRAMEWORKS.clarity;
  return FRAMEWORKS.other;
}

export interface Turn {
  m: Msg;
  move: Move;
  fw: Framework;
  n: number; // 1-based among explained turns
}

// every agent message that carries a move, in order (texts and call lines)
export function turnsOf(messages: Msg[]): Turn[] {
  return messages.filter((m) => m.role === "agent" && m.move).map((m, i) => ({ m, move: m.move!, fw: frameworkOf(m.move!), n: i + 1 }));
}

export const PIPELINE: [string, string][] = [
  ["you say something", "text or voice, same conversation"],
  ["code reads it", "your name, what you need, your mood, whether you're steering"],
  ["code picks one move", "from the research: listen, one question, give first, the gmail offer..."],
  ["the model writes the words", "in its own voice, following that move"],
  ["code checks the result", "no false claims, no repeated asks, a goodbye before any hangup"],
];
