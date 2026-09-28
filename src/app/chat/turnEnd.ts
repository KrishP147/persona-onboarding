// when the user's turn ends: a pause whose length depends on whether they sound finished.
// ~0.7s when complete, much longer mid-phrase or while spelling things out (humans gap ~0-200ms,
// and gaps past ~600-700ms start to read as hesitation: stivers et al. 2009, kendrick & torreira 2015).
// chopping a sentence in two is worse than a slow answer, so anything that sounds unfinished waits.

export const TURN_END_COMPLETE_MS = 700;
export const TURN_END_MIDPHRASE_MS = 1800;
export const TURN_END_SPELLING_MS = 1400;
export const TURN_END_FAST_MS = 250;

// endings that promise more ("so i'm just", "you said you'd tell me about")
const TRAILING = new RegExp(
  "\\b(" +
    [
      "and", "but", "or", "so", "because", "the", "a", "an", "my", "is", "are", "to", "of", "with", "for", "like", "then", "if", "at", "dot",
      "just", "i['’]?m", "i was", "i think", "i mean", "you know", "kind of", "sort of", "maybe", "really", "when", "that", "which", "who", "what", "how",
      "it['’]?s", "there['’]?s", "gonna", "wanna", "about", "from", "into", "on", "in", "your", "their", "his", "her", "our",
      "um+", "uh+", "er+", "hm+",
    ].join("|") +
    ")$",
  "i",
);
const SPELLING = /(\d\s*){3,}$|@|\bdot\b|\bat\b\s*$|\bemail is\b|\bnumber is\b|\baddress is\b/i;

// punctuated: the transcript has real punctuation (deepgram smart_format), so a missing full stop means unfinished.
export function turnEndDelay(text: string, speechFinal = false, punctuated = false) {
  const t = text.trim();
  if (SPELLING.test(t)) return TURN_END_SPELLING_MS;
  // a question or exclamation is finished whatever its last word; a period after "just" is only a pause
  const bare = /[?!]$/.test(t) ? "" : t.replace(/[.,…\s]+$/, "");
  if ((bare && TRAILING.test(bare)) || /,$/.test(t)) return TURN_END_MIDPHRASE_MS;
  if (punctuated && t && !/[.?!]["')]*$/.test(t)) return TURN_END_MIDPHRASE_MS;
  // deepgram heard a pause AND the sentence sounds finished: answer quickly. a pause mid-thought
  // ("yes. can you type this...") gets the normal wait, so one sentence isn't chopped into three turns.
  if (speechFinal && /[.?!]$/.test(t)) return TURN_END_FAST_MS;
  return TURN_END_COMPLETE_MS;
}
