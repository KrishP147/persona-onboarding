import { LAUGH_TOKEN } from "./intents";

export function parseTypedEmail(text: string): { to: string; subject: string; body: string } | null {
  const lines = text.replace(/\*\*/g, "").split("\n");
  const si = lines.findIndex((l) => /^\s*subject:/i.test(l));
  if (si < 0) return null;
  const to = text.match(/^\s*to:\s*<?([^\s<>@]+@[^\s<>]+?)>?\s*$/im)?.[1] ?? "";
  const subject = lines[si].replace(/^\s*subject:\s*/i, "").trim();
  const paras = lines.slice(si + 1).join("\n").replace(/^\s*-{3,}\s*$/gm, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  // Trailing questions ("want me to send it?") are the assistant talking, not the email.
  // The email ends at its sign-off ("best,\nkrish"); anything after is the assistant talking.
  const signoff = paras.findLastIndex((p) => /^(best|thanks|thank you|cheers|regards|kind regards|best regards|sincerely|warmly|talk soon|see you)\b/im.test(p));
  if (signoff >= 0) paras.splice(signoff + 1);
  while (paras.length > 1 && (/\?\s*$/.test(paras[paras.length - 1]) || /\b(let me know|want me to|would you like|should i|any changes)\b/i.test(paras[paras.length - 1]))) paras.pop();
  const body = paras.join("\n\n").trim();
  return body ? { to, subject, body } : null;
}

// The draft already went out as its own message: drop any retyped copy of it from the reply.
export function dropDraftEcho(text: string, draft: string) {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const d = norm(draft);
  const keep = (line: string) => {
    const n = norm(line);
    if (!n || /^\s*\[[^\]]*\]\s*$/.test(line)) return false;
    if (/^\s*(to|subject):|^\s*here'?s (a |the |your )?(email |)draft/i.test(line)) return false;
    return !(n.length >= 4 && d.includes(n));
  };
  return text
    .split(/\n\s*\n/)
    .map((p) => p.split("\n").filter(keep).join("\n"))
    .filter((p) => p.trim())
    .join("\n\n")
    .trim();
}

export const GOODBYE = /\b(bye|goodbye|talk (to you )?(soon|later)|take care|catch you|ciao|see ya|i'?ll let you go|call me (back )?(whenever|anytime)|good talking|have a (good|great|nice|lovely) (one|day|night|evening|weekend)|see (you|ya)|later!|i'?ll text you( instead)?)\b/i;
// "i just sent you a link" said without actually sending one.
export const CLAIMS_LINK = /\b(sent|dropped|texted|shared|popped)\b[^.?!]{0,40}\b(link|it)\b|\blink\b[^.?!]{0,30}\b(your texts|our texts|the chat|the thread)\b|\b(it'?s|it is) (in|on) (your|our) texts\b|\b(see it|it'?ll|it will|should) (pop up|show up|appear|land)\b[^.?!]{0,30}\b(texts|chat)\b/i;
// Bracketed stage directions ("[starting call...]") are never said out loud or texted.
export const STAGE_BRACKETS = /\s*\[([^\]\n]{1,160})\]\s*/g;
// Fill-ins in a draft ("hi [client's name],") stay; stripping them left "hi ,".
export const PLACEHOLDER = /\b(name|company|business|date|time|day|email|phone|number|address|role|position|title|service|services|detail|details|amount|price|link|your|their|recipient|client|team|city|industry|x+)\b/i;
export const STAGE_VERB = /^\s*\*?\s*(sends?|sending|sent|calling|calls?|dials?|dialing|pauses?|laughs?|smiles?|waits?|typing|hangs? up|ringing|drops?)\b/i;

