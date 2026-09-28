import { type Msg, type Session } from "../types";

import { SENTENCE_BREAK } from "./text";

export const HOLD = /\b(hold on|hang on|one sec(ond)?|give me a (sec|second|minute|moment)|wait a (sec|second|minute|moment)|just a (sec|second|moment|minute)|brb|be right back)\b/i;

// Offline guess for common names, used when the model can't be reached (so "julia" still sounds like julia).
export const FEMININE = /^(julia|juliet|sarah|sara|emma|olivia|ava|mia|sophia|sofia|isabella|luna|nova|chloe|grace|lily|zoe|ella|anna|hannah|maya|aria|stella|ruby|ivy|iris|daisy|rose|alice|clara|nora|lucy|jane|kate|katie|amy|emily|jessica|jenny|samantha|siri|alexa|tessa|priya|dana|robin|sage)$/i;
export const MASCULINE = /^(max|jack|james|john|mike|michael|david|daniel|sam|leo|liam|noah|oliver|ethan|lucas|henry|oscar|theo|jarvis|alfred|bob|tom|ben|chris|mark|paul|peter|ryan|kevin|jake|luke|adam|alex|kai|finn|felix|hugo|arthur|george|harry|charlie|dave|steve|jeeves|hal)$/i;
// A whole message that's just laughter or thanks gets a gif back, no words (and no model call).
export const LAUGH_TOKEN = "(?:(?:ha)+h?|(?:he){2,}|lo+l|lmao+|rofl|😂|🤣)";
export const LAUGH = new RegExp(`^\\s*${LAUGH_TOKEN}(?:[!. ]*${LAUGH_TOKEN})*[!. ]*\\s*$`, "iu");
// "lol ok" / "haha sure": the laugh is a reaction, the rest is the answer.
export const LAUGH_LEAD = new RegExp(`^\\s*${LAUGH_TOKEN}[!., ]+`, "iu");
export const THANKS = /^\s*(thanks|thank you|thx|ty|tysm|appreciate it)[!. ]*\s*$/i;

