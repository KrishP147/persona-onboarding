import { type Session } from "../types";

import { SENTENCE_BREAK } from "./text";

export const HOLD = /\b(hold on|hang on|one sec(ond)?|give me a (sec|second|minute|moment)|wait a (sec|second|minute|moment)|just a (sec|second|moment|minute)|brb|be right back)\b/i;

// Offline guess for common names, used when the model can't be reached (so "julia" still sounds like julia).
export const FEMININE = /^(julia|juliet|sarah|sara|emma|olivia|ava|mia|sophia|sofia|isabella|luna|nova|chloe|grace|lily|zoe|ella|anna|hannah|maya|aria|stella|ruby|ivy|iris|daisy|rose|alice|clara|nora|lucy|jane|kate|katie|amy|emily|jessica|jenny|samantha|siri|alexa|tessa|priya|dana|robin|sage)$/i;
export const MASCULINE = /^(max|jack|james|john|mike|michael|david|daniel|sam|leo|liam|noah|oliver|ethan|lucas|henry|oscar|theo|jarvis|alfred|bob|tom|ben|chris|mark|paul|peter|ryan|kevin|jake|luke|adam|alex|kai|finn|felix|hugo|arthur|george|harry|charlie|dave|steve|jeeves|hal)$/i;
// A whole message that's just laughter or thanks gets a gif back, no words (and no model call).
export const LAUGH_TOKEN = "(?:(?:ha)+h?|(?:he){2,}|lo+l|lmao+|rofl|😂|🤣)";
export const LAUGH = new RegExp(`^\\s*${LAUGH_TOKEN}(?:[!. ]*${LAUGH_TOKEN})*[!. ]*\\s*$`, "iu");
export const THANKS = /^\s*(thanks|thank you|thx|ty|tysm|appreciate it)[!. ]*\s*$/i;