export const CLAIMS_SENT = /^\s*(sent|done|all set)\b|\b(i('?ve| have)? (just )?sent|it'?s (been )?sent|email (is )?sent|sending (it|that|now)|on its way|(ready|good) to go|went out|it'?s out)\b/i;
export const EMPTY_PROMISE = /\b(give me (just )?(a|one) (sec|second|moment|minute)|one sec(ond)?|i'?m (looking at|reading|going through) (it|this|that|them)( now)?|let me (pull|look|check|grab|find)|pulling (those|that|it|them) up|checking (now|on that))\b/i;
// The model talking about its own setup instead of to the person ("the system is being strict about
// the most recent message context..."). Only user-facing words ever go out; any sentence like this is dropped.
export const LEAK =
  /\b(the system|system (prompt|message|note|instruction)s?|my (instructions|prompt|guidelines)|(the|my) instructions (say|tell|are)|instructed to|message context|most recent message|(is|was|has been|have been) already sent|already been sent|tool (call|result|output)s?|function call|the (assistant|model)\b|language model|conversation (history|log)|the transcript|recap instruction|(i'?m|i am) (not )?(allowed|supposed|permitted) to|as per (my|the) (rules|instructions)|onboarding (step|flow|item)s?)\b/i;
// Promises it has no tool for: calling a business, booking, touching their inbox beyond reading and
// drafting, or a deliverable "later" ("i'm calling dr. patel now", "flagging that email", "i'll pull the list together").
// "i'll call you" is fine (that's us), so only third parties count.
export const CANT_DO =
  /\b(i'?m|i am|i'?ll|i will|let me|going to|gonna)\s+(just\s+)?(call(ing)?|ring(ing)?|phon(e|ing)|dial(ing)?)\s+(them|their|the (dentist|doctor|office|restaurant|place|clinic|salon|hotel|shop|store)|dr\.?\s|[a-z]+'s\b)|\b(i'?m|i'?ll|i will|let me)\s+(book|reserv|flag|star|archiv|delet|unsubscrib|set(ting)? up (a )?(filter|reminder))\w*|\b(flagging|archiving|deleting) (that|it|this|the|those|them)\b|\bi'?ll (get|put|pull|have) (that|those|it|them|the|your)\b[^.!?]{0,40}\b(together|ready|over to you)\b/i;
export const META = /\b(let me back up|wait for (them|him|her)|for (them|him|her) to (text|reply|respond|get back)|i'?m waiting for|i should (stay|wait|remain|let|keep)|since (they|he|she|the user)|the user|i'?ll (stay quiet|wait (silently|quietly))|let them (check|speak|respond)|stay quiet|respond when ready|they haven'?t said)\b/i;

// Talking ABOUT them instead of TO them ("I'll text Paul a quick message... letting him know...").
export const THIRD_PERSON = /\b(letting (him|her|them) know|acknowledging the|a quick message (to|for)|(text|message|ping|remind) (him|her)\b)/i;
export function narratesAbout(x: string, userName?: string | null) {
  if (THIRD_PERSON.test(x)) return true;
  if (!userName) return false;
  const n = userName.replace(/[.*+?^${}()|[\]\\]/g, "");
  // "I'll text Paul", "Paul hasn't replied", "Paul is still on the call": their name as a third person.
  return new RegExp(`\\b(text|message|tell|remind|let|ping|call) ${n}\\b|\\b${n} (is|was|has|hasn'?t|isn'?t|said|seems|wants)\\b`, "i").test(x);
}

// `hits` (optional) collects a guard label for each kind of sentence that got dropped.
export function cleanModelText(t: string, userName?: string | null, hits?: string[]) {
  const hit = (label: string) => {
    if (hits && !hits.includes(label)) hits.push(label);
  };
  if (TOOL_NAMES.test(t)) hit("tool names stripped");
  TOOL_NAMES.lastIndex = 0;
  // The chat shows plain text, like sms: markdown bold/headers would show as literal symbols.
  const cleaned = unfence(t).replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/^#{1,4}\s+/gm, "").replace(TOOL_NAMES, " ").replace(STAGE_BRACKETS, keepFillIns).replace(/^\s*\[|\]\s*$/gm, "").replace(/[ \t]{2,}/g, " ").trim();
  const keep = (x: string) => {
    if (META.test(x) || LEAK.test(x) || /\bSTATE\b/.test(x) || narratesAbout(x, userName)) {
      hit("leak filtered");
      return false;
    }
    if (EMPTY_PROMISE.test(x) || CANT_DO.test(x)) {
      hit("dropped unsupported claim");
      return false;
    }
    return true;
  };
  return cleaned
    .split(/\n\s*\n/)
    .map((b) => b.split(SENTENCE_BREAK).filter(keep).join(" "))
    .filter((b) => b.trim())
    .join("\n\n")
    .trim();
}
// Tool names occasionally leak into the reply text ("[send_gmail_link] sent it..."): never say them.
export const TOOL_NAMES = /\s*\[?\b(set_slot|decline_slot|offer_call|start_call|send_gmail_link|end_call|graduate|send_gif)\b\]?\s*/gi;

// Cut a reply at the first repeated sentence (models occasionally loop: "let's go. let's go...").
export function stopAtRepeat(text: string) {
  const seen = new Set<string>();
  let out = "";
  for (const piece of text.match(/[^.!?\n]+[.!?]*\s*|\n+/g) ?? []) {
    const key = piece.trim().toLowerCase();
    if (key.length > 3 && seen.has(key)) break;
    if (key) seen.add(key);
    out += piece;
  }
  return out.trim();
}

// A sentence ends at . ! or ?, but not after "dr." or "mr." ("got it, dr. patel" was once cut to "got it, dr.").
export const SENTENCE_BREAK = /(?<!\b(?:dr|mr|mrs|ms|st|jr|sr|prof|mt|vs|ave|approx)\.)(?<=[.!?])\s+/i;
// For cutting length only, a closing quote or paren after the stop still ends the sentence.
export const SENTENCE_END = /(?<!\b(?:dr|mr|mrs|ms|st|jr|sr|prof|mt|vs|ave|approx)\.["')]*)(?<=[.!?]["')]*)\s+/i;

export function capSentences(text: string, max: number) {
  const parts = text.split(SENTENCE_END);
  return parts.length <= max ? text : parts.slice(0, max).join(" ").trim();
}

export function keepFillIns(m: string, inner: string) {
  return PLACEHOLDER.test(inner) && !STAGE_VERB.test(inner) ? m : " ";
}

// --- email drafts and sending (gmail.compose) ---

// A reply is at most a few texts: a long list stays together in the last bubble instead of arriving
// as a dozen separate messages.
export function capBubbles(bubbles: string[], max: number) {
  return bubbles.length <= max ? bubbles : [...bubbles.slice(0, max - 1), bubbles.slice(max - 1).join("\n\n")];
}

// The model has no clock: without this it guessed "january 2025" for today's date.
export function nowLine(tz?: string, now = new Date()) {
  const fmt = (zone: string) =>
    now.toLocaleString("en-US", { timeZone: zone, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `NOW: ${fmt("UTC")} UTC${tz ? `; their local time: ${fmt(tz)} (${tz})` : ""}. Use this for any question about today's date, the day, or the time anywhere (convert time zones from it); never guess the date.`;
}

// "lol ok" / "haha sure": the laugh is a reaction, the rest is the answer.
export const LAUGH_LEAD = new RegExp(`^\\s*${LAUGH_TOKEN}[!., ]+`, "iu");

// Fences: what the user typed, what tools returned, and what emails say reach the model inside tags, and the
// prompt treats anything fenced as data, never instructions. Tag look-alikes inside the content are dropped,
// so a message can't close its own fence.
export const FENCE_TAGS = /<\/?\s*(user_said|email_content|tool_result)\b[^>]*>/gi;
export const unfence = (t: string) => t.replace(FENCE_TAGS, "");
export const fence = (tag: "user_said" | "email_content", t: string) => `<${tag}>${unfence(t)}</${tag}>`;

// Pointing out what they didn't do reads as blame, even said lightly ("ha, you skipped my name").
export const ACCUSING =
  /\b(you (skipped|forgot|missed|ignored)\b|you never (gave|told|answered|named|replied|said|picked)|you (didn'?t|did not|haven'?t|have not) (answer|reply|respond|say|give|tell|name|pick|get back)|why (didn'?t|haven'?t|won'?t|wouldn'?t) you|did you forget|left me on read)/i;
// A guess about them stated as fact. Say what they said, or ask.
export const ASSUMING = /\b(sounds like you('re| are| have| must)|you must (be|have|feel)|you seem( to be)?|seems like you|you('re| are) (clearly|obviously|probably))\b/i;

// Reasoning written as if nobody's reading: the user in the third person, the agent narrating its own plan or
// state, or a stage direction. Every word goes to them as a text, so these sentences never go out.
export const NARRATION =
  /\b(the (user|person|caller|human)|i'?ll (just )?(wait|hold off|stay quiet|keep quiet|stand by|sit tight|leave it)|(wait(ing)?|until) for (them|him|her|a reply|a response|their)|for (them|him|her) to (text|reply|respond|get back|answer|say)|(the call'?s|the call (has|is|was)) (already )?(ended|over|done|finished)|no (response|reply|message|action) (is )?(needed|necessary|required)|nothing (to say|needed|to add)|(they|he|she) (hasn'?t|haven'?t|didn'?t|isn'?t|aren'?t|is|are|seems?|might|may|will|'ll|'re|'s) (still )?(busy|away|gone|typing|reading|responding|replying|quiet|silent|there|ready|thinking|not)\b)/i;
export const STAGE_DIRECTION = /^\s*[(*[][^)*\]]*[)*\]]\s*[.!]?\s*$/;