// The phrases that hang up a call with no model involved (stricter than USER_BYE: no bare "later" or "i'm good").
export const CLEAR_BYE = /\b(end (the |this )?call|hang up|you can go|let'?s end|bye|goodbye|gotta go|got to go|talk (to you )?(soon|later)|see (you|ya)|that'?s all for now)\b/i;
export const WANTS_OUT = /\b(skip|not now|later|no more questions|stop asking|just (help|do|get)|let'?s (just )?(start|go)|that'?s (it|all)|i'?m good|i'?m done|enough setup|just let me (use|try)|stop)\b/i;
// They're wrapping up: only then does the agent hang up on its own.
export const USER_BYE = /\b(end (the |this )?call|hang up|you can go|let'?s end|that'?s enough|bye|goodbye|gotta go|got to go|have to go|need to go|talk (to you )?(soon|later)|that'?s (all|it)|i'?m (done|good|all set)|see (you|ya)|catch you later|later then|laters|hang up|nothing else)\b/i;
// "don't hang up", "i'm not done", "no need to go": the opposite of a bye.
export const DONT_BYE = /\b(don'?t|do not|not|never|no need to)\b[^.!?]{0,12}\b(hang up|go|end|leave|done|bye)\b/i;
// "call me back later" asks for a callback, not a goodbye.
export const CALLBACK = /\b(call|ring) me (back|later|tomorrow|tonight|again|in (a|an|\d))/i;
const CLOSER = /^(ok(ay)?[, ]*)?((i )?(really )?(appreciate (it|you|that)|thanks?( (so much|a lot|again))?|thank you( (so much|again))?|cheers)|i think i'?ve (got(ten)?|had) (my|what i|all the) (help|needed|need)|that (helped|was great|was helpful))[.! ]*$/i;
// A bye counts only as their last words: "bye! oh wait, one more thing" is still talking.
export function saysBye(text: string, phrases: RegExp = USER_BYE) {
  const t = text.trim();
  if (!t || DONT_BYE.test(t) || CALLBACK.test(t)) return false;
  const parts = t.split(SENTENCE_BREAK).filter((x) => x.trim());
  // "you can hang up. i think i've gotten my help. i appreciate it.": thanks after the bye is still the bye.
  while (parts.length > 1 && CLOSER.test(parts[parts.length - 1].trim())) parts.pop();
  const last = parts[parts.length - 1] ?? "";
  // A question at the end means they're still talking ("i'll do it later, can you check my inbox?").
  if (last.trim().endsWith("?")) return false;
  // A question anywhere ("what do you mean you're bad? that's it.") means they're still in it, unless it plainly says bye.
  if (t.includes("?") && !/\b(bye|goodbye|gotta go|got to go)\b/i.test(last)) return false;
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
  // Any sentence can carry it ("that'd be great. sure." once sent no link: the yes wasn't first).
  const explicitYes = text.split(SENTENCE_BREAK).some((x) => (YES.test(x) || AGREE.test(x)) && !/\b(no|not|don'?t|nah)\b/i.test(x) && (x.trim().split(/\s+/).length <= 5 || /\b(sure|go ahead|send|do it|please|ok(ay)?|connect)\b/i.test(x)));
  return !!prevAgent && ASKED_LINK.test(prevAgent.text) && explicitYes;
}

// A clear "skip setup" (not every "skip"): skip this / all of this / the setup / the rest / ahead.
export const SKIP_SETUP = /\b(skip (all (of )?)?(this|that|it|setup|the setup|the rest|ahead|the questions)|(forget|no more|enough) (the )?(setup|questions)|stop asking (me )?questions|(just )?let me in|get me in|let me (just )?(use|try) (it|you|this|the app))\b/i;
// "no just do what i asked": they already said what they want; setup is in the way. That's a graduation.
export const JUST_DO = /\b(just (do|answer|get to) (it|that|this|what i (asked|said|wanted))|(do|answer) what i (asked|said)|(no|nah)[,.]? just (do|help|answer)( (it|me|that))?)\b/i;
// A real task in their message ("create a report on the weather in ottawa..."): do it, don't pitch a call over it.
export const TASK = /\b(you need to|i need you to|can you|could you|would you|please|pls|go ahead and)\b[^?.!]{0,40}\b(find|search|look up|look into|create|make|write|draft|book|order|check|compare|report|research|plan|summari[sz]e|get|send|tell me|remind me|schedule)\b|^\s*(hey,?\s*)?(find|search|look up|create|make|write|draft|book|order|compare|research|plan|summari[sz]e|remind me|schedule)\b/i;
// Signing off after being helped ("great thanks. will reach out next time i need something").
export const SIGN_OFF = /\b((will|i'?ll) (reach out|hit you up|text you|message you|let you know)( again)? (next time|later|when|if)|that'?s all (i needed|for now)|all good for now|good for now|talk (to you )?later)\b/i;
export const SKIP_OFFER = /\b(skip|jump (right )?in|get (right )?started|start (on|with))\b/i;
// Agreement that doesn't start with "yes" ("that'd be great", "please do").
export const AGREE = /\b(that'?d be (great|good|nice|awesome|perfect|amazing)|that would be (great|good|nice|awesome|perfect)|sounds (good|great|perfect)|please do|go for it|absolutely|definitely|of course|for sure|yes please)\b/i;
// "stop talking", "shh", "enough": on a call, the agent yields.
// They're asking what setup involves ("what do i need to set up?", "how does this work?").
export const SETUP_Q = /\b(set ?up|what do (i|you) need|what('?s| is) (next|left)|how does (this|it) work|what('?s| is) involved|what are the steps)\b/i;
export const STOP_TALKING = /^\s*(ok(ay)?,? )?(stop( talking| it)?|shh+|hush|quiet|be quiet|enough|stop stop|zip it)[.! ]*$/i;
export const YES = /^\s*((oh|ah|um+|uh+|well|hmm+|haha)[,.!]?\s+)?(yes|yeah|yea|ye|ya|yep|yup|sure|ok(ay)?|do it|please|go ahead|let'?s do it|sounds good|perfect)\b/i;

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
// "what do you want to call me?" asks for our name; it never offered a call (a nudge once said "no pressure on the call" to it).
export const OFFERED_CALL = /\b(call|ring|phone)\b(?!\s+me\b)[^?]*\?/i;
export const NEGATED_CALL = /\b(don'?t|do not|didn'?t|did not|won'?t|wasn'?t|shouldn'?t|no|not|never|stop)\b[^.!?]{0,20}\b(call|ring|phone)/i;

// Whatever the model wrapped its words in, keep only what a person would actually say.
// The model sometimes narrates its own reasoning ("I'm waiting for Krish to respond. Since they're
// still on the call..."). That is never something to say to them.
// "send it" / "email them" ... and a reply that says it went out.
export const SEND_REQUEST = /\b(send|sned|sewnd|email|forward|reply to)\b/i;
export const NAME_ASK = /\b(what (do you want to|should i|would you like to|will you) (call me|go by)|what should i go by|name (for )?me)\b/i;
// A Reply (swipe / hover) to one message that isn't the name question: they're pointing at that message, so this
// turn is about it. No name guessing, no setup push.
export function repliedElsewhere(s: Session, u?: Msg): Msg | undefined {
  if (!u?.replyTo || u.role !== "user") return;
  const q = s.transcript.find((m) => m.id === u.replyTo);
  return q && !(q.role === "agent" && NAME_ASK.test(q.text)) ? q : undefined;
}
// This turn answers a message that asks for a real task (their newest message; events don't count).
export const taskNow = (s: Session) => {
  const m = s.turnBy === "event" ? undefined : s.transcript.findLast((x) => x.role !== "event" && x.kind !== "contact_card");
  return m?.role === "user" && TASK.test(m.text);
};
// The message this turn answers, if it's such a Reply: the newest one in the chat (events don't count).
export const replyFocus = (s: Session) => (s.turnBy === "event" ? undefined : repliedElsewhere(s, s.transcript.findLast((m) => m.role !== "event" && m.kind !== "contact_card")));
// Commands and reactions are never names ("send" once became "Send it is").
export const NOT_A_NAME =
  /^(send|write|draft|call|email|connect|help|stop|cancel|done|next|go|continue|start|test|link|gmail|reply|check|find|search|wait|what\?|no|nah|nope|idk|i don'?t know|dunno|you pick|you choose|up to you|surprise me|anything|whatever|skip|why|what|whats|who|whos|hi|hii+|hey+|hello|yo|yoo+|sup|wassup|hiya|heya|howdy|yes|yeah|yea|ye|ya|yep|yup|k|kk|ok|okay|sure|cool|nice|thanks|thank you|ty|lol|haha|lmao|hmm+|um+|uh+|idc|nothing|none|me|you|it|this|that|i|im)\b/i;
// Answering "what do you want to call me?" with their own name is common: that's THEIR name.
export const OWN_NAME = /^(?:(?:hi|hey|hello)[,! ]+)?(?:i'?m|i am|my name(?:'s| is)|it'?s|this is|call me)\s+([\p{L}][\p{L}'-]{0,19})[.!]?\s*(?:btw|lol)?[.!]?$/iu;

export const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
// A send needs their explicit ok, after they've seen the exact draft.
export const SEND_OK = /\b(send( it| that| this| the (email|draft|message)| away)?|ship it|fire (it )?(off|away)|go ahead|yes|yeah|yep|yup|sure|do it|ok(ay)?|looks good|perfect)\b/i;
export const SEND_HOLD = /\b(don'?t|do not|not yet|wait|hold|change|edit|fix|but|instead|actually|no)\b/i;

// They named the assistant inside a longer message ("call you nova, can you check my email?").
// Answer the name first, with the contact card, before the link or the rest of the reply.
export const NAME_HINT = /\b(call (you|yourself)|your name('?s| is| will be| can be)|name you|i'?ll call you|you'?re|you are|go by|you can be|you'?ll be|be called)\b/i;
// The name itself, when a hint phrase is followed by one ("you can be julia", "i'll call you max").
const HINTED_NAME = /\b(?:call (?:you|yourself)|your name(?:'s| is| will be| can be)|name you|i'?ll call you|you can be|you'?ll be|be called|go by)\s+([\p{L}][\p{L}'-]{0,19})\b/iu;
export function hintedAgentName(text: string): string | null {
  const m = text.match(HINTED_NAME);
  if (!m || NOT_A_NAME.test(m[1]) || /^(my|your|a|an|the|me|so|really|very|more)$/i.test(m[1])) return null;
  return m[1].replace(/^\p{L}/u, (c) => c.toUpperCase());
}
// They're asking for the contact card ("send me the contact card", "where's your card", "it's not there").
export const CARD_ASK = /\b(contact( card)?|your card|the card|ur card)\b/i;
export const CARD_WANT = /\b(send|resend|share|where|didn'?t (get|see|send)|can'?t (find|see)|not there|missing|again)\b/i;
// One typo away from "call" ("clal", "cal", "caal", "cll"): swaps, drops, extras, one wrong letter.
function nearCall(w: string) {
  const a = w.toLowerCase();
  const b = "call";
  // Starts with "c" like every real typo of it ("all", "tell", "calm" are other words).
  if (a === b || a.length < 3 || a.length > 5 || a[0] !== "c") return a === b;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length] <= 1;
}
// "clal me" reads as "call me" for intent checks (only right before "me", so "cell" or "all" elsewhere stay put).
export function fixCallTypos(text: string) {
  return text.replace(/\b(\p{L}{3,5})(?=\s+me\b)/giu, (w) => (nearCall(w) ? "call" : w));
}
// "julia. my name is krish. call me": a bare first sentence answering "what do you want to call me?" is the name.
export function firstSentenceName(text: string): string | null {
  const parts = text.trim().split(SENTENCE_BREAK);
  if (parts.length < 2) return null;
  const m = parts[0].match(/^([\p{L}][\p{L}'-]{0,19})[.!,]?$/u);
  if (!m || NOT_A_NAME.test(m[1])) return null;
  return m[1].replace(/^\p{L}/u, (c) => c.toUpperCase());
}
// Their own name inside a longer message: "my name is krish", or a sentence that's just "i'm krish".
export function ownNameIn(text: string): string | null {
  const m =
    text.match(/\bmy name(?:'s| is)\s+([\p{L}][\p{L}'-]{1,19})\b/iu) ??
    // "you can call me krish" (never "call me now / back / please": that's a ring)
    text.match(/\b(?:you can|u can|just|pls|please)?\s*call me\s+(?!(?:now|back|please|pls|plz|asap|right|real|quick|when|whenever|anytime|later|today|tomorrow|tonight|so|and|if|then|again|sometime|in|at|on|maybe|soon)\b)([\p{L}][\p{L}'-]{1,19})\b/iu) ??
    text.split(SENTENCE_BREAK).map((x) => x.trim().match(OWN_NAME)).find(Boolean);
  if (!m || NOT_A_NAME.test(m[1])) return null;
  return m[1].replace(/^\p{L}/u, (c) => c.toUpperCase());
}
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

// Every intent pattern in one table: what it means, lines it must catch, and near misses it must not.
// Smoke tests every example, so changing a pattern shows exactly which real phrasing it breaks.
export interface IntentDef {
  re: RegExp;
  means: string;
  says: string[];
  notSays: string[];
}
export const INTENTS: Record<string, IntentDef> = {
  HOLD: { re: HOLD, means: "they need a moment", says: ["hold on a sec", "brb", "give me a minute"], notSays: ["i'll hold the door", "wait for me at the cafe"] },
  FEMININE: { re: FEMININE, means: "a name that sounds feminine (voice pick)", says: ["julia", "Nova"], notSays: ["max", "julia roberts"] },
  MASCULINE: { re: MASCULINE, means: "a name that sounds masculine (voice pick)", says: ["max", "Jarvis"], notSays: ["julia", "maximus"] },
  LAUGH: { re: LAUGH, means: "the whole message is laughter", says: ["haha", "lol lol", "😂"], notSays: ["haha that's funny", "hello"] },
  THANKS: { re: THANKS, means: "the whole message is thanks", says: ["thanks!", "thank you", "ty"], notSays: ["thanks, can you check my inbox?"] },
  CLEAR_BYE: { re: CLEAR_BYE, means: "a goodbye clear enough to hang up with no model", says: ["bye", "gotta go", "talk soon"], notSays: ["i'm good", "later i need help with email", "that's it"] },
  WANTS_OUT: { re: WANTS_OUT, means: "they want out of setup", says: ["skip", "stop asking me stuff", "just help me"], notSays: ["my name is kate", "help with my calendar"] },
  USER_BYE: { re: USER_BYE, means: "they're wrapping up", says: ["ok bye", "that's all", "catch you later"], notSays: ["i'll do it later", "what can you do?"] },
  DONT_BYE: { re: DONT_BYE, means: "the opposite of a bye", says: ["don't hang up", "i'm not done", "no need to go yet"], notSays: ["ok bye", "don't forget my list"] },
  CALLBACK: { re: CALLBACK, means: "asks for a callback, not a goodbye", says: ["call me back later", "ring me tomorrow"], notSays: ["call me krish", "you can call me anytime"] },
  WANTS_LINK: { re: WANTS_LINK, means: "asks for the gmail connect link", says: ["send me the link", "connect my gmail", "conectar mi correo"], notSays: ["what's a link?", "my email is full"] },
  ASKED_LINK: { re: ASKED_LINK, means: "our message brought up the link", says: ["want me to text you a link?", "connect your google account"], notSays: ["what should i call you?"] },
  JUST_DO: { re: JUST_DO, means: "they want the task done, not setup", says: ["no just do what i asked", "just do it", "nah, just help"], notSays: ["just checking", "what did i ask?", "do you know what i asked"] },
  TASK: { re: TASK, means: "a real task to do", says: ["hey, you need to create a report on the weather in ottawa", "can you find me sushi nearby", "please draft a reply to sam", "compare these two laptops"], notSays: ["can you hear me?", "i'm tired", "what can you do?"] },
  SIGN_OFF: { re: SIGN_OFF, means: "signing off after being helped", says: ["great thanks. will reach out next time i need something", "that's all i needed", "ok talk later"], notSays: ["thanks", "will you reach out?"] },
  SKIP_SETUP: { re: SKIP_SETUP, means: "a clear skip of setup", says: ["skip this", "no more questions", "stop asking me questions"], notSays: ["skip the gym today", "i skipped lunch"] },
  SKIP_OFFER: { re: SKIP_OFFER, means: "our offer to skip ahead", says: ["want to skip the rest?", "want to jump right in?"], notSays: ["what should i call you?"] },
  YES: { re: YES, means: "a yes at the start", says: ["yes", "oh, yeah sure", "sounds good", "ye"], notSays: ["no", "maybe yes", "haha", "yeti"] },
  AGREE: { re: AGREE, means: "agreement without a leading yes", says: ["that'd be great", "please do", "sounds good"], notSays: ["that's a lot", "i'm good"] },
  SETUP_Q: { re: SETUP_Q, means: "asking what setup involves", says: ["what do i need to set up?", "how does this work?"], notSays: ["what's up", "set the table"] },
  STOP_TALKING: { re: STOP_TALKING, means: "stop talking (on a call: yield)", says: ["Stop talking.", "shh", "ok, stop"], notSays: ["stop by the store later", "don't stop"] },
  CALL_OK: { re: CALL_OK, means: "ok to ring them", says: ["sure", "call me", "k"], notSays: ["haha", "hmm"] },
  DELEGATE: { re: DELEGATE, means: "they hand us the choice", says: ["you pick", "idk", "surprise me"], notSays: ["luna", "i pick luna"] },
  CALL_NO: { re: CALL_NO, means: "no to a call", says: ["nah", "text is fine", "don't call"], notSays: ["sure", "yes call me"] },
  OFFERED_CALL: { re: OFFERED_CALL, means: "our message offered a call", says: ["want me to give you a quick call?"], notSays: ["i'll call you in a sec.", "what's up?", "what do you want to call me?"] },
  NEGATED_CALL: { re: NEGATED_CALL, means: "a call mentioned only to refuse it", says: ["please don't call me", "i didn't want you to call"], notSays: ["call me", "can you call me?"] },
  SEND_REQUEST: { re: SEND_REQUEST, means: "they asked for something to be sent", says: ["send it", "email her", "forward that"], notSays: ["what's up", "looks good"] },
  NAME_ASK: { re: NAME_ASK, means: "our message asks for our own name", says: ["what do you want to call me?", "what should i go by?"], notSays: ["what should i call you?"] },
  NOT_A_NAME: { re: NOT_A_NAME, means: "a command or reaction, never a name", says: ["send", "idk", "haha"], notSays: ["luna", "max"] },
  OWN_NAME: { re: OWN_NAME, means: "they gave their own name", says: ["i'm dana", "hey, my name is krish", "call me sam"], notSays: ["luna", "i'm tired of email today"] },
  EMAIL_RE: { re: EMAIL_RE, means: "a bare email address", says: ["a@b.com"], notSays: ["a@b", "email me at a@b.com"] },
  SEND_OK: { re: SEND_OK, means: "a yes to sending", says: ["send it", "looks good", "yep"], notSays: ["hmm", "nice"] },
  SEND_HOLD: { re: SEND_HOLD, means: "hold off on sending", says: ["wait", "change the subject", "not yet"], notSays: ["send it", "looks great"] },
  NAME_HINT: { re: NAME_HINT, means: "naming the assistant inside a longer message", says: ["i'll call you nova", "your name is max", "hey you can be julia. im krish"], notSays: ["call me sam", "what's my name"] },
  SEND_CMD: { re: SEND_CMD, means: "the whole message is a send command", says: ["send", "ok, send it", "go ahead and send it"], notSays: ["send it to bob instead", "don't send"] },
  CARD_ASK: { re: CARD_ASK, means: "talking about the contact card", says: ["send me the contact card", "where's your card"], notSays: ["send me the link"] },
  SENT_Q: { re: SENT_Q, means: "asks whether it was sent", says: ["did you send it?", "was it sent"], notSays: ["send it"] },
  WAITING_ON_THEM: { re: WAITING_ON_THEM, means: "they'll come back once done", says: ["i'll let you know", "once it's connected"], notSays: ["let me know", "it's connected"] },
  NO_CALLS: { re: NO_CALLS, means: "no calls at all", says: ["don't call me", "text only", "i hate phone calls"], notSays: ["call me", "can you call me later?"] },
  INSULT_NAME: { re: INSULT_NAME, means: "a rude name for the assistant", says: ["ugly", "dumbass"], notSays: ["luna", "ugly betty"] },
  DEMO_YES: { re: DEMO_YES, means: "yes to the demo inbox", says: ["sure", "try it", "demo please"], notSays: ["no thanks"] },
  GMAIL_TROUBLE: { re: GMAIL_TROUBLE, means: "google sign-in isn't working for them", says: ["it says access blocked", "can't sign in", "it's not working"], notSays: ["connected!", "done"] },
};