// The phrases that hang up a call with no model involved (stricter than USER_BYE: no bare "later" or "i'm good").
export const CLEAR_BYE = /\b(end (the |this )?call|hang up|you can go|let'?s end|bye|goodbye|gotta go|got to go|talk (to you )?(soon|later)|see (you|ya)|that'?s all|that'?s it)\b/i;
export const WANTS_OUT = /\b(skip|not now|later|no more questions|stop asking|just (help|do|get)|let'?s (just )?(start|go)|that'?s (it|all)|i'?m good|i'?m done|enough setup|just let me (use|try)|stop)\b/i;
// They're wrapping up: only then does the agent hang up on its own.
export const USER_BYE = /\b(end (the |this )?call|hang up|you can go|let'?s end|that'?s enough|bye|goodbye|gotta go|got to go|have to go|need to go|talk (to you )?(soon|later)|that'?s (all|it)|i'?m (done|good|all set)|see (you|ya)|catch you later|later then|laters|hang up|nothing else)\b/i;
// "don't hang up", "i'm not done", "no need to go": the opposite of a bye.
export const DONT_BYE = /\b(don'?t|do not|not|never|no need to)\b[^.!?]{0,12}\b(hang up|go|end|leave|done|bye)\b/i;
// "call me back later" asks for a callback, not a goodbye.
export const CALLBACK = /\b(call|ring) me (back|later|tomorrow|tonight|again|in (a|an|\d))/i;
// A bye counts only as their last words: "bye! oh wait, one more thing" is still talking.
export function saysBye(text: string, phrases: RegExp = USER_BYE) {
  const t = text.trim();
  if (!t || DONT_BYE.test(t) || CALLBACK.test(t)) return false;
  const parts = t.split(SENTENCE_BREAK).filter((x) => x.trim());
  const last = parts[parts.length - 1] ?? "";
  // A question at the end means they're still talking ("i'll do it later, can you check my inbox?").
  if (last.trim().endsWith("?")) return false;
  return phrases.test(last) && last.split(/\s+/).length <= 10;
}
export function userWrappingUp(s: Session) {
  return saysBye(saidNow(s));
}

// The gmail link goes out only after a yes: they asked for it, or said yes to our question about it.
export const WANTS_LINK = /\b(send|text|give|drop|shoot)\b[^.?!]{0,25}\blink\b|\b(connect|hook up|link|conectar|vincular|connecter|enlace|lien)\b[^.?!]{0,20}\b(gmail|email|e-?mail|inbox|google|correo|cuenta)\b/i;
// Our last message brought up the link (asked, or offered "i'll send you a link"), so a yes means yes to it.
export const ASKED_LINK = /\b(link|gmail|connect your)\b/i;
// "send me the link" counts unless that same sentence says not to ("i don't have to worry about..."
// three sentences later once vetoed a clear "connect to my gmail").
export function asksForLink(text: string) {
  return text.split(SENTENCE_BREAK).some((x) => WANTS_LINK.test(x) && !/\b(don'?t|do not|not|never)\b/i.test(x));
}

export function gmailConsent(s: Session) {
  const text = saidNow(s);
  if (asksForLink(text)) return true;
  const users = s.transcript.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0);
  const lastUser = users[users.length - 1] ?? -1;
  const prevAgent = s.transcript.slice(0, lastUser).reverse().find((m) => m.role === "agent" && (!m.kind || m.kind === "text"));
  // "yeah it's been rough, i lose track..." agrees with the feeling, not to a link: a yes must be short or explicit.
  const explicitYes = YES.test(text) && (text.trim().split(/\s+/).length <= 5 || /\b(sure|go ahead|send|do it|please|ok(ay)?|connect)\b/i.test(text));
  return !!prevAgent && ASKED_LINK.test(prevAgent.text) && explicitYes;
}

// A clear "skip setup" (not every "skip"): skip this / all of this / the setup / the rest / ahead.
export const SKIP_SETUP = /\b(skip (all (of )?)?(this|that|it|setup|the setup|the rest|ahead|the questions)|(forget|no more|enough) (the )?(setup|questions)|stop asking (me )?questions)\b/i;
export const SKIP_OFFER = /\b(skip|jump (right )?in|get (right )?started|start (on|with))\b/i;
export const YES = /^\s*((oh|ah|um+|uh+|well|hmm+|haha)[,.!]?\s+)?(yes|yeah|yep|yup|sure|ok(ay)?|do it|please|go ahead|let'?s do it|sounds good|perfect)\b/i;

export function lastUserText(s: Session) {
  return [...s.transcript].reverse().find((m) => m.role === "user")?.text ?? "";
}

// What they said, but only when this turn is their message. On silence, gmail, idle and other system
// events their last words are old news: an earlier "bye" or "skip" must not fire again.
// Marks who started this turn for the duration of fn. An event handled inside a user turn (the demo
// inbox yes connects gmail) stays a user turn.
export async function asTurnBy<T>(s: Session, by: "user" | "event", fn: () => Promise<T>): Promise<T> {
  const outer = s.turnBy;
  if (!(by === "event" && outer)) s.turnBy = by;
  try {
    return await fn();
  } finally {
    if (outer) s.turnBy = outer;
    else delete s.turnBy;
  }
}

export function saidNow(s: Session) {
  return s.turnBy === "event" ? "" : lastUserText(s);
}

export function userWantsOut(s: Session) {
  const text = saidNow(s);
  if (WANTS_OUT.test(text)) return true;
  // "want to skip the rest and just start?" "yeah": that's them asking out too.
  const users = s.transcript.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0);
  const lastUser = users[users.length - 1] ?? -1;
  const prevAgent = s.transcript.slice(0, lastUser).reverse().find((m) => m.role === "agent" && (!m.kind || m.kind === "text"));
  return !!prevAgent && SKIP_OFFER.test(prevAgent.text) && prevAgent.text.includes("?") && YES.test(text);
}

// "no, text is fine" right after a call offer is a no, just like tapping decline.
// Anything short of this ("haha", "lol", "hmm") is not permission to ring.
export const CALL_OK = /\b(yes|yeah|yep|yup|ya|sure|ok(ay)?|k|fine|alright|go ahead|do it|let'?s (go|do it)|down|call|ring|phone)\b/i;
// "you pick" / "idk" hands the choice to us; otherwise a name has to come from them.
export const DELEGATE = /\b(you (pick|choose|decide)|up to you|your (call|choice)|surprise me|whatever|anything|any ?name|i don'?t (care|mind|know)|idc|idk|dunno|no idea|dealer'?s choice)\b/i;
export const CALL_NO = /\b(no|nah|nope|not now|text is fine|rather text|just text|don'?t call|no calls?|hate (phone )?calls)\b/i;
export const OFFERED_CALL = /\b(call|ring|phone)\b[^?]*\?/i;
export const NEGATED_CALL = /\b(don'?t|do not|didn'?t|did not|won'?t|wasn'?t|shouldn'?t|no|not|never|stop)\b[^.!?]{0,20}\b(call|ring|phone)/i;

// Whatever the model wrapped its words in, keep only what a person would actually say.
// The model sometimes narrates its own reasoning ("I'm waiting for Krish to respond. Since they're
// still on the call..."). That is never something to say to them.
// "send it" / "email them" ... and a reply that says it went out.
export const SEND_REQUEST = /\b(send|sned|sewnd|email|forward|reply to)\b/i;
export const NAME_ASK = /\b(what (do you want to|should i|would you like to|will you) (call me|go by)|what should i go by|name (for )?me)\b/i;
// Commands and reactions are never names ("send" once became "Send it is").
export const NOT_A_NAME =
  /^(send|write|draft|call|email|connect|help|stop|cancel|done|next|go|continue|start|test|link|gmail|reply|check|find|search|wait|what\?|no|nah|nope|idk|i don'?t know|dunno|you pick|you choose|up to you|surprise me|anything|whatever|skip|why|what|whats|who|whos|hi|hey|hello|yes|yeah|yep|ok|okay|sure|cool|nice|thanks|thank you|ty|lol|haha|lmao|hmm+|um+|uh+|idc|nothing|none|me|you|it|this|that|i|im)\b/i;
// Answering "what do you want to call me?" with their own name is common: that's THEIR name.
export const OWN_NAME = /^(?:(?:hi|hey|hello)[,! ]+)?(?:i'?m|i am|my name(?:'s| is)|it'?s|this is|call me)\s+([\p{L}][\p{L}'-]{0,19})[.!]?\s*(?:btw|lol)?[.!]?$/iu;

export const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
// A send needs their explicit ok, after they've seen the exact draft.
export const SEND_OK = /\b(send( it| that| this| the (email|draft|message)| away)?|ship it|fire (it )?(off|away)|go ahead|yes|yeah|yep|yup|sure|do it|ok(ay)?|looks good|perfect)\b/i;
export const SEND_HOLD = /\b(don'?t|do not|not yet|wait|hold|change|edit|fix|but|instead|actually|no)\b/i;

// They named the assistant inside a longer message ("call you nova, can you check my email?").
// Answer the name first, with the contact card, before the link or the rest of the reply.
export const NAME_HINT = /\b(call (you|yourself)|your name('?s| is| will be)|name you|i'?ll call you|you'?re|you are|go by)\b/i;
// A bare "send it" (not "send me the link"), and "did you send it?".
export const SEND_CMD = /^\s*(ok(ay)?,? |yes,? |yeah,? |yep,? )?(please )?(send|send it|send that|send the (email|draft|message)|send it now|go ahead and send( it)?|ship it)( now| please)?[.! ]*$/i;
export const SENT_Q = /\b(did (u|you) (send|sent)|was it sent|is it sent|has it (been )?sent|did it (go|send))\b/i;

// They're going off to do something and will come back ("i'll let you know once it's connected").
export const WAITING_ON_THEM = /\b(i'?ll (let you know|check (back )?(in )?with you|get back to you|tell you|be right back)|once (it'?s|that'?s|i'?m|i've) (connected|done|set up|signed in|finished)|as soon as (it'?s|that'?s|i'?m) (connected|done|set up))\b/i;

// A standing "no calls" ("i hate phone calls", "text only"), whenever it's said.
export const NO_CALLS = /\b(don'?t|do not|dont|pls don'?t|please don'?t|never) (call|ring|phone)( me)?\b|\b(didn'?t|did not|don'?t|do not) want (you|u) to (call|ring|phone)\b|\bno (phone )?calls?\b|\bhate (phone )?calls\b|\b(text|texting) only\b|\bonly text\b|\bnot a phone person\b|\brather (just )?text\b/i;

// Naming it something rude is usually a poke: take it with a laugh instead of cheerfully missing it.
export const INSULT_NAME = /^(ugly|idiot|stupid|dumb|dummy|loser|trash|garbage|moron|clown|useless|lame|jerk|butthead|poopy?|bitch|asshole|dumbass)$/i;
export const DEMO_YES = /\b(yes|yeah|yep|yup|ya|sure|ok(ay)?|k|do it|go ahead|let'?s|please|pls|demo|try it|fine|alright|sounds good)\b/i;
export const GMAIL_TROUBLE = /\b(access blocked|blocked|not verified|unverified|403|access denied|test users?|won'?t let me|can'?t (sign|log) ?in|(doesn'?t|didn'?t|isn'?t|not) work(ing)?|error)\b/i;
