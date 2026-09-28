import { nanoid } from "nanoid";
import type { Attachment, Channel, ClientAction, Msg, Session, SlotKey, TurnResult, VoiceStyle } from "./types";
import { computeDirective, directiveText, recordAsk, MAX_CALL_OFFERS, MAX_SILENCE_STRIKES } from "./policy";
import { RECAP_INSTRUCTION, SYSTEM_PROMPT } from "./prompt";
import { mockReply } from "./mock";
import { provider, quick, runToolLoop, type Part, type ToolDef, type Turn } from "./llm";
import { DEMO_INBOX, recordOutcome, triageInbox } from "./triage";
import { readInbox, saveDraft, sendDraft } from "./google";
import { getSecret } from "./store";
import { EVENT_MOVES, chooseMove, markUsed } from "./moves";
import { GIF_MIN_GAP, GIF_MOODS, GIFS, gifUrl, type GifMood } from "./gifs";
import { applyExtracted, extract } from "./extract";
import { readPage, webEnabled, webSearch } from "./web";
import type { Move } from "./types";

const MAX_TOOL_ROUNDS = 4; // search, read a page, then reply (plus room for a set_slot)
const HISTORY_LIMIT = 16; // recent context is what matters; slots and STATE carry the rest (and it keeps each call small)

const WEB_TOOLS = new Set(["web_search", "read_page"]);
// Tools whose results the model has to read before it replies.
const LOOKUP_TOOLS = new Set([...WEB_TOOLS, "read_inbox"]);

export const usingMock = () => provider === null;

const SETTABLE = ["agentName", "userName", "helpNeed"] as const;

const NO_ARGS = { type: "object", properties: {}, required: [], additionalProperties: false };

const TOOLS: ToolDef[] = [
  {
    name: "set_slot",
    description: "Record or update something you learned: your own name (agentName), what to call the user (userName), or what they want help with (helpNeed).",
    schema: {
      type: "object",
      properties: {
        slot: { type: "string", enum: [...SETTABLE] },
        value: { type: "string", description: "Short, cleaned value, e.g. 'Julia' or 'triaging work email every morning'" },
      },
      required: ["slot", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "decline_slot",
    description: "The user clearly doesn't want to share this. Stop asking.",
    schema: {
      type: "object",
      properties: { slot: { type: "string", enum: [...SETTABLE, "gmail"] } },
      required: ["slot"],
      additionalProperties: false,
    },
  },
  { name: "offer_call", description: "You are asking permission for a quick call in this message. If they say yes, call start_call next turn.", schema: NO_ARGS },
  { name: "start_call", description: "Ring the user now. Only after they agreed to a call.", schema: NO_ARGS },
  { name: "send_gmail_link", description: "Drop a secure 'Connect Gmail' link into the text thread. Works during a call.", schema: NO_ARGS },
  { name: "end_call", description: "Hang up after saying goodbye on the call.", schema: NO_ARGS },
  {
    name: "read_inbox",
    description:
      "Read their Gmail (only after it's connected): returns the latest messages matching a Gmail search, with sender, subject, date and a short preview. Use it whenever they ask about their email; never guess what's in there.",
    schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search, e.g. 'in:inbox', 'is:unread in:inbox', 'from:recruiter', 'subject:interview'" },
        count: { type: "integer", description: "How many (1-10), default 5" },
      },
      required: ["query", "count"],
      additionalProperties: false,
    },
  },
  {
    name: "save_draft",
    description:
      "Save an email as a draft in their Gmail (only after it's connected) and show it in the chat. Call again with the full new version when they ask for changes (it replaces the same draft). Never say it was sent.",
    schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address, or empty string if they haven't given one" },
        subject: { type: "string" },
        body: { type: "string", description: "The full email text, signed off with their name if you know it" },
      },
      required: ["to", "subject", "body"],
      additionalProperties: false,
    },
  },
  {
    name: "send_email",
    description:
      "Send the draft you last showed them, exactly as shown. Only after they clearly said to send it (\"send it\", \"yes send\"). If they asked for changes, save_draft again first and get a fresh yes.",
    schema: NO_ARGS,
  },
  {
    name: "web_search",
    description:
      "Search the web for anything live or that you'd otherwise guess: weather, news, hours, prices, places, events, facts. Returns titles and links only; then call read_page on the best link to get the facts. Use it instead of answering from memory whenever they need current info.",
    schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search, like you'd type it into Google" },
        count: { type: "integer", description: "How many results (1-8), default 5" },
      },
      required: ["query", "count"],
      additionalProperties: false,
    },
  },
  {
    name: "read_page",
    description: "Open one web page (usually a link from web_search) and read its text.",
    schema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "text_them",
    description:
      "On a call: put something in the text chat (a draft email, a list, an address, anything easier to read than hear). Then just say briefly that it's in the chat.",
    schema: {
      type: "object",
      properties: { text: { type: "string", description: "Exactly what should appear in the chat" } },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "send_gif",
    description:
      "Rarely, over text only: send a GIF instead of a short reply, when your whole answer would just be okay / yes / no / nice / haha / on it. Don't add text that says the same thing.",
    schema: {
      type: "object",
      properties: { mood: { type: "string", enum: [...GIF_MOODS] } },
      required: ["mood"],
      additionalProperties: false,
    },
  },
  {
    name: "graduate",
    description:
      "End setup and become the full assistant. Only when the user asked to skip or stop setup, or nothing is left to gather. Knowing their need is not enough. Remaining items get deferred.",
    schema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];

function msg(role: Msg["role"], channel: Channel, text: string, extra: Partial<Msg> = {}): Msg {
  return { id: nanoid(10), role, channel, text, ts: Date.now(), ...extra };
}

function attachmentText(a: Attachment) {
  return `[${a.kind}: ${a.name}${a.summary ? ` | ${a.summary}` : ""}]`;
}

function toTurns(s: Session): Turn[] {
  const convo = s.transcript.filter((m) => m.role !== "event" && m.kind !== "contact_card").slice(-HISTORY_LIMIT);
  const lastUserIdx = convo.map((m) => m.role).lastIndexOf("user");
  const out: Turn[] = [];
  convo.forEach((m, i) => {
    const role = m.role === "user" ? "user" : "assistant";
    // Two streams: what's said on the call, and what's in the text chat. Label both once a call exists.
    const hadCall = s.call.active || s.transcript.some((x) => x.channel === "voice");
    const prefix = !hadCall ? "" : m.role === "user" ? (m.channel === "voice" ? "(said on the call) " : "(texted in the chat) ") : m.channel === "text" ? "(posted in the chat) " : "";
    let text = m.kind === "gmail_link" ? `${prefix}[the Connect Gmail link card]` : m.kind === "gif" ? `${prefix}[a gif]` : prefix + m.text;
    if (m.cutOff) text += " [they cut in here; the rest wasn't heard]";
    if (m.attachments?.length) text += "\n" + m.attachments.map(attachmentText).join("\n");
    const parts: Part[] = [];
    // Only the latest user message carries actual image pixels; older ones use the summary.
    if (i === lastUserIdx) {
      for (const a of m.attachments ?? []) {
        const match = a.kind === "image" && a.dataUrl?.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/);
        if (match) parts.push({ type: "image", mime: match[1], data: match[2] });
      }
    }
    parts.push({ type: "text", text: text || "(empty)" });
    const prev = out[out.length - 1];
    if (prev && prev.role === role) prev.parts.push(...parts);
    else out.push({ role, parts });
  });
  if (out.length === 0 || out[0].role !== "user") out.unshift({ role: "user", parts: [{ type: "text", text: "(user opened the chat)" }] });
  // APIs need a final user turn; if the agent spoke last (e.g. event-triggered turn), add a nudge.
  if (out[out.length - 1].role !== "user") out.push({ role: "user", parts: [{ type: "text", text: "(no new message from the user)" }] });
  return out;
}

// When the model is unreachable more than once in a row: own it plainly, keep what we know, set an expectation.
function outageLine(s: Session, channel: Channel) {
  const name = s.slots.userName.value;
  if (channel === "voice") return `sorry${name ? ` ${name}` : ""}, i'm having trouble on my end right now. i'll text you instead. talk soon!`;
  const need = s.slots.helpNeed.value;
  // Don't repeat the same apology over and over: after the first, keep it short and different.
  if ((s.llmFailures ?? 0) > 2) return (s.llmFailures ?? 0) % 2 ? "still catching up on my end, sorry. i'll be back to normal soon." : "still slow here, sorry about that. your messages are saved, nothing's lost.";
  return `sorry${name ? ` ${name}` : ""}, i'm running slow on my end right now.${need && need.length <= 60 ? ` i haven't forgotten about ${need}.` : ""} give me a few minutes and text me again?`;
}

function heardThemThisCall(s: Session) {
  const started = s.transcript.findLastIndex((m) => m.kind === "event" && m.text === "Call started");
  return s.transcript.slice(started + 1).some((m) => m.role === "user" && m.channel === "voice");
}

const HOLD = /\b(hold on|hang on|one sec(ond)?|give me a (sec|second|minute|moment)|wait a (sec|second|minute|moment)|just a (sec|second|moment|minute)|brb|be right back)\b/i;

// Offline guess for common names, used when the model can't be reached (so "julia" still sounds like julia).
const FEMININE = /^(julia|juliet|sarah|sara|emma|olivia|ava|mia|sophia|sofia|isabella|luna|nova|chloe|grace|lily|zoe|ella|anna|hannah|maya|aria|stella|ruby|ivy|iris|daisy|rose|alice|clara|nora|lucy|jane|kate|katie|amy|emily|jessica|jenny|samantha|siri|alexa|tessa|priya|dana|robin|sage)$/i;
const MASCULINE = /^(max|jack|james|john|mike|michael|david|daniel|sam|leo|liam|noah|oliver|ethan|lucas|henry|oscar|theo|jarvis|alfred|bob|tom|ben|chris|mark|paul|peter|ryan|kevin|jake|luke|adam|alex|kai|finn|felix|hugo|arthur|george|harry|charlie|dave|steve|jeeves|hal)$/i;
const guessVoice = (name: string): VoiceStyle => {
  const first = name.trim().split(/\s+/)[0] ?? "";
  // A few names are genuinely shared; lean on the lists but keep true unisex ones neutral.
  if (/^(alex|sam|robin|sage|kai|charlie|dana)$/i.test(first)) return "neutral";
  return FEMININE.test(first) ? "feminine" : MASCULINE.test(first) ? "masculine" : "neutral";
};

async function classifyVoice(name: string): Promise<VoiceStyle> {
  if (!provider) return guessVoice(name);
  try {
    const t = (
      await quick({
        system:
          "Classify how a name is most commonly perceived for picking a TTS voice. Answer with exactly one word: feminine, masculine, or neutral. Ambiguous, unisex, invented, or object names are neutral.",
        user: name.slice(0, 60),
        maxTokens: 5,
        tag: "voice-classify",
      })
    ).toLowerCase();
    return t.startsWith("fem") ? "feminine" : t.startsWith("masc") ? "masculine" : t.startsWith("neu") ? "neutral" : guessVoice(name);
  } catch {
    return guessVoice(name);
  }
}

// GIFs stay rare: not in the first few messages, and never two close together.
function gifAllowed(s: Session) {
  const agentMsgs = s.transcript.filter((m) => m.role === "agent");
  const userMsgs = s.transcript.filter((m) => m.role === "user").length;
  const lastGif = agentMsgs.map((m) => m.kind).lastIndexOf("gif");
  const lastText = [...agentMsgs].reverse().find((m) => !m.kind || m.kind === "text");
  if (userMsgs < 4) return false; // not in the first few exchanges
  if (lastText?.text.trim().endsWith("?")) return false; // a gif is not an answer to their question
  if ((s.alerts ?? []).some((a) => a.outcome === "pending")) return false; // they may be saying yes to it
  return lastGif < 0 || agentMsgs.length - lastGif >= GIF_MIN_GAP;
}

function makeGif(s: Session, mood: GifMood) {
  const pool = GIFS[mood];
  return msg("agent", "text", gifUrl(pool[s.transcript.length % pool.length]), { kind: "gif" });
}

// A whole message that's just laughter or thanks gets a gif back, no words (and no model call).
const LAUGH_TOKEN = "(?:(?:ha)+h?|(?:he){2,}|lo+l|lmao+|rofl|😂|🤣)";
const LAUGH = new RegExp(`^\\s*${LAUGH_TOKEN}(?:[!. ]*${LAUGH_TOKEN})*[!. ]*\\s*$`, "iu");
const THANKS = /^\s*(thanks|thank you|thx|ty|tysm|appreciate it)[!. ]*\s*$/i;

export interface Ctx {
  s: Session;
  channel: Channel;
  actions: ClientAction[];
  newMessages: Msg[];
  resendOk?: boolean;
  newCard?: Msg;
  move?: Move;
  pending?: Promise<void>[];
  offeredCall?: boolean;
  allowEnd?: boolean; // the system decided to end the call (silence, skip setup, outage)
  sentEmail?: boolean; // send_email actually went out this turn
  shownDraft?: string; // a draft was posted this turn (the reply shouldn't repeat it)
  softInstruction?: boolean; // the extra instruction is just context: still pick a move this turn
}

const WANTS_OUT = /\b(skip|not now|later|no more questions|stop asking|just (help|do|get)|let'?s (just )?(start|go)|that'?s (it|all)|i'?m good|i'?m done|enough setup|just let me (use|try)|stop)\b/i;
// They're wrapping up: only then does the agent hang up on its own.
const USER_BYE = /\b(end (the |this )?call|hang up|you can go|let'?s end|that'?s enough|bye|goodbye|gotta go|got to go|have to go|need to go|talk (to you )?(soon|later)|that'?s (all|it)|i'?m (done|good|all set)|see (you|ya)|later|hang up|nothing else)\b/i;
function userWrappingUp(s: Session) {
  return USER_BYE.test(lastUserText(s));
}

// The gmail link goes out only after a yes: they asked for it, or said yes to our question about it.
const WANTS_LINK = /\b(send|text|give|drop|shoot)\b[^.?!]{0,25}\blink\b|\b(connect|hook up|link|conectar|vincular|connecter|enlace|lien)\b[^.?!]{0,20}\b(gmail|email|e-?mail|inbox|google|correo|cuenta)\b/i;
// Our last message brought up the link (asked, or offered "i'll send you a link"), so a yes means yes to it.
const ASKED_LINK = /\b(link|gmail|connect your)\b/i;
// The gmail ask is written by code (one clear question, the reason, the reassurance, an easy no).
const GMAIL_ASK_MARK = "text you a link to connect your gmail";
function gmailAsk(s: Session, channel: Channel = "text") {
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
const GMAIL_PITCH = /\b(gmail|link|connect (your|my) (email|inbox|account)|read[- ]only|paste an email|without asking|pull up (your|the|those) (emails|inbox))\b/i;

function gmailConsent(s: Session) {
  const text = lastUserText(s);
  if (WANTS_LINK.test(text) && !/\b(don'?t|do not|no|not)\b/i.test(text)) return true;
  const users = s.transcript.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0);
  const lastUser = users[users.length - 1] ?? -1;
  const prevAgent = s.transcript.slice(0, lastUser).reverse().find((m) => m.role === "agent" && (!m.kind || m.kind === "text"));
  // "yeah it's been rough, i lose track..." agrees with the feeling, not to a link: a yes must be short or explicit.
  const explicitYes = YES.test(text) && (text.trim().split(/\s+/).length <= 5 || /\b(sure|go ahead|send|do it|please|ok(ay)?|connect)\b/i.test(text));
  return !!prevAgent && ASKED_LINK.test(prevAgent.text) && explicitYes;
}

// A clear "skip setup" (not every "skip"): skip this / all of this / the setup / the rest / ahead.
const SKIP_SETUP = /\b(skip (all (of )?)?(this|that|it|setup|the setup|the rest|ahead|the questions)|(forget|no more|enough) (the )?(setup|questions)|stop asking (me )?questions)\b/i;
const SKIP_OFFER = /\b(skip|jump (right )?in|get (right )?started|start (on|with))\b/i;
const YES = /^\s*(yes|yeah|yep|yup|sure|ok(ay)?|do it|please|go ahead|let'?s do it|sounds good|perfect)\b/i;

function lastUserText(s: Session) {
  return [...s.transcript].reverse().find((m) => m.role === "user")?.text ?? "";
}

function userWantsOut(s: Session) {
  const text = lastUserText(s);
  if (WANTS_OUT.test(text)) return true;
  // "want to skip the rest and just start?" "yeah": that's them asking out too.
  const users = s.transcript.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0);
  const lastUser = users[users.length - 1] ?? -1;
  const prevAgent = s.transcript.slice(0, lastUser).reverse().find((m) => m.role === "agent" && (!m.kind || m.kind === "text"));
  return !!prevAgent && SKIP_OFFER.test(prevAgent.text) && prevAgent.text.includes("?") && YES.test(text);
}

// "no, text is fine" right after a call offer is a no, just like tapping decline.
// Anything short of this ("haha", "lol", "hmm") is not permission to ring.
const CALL_OK = /\b(yes|yeah|yep|yup|ya|sure|ok(ay)?|k|fine|alright|go ahead|do it|let'?s (go|do it)|down|call|ring|phone)\b/i;
// "you pick" / "idk" hands the choice to us; otherwise a name has to come from them.
const DELEGATE = /\b(you (pick|choose|decide)|up to you|your (call|choice)|surprise me|whatever|anything|any ?name|i don'?t (care|mind|know)|idc|idk|dunno|no idea|dealer'?s choice)\b/i;
function nameGrounded(s: Session, value: string): boolean {
  const users = s.transcript.filter((m) => m.role === "user").slice(-3).map((m) => m.text.toLowerCase());
  const first = value.toLowerCase().split(/\s+/)[0].replace(/[^\p{L}'-]/gu, "");
  if (!first || users.some((t) => t.includes(first))) return true;
  const last = users.at(-1) ?? "";
  if (DELEGATE.test(last)) return true;
  // They said yes to a name we suggested ("how about alex?" -> "sure").
  const prevAgent = [...s.transcript].reverse().find((m) => m.role === "agent" && (!m.kind || m.kind === "text"));
  return !!prevAgent && prevAgent.text.toLowerCase().includes(first) && YES.test(last);
}
const CALL_NO = /\b(no|nah|nope|not now|text is fine|rather text|just text|don'?t call|no calls?|hate (phone )?calls)\b/i;
const OFFERED_CALL = /\b(call|ring|phone)\b[^?]*\?/i;
const NEGATED_CALL = /\b(don'?t|do not|didn'?t|did not|won'?t|wasn'?t|shouldn'?t|no|not|never|stop)\b[^.!?]{0,20}\b(call|ring|phone)/i;

async function runTool(ctx: Ctx, name: string, input: Record<string, unknown>): Promise<string> {
  const { s } = ctx;
  switch (name) {
    case "set_slot": {
      const slot = input.slot as SlotKey;
      const value = String(input.value ?? "").trim().slice(0, 200);
      if (!SETTABLE.includes(slot as (typeof SETTABLE)[number]) || !value) return "error: invalid slot or empty value";
      if ((slot === "agentName" || slot === "userName") && !nameGrounded(s, value)) {
        return `error: they never said "${value}" (their last message: "${lastUserText(s).slice(0, 60)}"). don't fill in a name for them. react to what they actually said like a person would, then lightly ask again, or suggest one as a question ("how about ${value}?")`;
      }
      const renamed = slot === "agentName" && s.slots.agentName.value && s.slots.agentName.value !== value;
      s.slots[slot] = { ...s.slots[slot], value, status: "filled", source: ctx.channel, updatedAt: Date.now() };
      if (s.lastAskedSlot === slot) s.lastAskedSlot = undefined;
      if (slot === "agentName") {
        // Picking the voice runs alongside the reply instead of in front of it.
        const onCall = s.call.active;
        (ctx.pending ??= []).push(
          classifyVoice(value).then((style) => {
            // Keep one voice per call: a rename mid-call applies from the next call.
            if (onCall) s.pendingVoice = style;
            else s.voice = style;
          }),
        );
        // One contact card per session, updated in place (client upserts by id): no duplicates on rename.
        const card = s.transcript.find((m) => m.kind === "contact_card");
        if (card) {
          card.text = value;
          ctx.newMessages.push(card);
        } else ctx.newCard = msg("agent", "text", value, { kind: "contact_card" }); // sent after the text, like persona

        return `saved.${renamed ? " contact card updated in place." : ""}`;
      }
      return "saved";
    }
    case "decline_slot": {
      const slot = input.slot as SlotKey;
      if (!s.slots[slot]) return "error: invalid slot";
      s.slots[slot].status = "declined";
      return "noted; don't ask again";
    }
    case "offer_call":
      if (s.call.active) return "already on a call";
      ctx.offeredCall = true;
      s.callOffers += 1;
      if (s.phase === "intro") s.phase = "call_offered";
      return "call buttons shown";
    case "start_call": {
      if (s.call.active) return "already on a call";
      // They declined or hung up: never ring again unless they ask for a call afterwards.
      const lastEnd = Math.max(s.transcript.findLastIndex((m) => m.kind === "event" && /^Call (ended|declined)/.test(m.text)), (s.callDeclinedAt ?? 0) - 1);
      const askedSince = s.transcript.slice(lastEnd + 1).some((m) => m.role === "user" && /\b(call|ring|phone)\b/i.test(m.text) && !NEGATED_CALL.test(m.text));
      const said_no = s.callDeclinedAt !== undefined || (lastEnd >= 0 && s.call.endedReason !== "agent_ended");
      if (said_no && !askedSince) return "error: they said no to a call or just hung up. don't call again unless they ask; carry on over text";
      const last = lastUserText(s);
      if (!YES.test(last) && !CALL_OK.test(last)) {
        return `error: they haven't said yes to a call (they said "${last.slice(0, 60)}"). don't ring. react to what they said and ask again lightly, or carry on over text`;
      }
      ctx.actions.push({ type: "start_call" });
      return "ringing the user";
    }
    case "send_gmail_link": {
      // Connected read-only (before drafts existed, or they unticked it): the link again adds draft access.
      const upgrading = s.slots.gmail.status === "filled" && (await getSecret(`gscope:${s.id}`).catch(() => null)) === "read";
      if (s.slots.gmail.status === "filled" && !upgrading) return `already connected as ${s.gmailEmail}`;
      if (upgrading) ctx.resendOk = true;
      else if (!gmailConsent(s)) return "error: not yet. give them a bit of help first, then ask if they'd like the link; send it only after they say yes";
      const lastLink = s.transcript.map((m) => m.kind).lastIndexOf("gmail_link");
      const lastFail = s.transcript.findLastIndex((m) => m.kind === "event" && /^Gmail connection/.test(m.text));
      if (lastLink >= 0 && lastLink > lastFail && !ctx.resendOk) return "already sent; it's still in their texts. don't send another, just point to it";
      const link = msg("agent", "text", "Connect your Google account", { kind: "gmail_link" });
      if (ctx.channel === "voice") {
        // On a call the ask still lands in the chat, in writing, right above the link.
        const need = shortNeed(s);
        const ask = msg("agent", "text", `here's the link to connect your gmail${need ? ` so i can help with ${need}` : ""}. i never send anything without your ok.`);
        ctx.newMessages.push(ask);
        s.transcript.push(ask);
      }
      ctx.newMessages.push(link);
      s.transcript.push(link);
      // They're off doing a task: silence is expected, don't nag with check-ins.
      if (s.call.active) ctx.actions.push({ type: "patience", ms: 30000 });
      return "link sent to their texts";
    }
    case "send_gif": {
      if (ctx.channel !== "text") return "error: gifs only over text";
      if (!gifAllowed(s)) return "error: not now, too soon for another gif. reply in words";
      const mood = String(input.mood) as GifMood;
      if (!GIFS[mood]) return "error: unknown mood";
      const gif = makeGif(s, mood);
      ctx.newMessages.push(gif);
      s.transcript.push(gif);
      return "gif sent. that's your whole reply unless you have something new to add";
    }
    case "read_inbox": {
      if (s.slots.gmail.status !== "filled") return "error: gmail isn't connected, so you can't see their inbox. offer to send the link";
      const count = Math.min(Math.max(Number(input.count ?? 5) || 5, 1), 10);
      const query = String(input.query ?? "in:inbox").slice(0, 120) || "in:inbox";
      const token = await getSecret(`gtoken:${s.id}`).catch(() => null);
      let items = token ? await readInbox(token, query, count).catch(() => null) : null;
      // Demo / test connections have no real token: use the sample inbox they were shown.
      if (!token && (s.gmailEmail === "demo.user@gmail.com" || process.env.ALLOW_TEST_EVENTS === "1")) items = DEMO_INBOX.slice(0, count);
      if (!items) return "error: your access to their inbox has expired. tell them honestly and offer to send the link again to reconnect. don't guess what's in there";
      if (!items.length) return `no messages match "${query}".`;
      return items
        .map((m, i) => `${i + 1}. from ${m.fromName} | ${m.subject || "(no subject)"} | ${new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} | ${m.snippet.slice(0, 140)}`)
        .join("\n");
    }
    case "save_draft":
      return saveDraftTool(ctx, input);
    case "send_email":
      return sendEmailTool(ctx);
    case "web_search":
      return webSearch(String(input.query ?? "").trim() || "news", Math.min(Math.max(Number(input.count ?? 5) || 5, 1), 8));
    case "read_page":
      return readPage(String(input.url ?? "").trim());
    case "text_them": {
      const body = String(input.text ?? "").trim().slice(0, 2000);
      if (!body) return "error: nothing to post";
      const posted = msg("agent", "text", body);
      ctx.newMessages.push(posted);
      s.transcript.push(posted);
      return "it's in the chat now. tell them in a few words; don't read it out";
    }
    case "end_call":
      if (!s.call.active) return "not on a call";
      if (!ctx.allowEnd && !userWrappingUp(s)) return "error: they haven't said bye. don't hang up; ask if there's anything else";
      ctx.actions.push({ type: "end_call" });
      return "hanging up after this message";
    case "graduate": {
      const open = (Object.keys(s.slots) as SlotKey[]).filter((k) => s.slots[k].status === "missing");
      if (s.call.active) {
        s.graduateAfterCall = true;
        return "noted: say a short goodbye now and call end_call; setup will end when the call does";
      }
      if (open.length && !userWantsOut(s)) return `error: still open (${open.join(", ")}) and they haven't asked to skip. keep helping and gather what's left gently`;
      s.phase = "graduated";
      s.graduatedReason = String(input.reason ?? "");
      for (const k of Object.keys(s.slots) as SlotKey[]) if (s.slots[k].status === "missing") s.slots[k].status = "deferred";
      ctx.actions.push({ type: "graduate" });
      return "graduated; you're now the full assistant";
    }
    default:
      return `error: unknown tool ${name}`;
  }
}

async function generate(ctx: Ctx, extraInstruction?: string): Promise<string> {
  const { s, channel } = ctx;
  if (!provider) return extraInstruction ? "" : mockReply(ctx, runTool);
  // The directive is computed once per turn; tool effects show up in the next turn's STATE.
  const d = computeDirective(s, channel);
  let state = directiveText(s, d, channel, !extraInstruction);
  if (s.draft && !s.draft.sent) {
    state += `\nUNSENT DRAFT in the chat: to ${s.draft.to || "(no address yet)"}, "${s.draft.subject}". ${s.slots.gmail.status === "filled" ? "They can send it with a clear yes (send_email)." : "Gmail isn't connected, so it can't be sent until they connect."} Never say it was sent unless send_email succeeded.`;
  }
  if (extraInstruction) state += `\n\nINSTRUCTION: ${extraInstruction}`;
  if (!extraInstruction || ctx.softInstruction) {
    // One research-backed move per turn, chosen in code, so the principles actually get applied.
    const move = chooseMove(s, channel, { callFirst: d.callFirst, mayAsk: d.mayAsk });
    markUsed(s, move.id);
    ctx.move = { id: move.id, label: move.label, source: move.source };
    state += `\n\nMOVE THIS TURN (${move.label}): ${move.instruction}`;
    // Help first: gmail only comes up on its own turn (or if they raise it).
    if (move.id !== "ask-gmail" && s.slots.gmail.status === "missing" && !/\b(gmail|email|inbox|link)\b/i.test(lastUserText(s))) {
      state += "\nNot this turn: don't bring up gmail or a link.";
    }
  }
  state += `\n${nowLine(s.tz)}`;
  if (!webEnabled()) state += "\nNo web access right now: help from memory and say so.";
  const tools = webEnabled() ? TOOLS : TOOLS.filter((t) => !WEB_TOOLS.has(t.name));
  const r = await runToolLoop({ system: SYSTEM_PROMPT, state, turns: toTurns(s), tools, maxRounds: MAX_TOOL_ROUNDS, lookup: LOOKUP_TOOLS }, (c) => runTool(ctx, c.name, c.input));
  if (r.refused) return "hmm, i can't help with that one. anything else on your mind?";
  // It typed an email out instead of using save_draft: save it for it, so "send" has something real to send.
  if (!ctx.shownDraft && ctx.channel === "text") {
    const typed = parseTypedEmail(r.text);
    if (typed) await saveDraftTool(ctx, typed);
  }
  return ctx.shownDraft ? dropDraftEcho(r.text, ctx.shownDraft) : r.text;
}

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
function dropDraftEcho(text: string, draft: string) {
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

const INTRO_CAPABILITIES = [
  "You can text me or call me anytime and I can help with:",
  "📞 calling places on your behalf",
  "💻 browsing the web",
  "🛍️ shopping for you",
  "📩 managing your email and calendar",
  "🚗 finding DoorDash or Uber options",
  "",
  "By continuing to text or use Persona, you agree to our Terms of Service and SMS Terms, and acknowledge our Privacy Policy: yourpersona.com/legal",
].join("\n");

const GOODBYE = /\b(bye|goodbye|talk (to you )?(soon|later)|take care|catch you|ciao|see ya|i'?ll let you go|call me (back )?(whenever|anytime)|good talking|have a (good|great|nice|lovely) (one|day|night|evening|weekend)|see (you|ya)|later!|i'?ll text you( instead)?)\b/i;
// "i just sent you a link" said without actually sending one.
const CLAIMS_LINK = /\b(sent|dropped|texted|shared|popped)\b[^.?!]{0,40}\b(link|it)\b|\blink\b[^.?!]{0,30}\b(your texts|our texts|the chat|the thread)\b|\b(it'?s|it is) (in|on) (your|our) texts\b/i;
// Bracketed stage directions ("[starting call...]") are never said out loud or texted.
const STAGE_BRACKETS = /\s*\[([^\]\n]{1,160})\]\s*/g;
// Fill-ins in a draft ("hi [client's name],") stay; stripping them left "hi ,".
const PLACEHOLDER = /\b(name|company|business|date|time|day|email|phone|number|address|role|position|title|service|services|detail|details|amount|price|link|your|their|recipient|client|team|city|industry|x+)\b/i;
const STAGE_VERB = /^\s*\*?\s*(sends?|sending|sent|calling|calls?|dials?|dialing|pauses?|laughs?|smiles?|waits?|typing|hangs? up|ringing|drops?)\b/i;

// Whatever the model wrapped its words in, keep only what a person would actually say.
// The model sometimes narrates its own reasoning ("I'm waiting for Krish to respond. Since they're
// still on the call..."). That is never something to say to them.
// "send it" / "email them" ... and a reply that says it went out.
const SEND_REQUEST = /\b(send|sned|sewnd|email|forward|reply to)\b/i;
const CLAIMS_SENT = /^\s*(sent|done|all set)\b|\b(i('?ve| have)? (just )?sent|it'?s (been )?sent|email (is )?sent|sending (it|that|now)|on its way|(ready|good) to go|went out|it'?s out)\b/i;
const EMPTY_PROMISE = /\b(give me (a|one) (sec|second|moment|minute)|one sec(ond)?|i'?m (looking at|reading|going through) (it|this|that|them)( now)?|let me (pull|look|check|grab|find)|pulling (those|that|it|them) up|checking (now|on that))\b/i;
// The model talking about its own setup instead of to the person ("the system is being strict about
// the most recent message context..."). Only user-facing words ever go out; any sentence like this is dropped.
const LEAK =
  /\b(the system|system (prompt|message|note|instruction)s?|my (instructions|prompt|guidelines)|(the|my) instructions (say|tell|are)|instructed to|message context|most recent message|(is|was|has been|have been) already sent|already been sent|tool (call|result|output)s?|function call|the (assistant|model)\b|language model|conversation (history|log)|the transcript|recap instruction|(i'?m|i am) (not )?(allowed|supposed|permitted) to|as per (my|the) (rules|instructions)|onboarding (step|flow|item)s?)\b/i;
const META = /\b(i'?m waiting for|i should (stay|wait|remain|let|keep)|since (they|he|she|the user)|the user|i'?ll (stay quiet|wait (silently|quietly))|let them (check|speak|respond)|stay quiet|respond when ready|they haven'?t said)\b/i;

// Talking ABOUT them instead of TO them ("I'll text Paul a quick message... letting him know...").
const THIRD_PERSON = /\b(letting (him|her|them) know|acknowledging the|a quick message (to|for)|(text|message|ping|remind) (him|her)\b)/i;
function narratesAbout(x: string, userName?: string | null) {
  if (THIRD_PERSON.test(x)) return true;
  if (!userName) return false;
  const n = userName.replace(/[.*+?^${}()|[\]\\]/g, "");
  // "I'll text Paul", "Paul hasn't replied", "Paul is still on the call": their name as a third person.
  return new RegExp(`\\b(text|message|tell|remind|let|ping|call) ${n}\\b|\\b${n} (is|was|has|hasn'?t|isn'?t|said|seems|wants)\\b`, "i").test(x);
}

export function cleanModelText(t: string, userName?: string | null) {
  // The chat shows plain text, like sms: markdown bold/headers would show as literal symbols.
  const cleaned = t.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/^#{1,4}\s+/gm, "").replace(TOOL_NAMES, " ").replace(STAGE_BRACKETS, keepFillIns).replace(/^\s*\[|\]\s*$/gm, "").replace(/[ \t]{2,}/g, " ").trim();
  return cleaned
    .split(/\n\s*\n/)
    .map((b) => b.split(SENTENCE_BREAK).filter((x) => !META.test(x) && !LEAK.test(x) && !/\bSTATE\b/.test(x) && !EMPTY_PROMISE.test(x) && !narratesAbout(x, userName)).join(" "))
    .filter((b) => b.trim())
    .join("\n\n")
    .trim();
}
// Tool names occasionally leak into the reply text ("[send_gmail_link] sent it..."): never say them.
const TOOL_NAMES = /\s*\[?\b(set_slot|decline_slot|offer_call|start_call|send_gmail_link|end_call|graduate|send_gif)\b\]?\s*/gi;

function shortNeed(s: Session) {
  const n = s.slots.helpNeed.value;
  return n && n.length <= 60 ? n : null;
}

// Never vanish from a call: a hangup the agent initiates always carries a real goodbye.
export function goodbyeLine(s: Session) {
  const name = s.slots.userName.value;
  const need = shortNeed(s);
  return `okay${name ? ` ${name}` : ""}, i'll let you go${need ? ` and get started on ${need}` : ""}. i'll text you a quick recap, and you can call me back anytime. bye for now.`;
}

// Used only if the model produced nothing: the post-call text must always arrive.
export function recapFallback(s: Session, reason: string) {
  const need = shortNeed(s);
  const keep = need ? ` i'll keep ${need} in mind.` : "";
  if (reason === "user_hangup" || reason === "error") return `got cut off, no worries.${keep} text me whenever.`;
  return `thanks for the chat!${keep} text or call me anytime.`;
}

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
const SENTENCE_BREAK = /(?<!\b(?:dr|mr|mrs|ms|st|jr|sr|prof|mt|vs|ave|approx)\.)(?<=[.!?])\s+/i;
// For cutting length only, a closing quote or paren after the stop still ends the sentence.
const SENTENCE_END = /(?<!\b(?:dr|mr|mrs|ms|st|jr|sr|prof|mt|vs|ave|approx)\.["')]*)(?<=[.!?]["')]*)\s+/i;

function capSentences(text: string, max: number) {
  const parts = text.split(SENTENCE_END);
  return parts.length <= max ? text : parts.slice(0, max).join(" ").trim();
}

function emitAgentText(ctx: Ctx, raw: string) {
  // House style: no em dashes, no stage directions like "(waiting for reply)".
  const text = stopAtRepeat(raw.replace(TOOL_NAMES, " ").replace(STAGE_BRACKETS, keepFillIns)).replace(/\s*[—]\s*/g, ", ").replace(/\((on call|said on the call|texted in the chat|posted in the chat)\)\s*/gi, "").replace(/^\s*\*?\([^)]*\)\*?\s*$/gm, "").trim();
  // On a call, three sentences is already a lot to listen to; trim anything longer.
  const spoken = ctx.channel === "voice" ? capSentences(text.replace(/\n+/g, " ").trim(), 3) : text;
  // An email typed out in the reply stays one bubble (split per paragraph it read like several texts).
  const isEmail = /^\s*subject:/im.test(text);
  const bubbles =
    ctx.channel === "voice"
      ? [spoken]
      : isEmail
        ? [text.replace(/^\s*-{3,}\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim()]
        : capBubbles(text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean), 3);
  for (const b of bubbles.filter(Boolean)) {
    const m = msg("agent", ctx.channel, b, ctx.move ? { move: ctx.move } : {});
    ctx.newMessages.push(m);
    ctx.s.transcript.push(m);
  }
  if (ctx.channel === "voice" && spoken) ctx.actions.push({ type: "speak", text: spoken });
}

async function turn(
  s: Session,
  channel: Channel,
  extraInstruction?: string,
  fallback?: string,
  opts: { forceEnd?: boolean; move?: Move; avoid?: RegExp; soft?: boolean } = {},
): Promise<TurnResult> {
  const resendOk = /\b(resend|send (it|the link) again|another link|new link|lost the link)\b/i.test(lastUserText(s));
  const ctx: Ctx = { s, channel, actions: [], newMessages: [], resendOk, move: opts.move, allowEnd: !!opts.forceEnd, softInstruction: opts.soft };
  let text = "";
  let failed = false;
  try {
    text = cleanModelText(await generate(ctx, extraInstruction), s.slots.userName.value);
  } catch (err) {
    // Provider down or overloaded: fall through to the scripted line rather than go quiet.
    console.error("llm turn failed", err);
    failed = true;
  }
  s.llmFailures = failed ? (s.llmFailures ?? 0) + 1 : 0;
  // A turn that did something (sent the link, a gif, a card) doesn't need "say that again?" beside it.
  // Only things they can see (a link, a gif, a posted message) or a call action count; re-saving a
  // name re-sends the same contact card, which shows nothing new (that once swallowed a recap).
  const didSomething = ctx.newMessages.some((m) => m.kind !== "contact_card") || ctx.actions.length > 0;
  let usedFallback = false;
  if (!text.trim() && fallback && (failed || !didSomething)) {
    usedFallback = true;
    // The same "say that again?" on repeat looks broken; after the first miss, be honest about it.
    text = failed && (s.llmFailures ?? 0) > 1 ? outageLine(s, channel) : fallback;
    // On a call, "i'll text you instead" means actually hanging up (with that line as the goodbye).
    // On a call, one failure is a hiccup ("say that again?"); a second means we genuinely can't talk
    // right now: say so once and hang up for real (a final hangup: talking over it can't restart the loop).
    if (failed && channel === "voice" && (s.llmFailures ?? 0) > 1) {
      ctx.actions = ctx.actions.filter((a) => a.type !== "end_call");
      ctx.actions.push({ type: "end_call", final: true });
    }
  }
  // Some things must never be said in this moment (e.g. "got cut off" after we hung up ourselves).
  if (opts.avoid && fallback && opts.avoid.test(text)) text = fallback;
  if (opts.forceEnd && !ctx.actions.some((a) => a.type === "end_call")) ctx.actions.push({ type: "end_call" });
  // Placing a call: the text is just the heads up; the talking happens on the call.
  if (channel === "text" && ctx.actions.some((a) => a.type === "start_call")) {
    text = "calling you now.";
    ctx.move = EVENT_MOVES.callNow;
  }
  if (channel === "voice" && ctx.actions.some((a) => a.type === "end_call") && !GOODBYE.test(text)) {
    text = `${text.trim()} ${goodbyeLine(s)}`.trim();
  }
  // Said goodbye on a call but didn't hang up: hang up (a silence prompt after "bye" is the worst).
  if (channel === "voice" && s.call.active && !failed && GOODBYE.test(text) && userWrappingUp(s) && !ctx.actions.some((a) => a.type === "end_call")) {
    ctx.actions.push({ type: "end_call" });
  }
  // Gmail, by the book: the gmail turn ends with the code-written question; other turns don't pitch it.
  if ((!extraInstruction || ctx.softInstruction) && s.slots.gmail.status === "missing" && !ctx.newMessages.some((m) => m.kind === "gmail_link")) {
    const raisedIt = /\b(gmail|email|inbox|link)\b/i.test(lastUserText(s));
    const help = text.split(SENTENCE_BREAK).filter((x) => !GMAIL_PITCH.test(x) && !(ctx.move?.id === "ask-gmail" && /\b(without your (ok|okay)|won.?t send)/i.test(x))).join(" ").trim();
    if (ctx.move?.id === "ask-gmail") {
      // On a call: one sentence of help, then the ask, so the question is never cut off.
      const lead = channel === "voice" ? capSentences(help.replace(/\?[^?]*$/, "."), 1) : help;
      text = `${lead}${lead ? (channel === "voice" ? " " : "\n\n") : ""}${gmailAsk(s, channel)}`.trim();
    }
    else if (!raisedIt && help) text = help;
  }
  // Already connected, declined, or the link is already sitting in their texts: no more gmail asks
  // (the most common grader note: "repeated the gmail request after it was connected / agreed").
  const linkWaiting = linkPending(s) && !ctx.newMessages.some((m) => m.kind === "gmail_link");
  if ((s.slots.gmail.status !== "missing" || linkWaiting) && !/\b(gmail|google|link|connect)\b/i.test(lastUserText(s))) {
    const kept = text.split(SENTENCE_BREAK).filter((x) => !GMAIL_ASKISH.test(x)).join(" ").trim();
    if (kept) text = kept;
  }
  // On a call, never three questions in a row: after two, it just responds and lets them talk
  // (a call went question, question, question, question...). The gmail ask is the one exception.
  if (channel === "voice" && text.trim().endsWith("?") && ctx.move?.id !== "ask-gmail") {
    const lastTwo = s.transcript.filter((m) => m.role === "agent" && m.channel === "voice" && m.move?.id !== "silence").slice(-2);
    if (lastTwo.length === 2 && lastTwo.every((m) => m.text.trim().endsWith("?"))) {
      const kept = text.split(SENTENCE_BREAK).filter((x) => !x.trim().endsWith("?")).join(" ").trim();
      if (kept) text = kept;
    }
  }
  // Already named: never ask "what should i go by?" again (it did, on a call, right after being named).
  if (s.slots.agentName.status === "filled" && NAME_ASK.test(text)) {
    const kept = text.split(SENTENCE_BREAK).filter((x) => !NAME_ASK.test(x)).join(" ").trim();
    if (kept) text = kept;
  }
  // "sent!" only if send_email actually went out this turn.
  if (!ctx.sentEmail && !s.draft?.sent && SEND_REQUEST.test(lastUserText(s)) && CLAIMS_SENT.test(text)) {
    text = s.draft && !s.draft.sent ? "i haven't sent it yet. want me to send the draft above as is?" : "i haven't sent anything. want me to write it up as a draft first?";
  }
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  // An offer to call made in words counts as an offer (so it isn't repeated next turn).
  const offerSentence = sentences.some((x) => x.trim().endsWith("?") && /\b(quick call|give you a (quick )?(call|ring)|hop on a (quick )?call|mind if i call|want me to call)\b/i.test(x) && !/\b(skip|no worries)\b/i.test(x));
  if (channel === "text" && !s.call.active && offerSentence && !ctx.offeredCall) {
    s.callOffers += 1;
    if (s.phase === "intro") s.phase = "call_offered";
  }
  // Keep words and actions in sync: if it SAYS the link is in their texts (not asks whether to send it), it is.
  const claimsLink = sentences.some((x) => CLAIMS_LINK.test(x) && !x.trim().endsWith("?") && !/\b(want me to|should i|can i|shall i)\b/i.test(x));
  if (claimsLink && s.slots.gmail.status === "missing" && !ctx.newMessages.some((m) => m.kind === "gmail_link")) {
    if (gmailConsent(s)) await runTool(ctx, "send_gmail_link", {});
    // Never say it's sent when it isn't: drop the claim instead of sending a link they didn't ask for.
    else text = sentences.filter((x) => !(CLAIMS_LINK.test(x) && !x.trim().endsWith("?"))).join(" ").trim() || text;
  }
  // On a call, a draft (or anything long) is for reading, not listening: post it to the chat and say so.
  const looksLikeDraft = /---|\bsubject:|\bdear\b|\bhi \[|\[(landlord|name|recipient)[^\]]*\]/i.test(text) || text.length > 320;
  if (channel === "voice" && !extraInstruction && looksLikeDraft && !ctx.newMessages.some((m) => m.kind !== "gmail_link" && m.role === "agent" && m.channel === "text")) {
    const draft = text.replace(/^[^\n]*?(here'?s (something|a draft|one)[^:\n]*:|---)\s*/i, "").replace(/---/g, "").trim();
    const posted = msg("agent", "text", draft);
    ctx.newMessages.push(posted);
    s.transcript.push(posted);
    const isDraft = /---|\bsubject:|\bdear\b|\bhi \[|\[(landlord|name|recipient)[^\]]*\]/i.test(draft);
    text = isDraft ? "okay, i put the draft in our chat. take a look and tell me what to change." : "that's a lot to say out loud, so i put it in our chat.";
  }
  // On a call, if the link just went to their texts, say so (the written ask alone isn't enough).
  if (channel === "voice" && ctx.newMessages.some((m) => m.kind === "gmail_link") && !/\b(text|link)\b/i.test(text)) {
    text = `${text.trim()} i'm texting you the link right now. it's the card that says connect your google account, tap it whenever you're ready.`.trim();
  }
  // Ask bookkeeping: credit a question to the slot this turn's move was about (never the fallback line).
  const isQuestion = !usedFallback && text.includes("?");
  const MOVE_SLOT: Record<string, SlotKey> = { "name-me": "agentName", discover: "helpNeed", dig: "helpNeed", offramp: "helpNeed", "ask-name": "userName", "ask-gmail": "gmail" };
  const moveSlot = ctx.move ? MOVE_SLOT[ctx.move.id] : undefined;
  recordAsk(s, isQuestion && moveSlot && s.slots[moveSlot].status === "missing" ? moveSlot : null, isQuestion);
  emitAgentText(ctx, text);
  await Promise.all(ctx.pending ?? []);
  if (ctx.newCard) {
    s.transcript.push(ctx.newCard);
    ctx.newMessages.push(ctx.newCard);
  }
  const final = computeDirective(s, channel);
  return { session: s, newMessages: ctx.newMessages, chips: final.chips, actions: ctx.actions };
}

const NAME_ASK = /\b(what (do you want to|should i|would you like to|will you) (call me|go by)|what should i go by|name (for )?me)\b/i;
// Commands and reactions are never names ("send" once became "Send it is").
const NOT_A_NAME =
  /^(send|write|draft|call|email|connect|help|stop|cancel|done|next|go|continue|start|test|link|gmail|reply|check|find|search|wait|what\?|no|nah|nope|idk|i don'?t know|dunno|you pick|you choose|up to you|surprise me|anything|whatever|skip|why|what|whats|who|whos|hi|hey|hello|yes|yeah|yep|ok|okay|sure|cool|nice|thanks|thank you|ty|lol|haha|lmao|hmm+|um+|uh+|idc|nothing|none|me|you|it|this|that|i|im)\b/i;
// Answering "what do you want to call me?" with their own name is common: that's THEIR name.
const OWN_NAME = /^(?:(?:hi|hey|hello)[,! ]+)?(?:i'?m|i am|my name(?:'s| is)|it'?s|this is|call me)\s+([\p{L}][\p{L}'-]{0,19})[.!]?\s*(?:btw|lol)?[.!]?$/iu;

// Right after the agent asks for its name, a short reply like "Julia" or "call you Max" is the name.
async function captureAgentName(s: Session, channel: Channel, text: string): Promise<{ card?: Msg; pending: Promise<void>[] } | undefined> {
  if (channel !== "text" || s.slots.agentName.status !== "missing" || s.lastAskedSlot !== "agentName") return;
  // Only as the direct answer to the name question: a later "send" or "help" is never a name.
  const prevAgent = [...s.transcript].slice(0, -1).reverse().find((m) => m.role === "agent" && (!m.kind || m.kind === "text"));
  if (!prevAgent || !NAME_ASK.test(prevAgent.text)) return;
  const own = text.trim().match(OWN_NAME);
  if (own) {
    if (s.slots.userName.status !== "filled") {
      s.slots.userName = { ...s.slots.userName, value: own[1].replace(/^\p{L}/u, (c) => c.toUpperCase()), status: "filled", source: channel, updatedAt: Date.now() };
    }
    return; // the model re-asks what to call the assistant (prompt covers it)
  }
  // Typos like "Ju.lia" or "Ju_lia": drop stray punctuation between letters.
  const m = text.trim().replace(/(\p{L})[.·_*,](?=\p{L})/gu, "$1").match(/^(?:(?:i'?ll |let'?s |i wanna|i want to )?call (?:you|yourself) |how about |go with |name(?: you)?(?: is)? )?([\p{L}][\p{L}'-]{0,19}(?: [\p{L}][\p{L}'-]{0,19})?)[.!]?$/iu);
  if (!m || NOT_A_NAME.test(m[1])) return;
  const value = m[1].replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  const ctx: Ctx = { s, channel, actions: [], newMessages: [] };
  await runTool(ctx, "set_slot", { slot: "agentName", value });
  return { card: ctx.newCard, pending: ctx.pending ?? [] };
}

export async function handleUserMessage(
  s: Session,
  channel: Channel,
  text: string,
  attachments?: Attachment[],
  interrupted?: boolean,
  clientId?: string,
  heardBefore?: string,
): Promise<TurnResult> {
  // Curly apostrophes (phones type them) broke every "that's all" / "don't" check.
  const clean = text.slice(0, 4000).replace(/[‘’]/g, "'");
  // They cut the agent off: its history should hold only what they actually heard, so it never
  // assumes they got the rest ("as i said...").
  if (interrupted && heardBefore !== undefined && channel === "voice") {
    const last = [...s.transcript].reverse().find((m) => m.role === "agent" && m.channel === "voice" && !m.kind);
    // What shows on screen is just what they heard (with "..."); the note for the model lives in its own field.
    if (last && heardBefore.trim().length < last.text.length) {
      last.text = heardBefore.trim() ? `${heardBefore.trim()}...` : "...";
      last.cutOff = true;
    }
  }
  // The client shows the message instantly under its own id; reuse it so there's no duplicate.
  const userMsg = msg("user", channel, clean, { ...(attachments?.length ? { attachments } : {}), ...(clientId ? { id: clientId } : {}) });
  s.transcript.push(userMsg);
  recordOutcome(s, clean); // did they act on the last interruption, or wave it off?
  // A real answer ("mostly applying to jobs and schoolwork") pays for the question: the next turn can
  // respond AND move things forward. Without this, a call went "yeah, that's a lot." and died.
  if (clean.trim().split(/\s+/).length >= 5) s.consecutiveAsks = 0;
  // "no, text is fine" right after we offered a call: same as declining the ring.
  const prevAgent = [...s.transcript].slice(0, -1).reverse().find((m) => m.role === "agent" && (!m.kind || m.kind === "text"));
  // "no calls lol i hate phone calls", said anytime (not just after an offer): never ring or offer one
  // again unless they ask for a call themselves later.
  const refusesCalls = NO_CALLS.test(clean) && !/\b(you can|now you can|ok(ay)? (you can )?call|call me (now|back))\b/i.test(clean);
  if (channel === "text" && !s.call.active && (refusesCalls || (prevAgent && OFFERED_CALL.test(prevAgent.text) && CALL_NO.test(clean) && !/\b(sure|yes|yeah|ok)\b/i.test(clean)))) {
    s.callOffers = MAX_CALL_OFFERS;
    s.callDeclinedAt = s.transcript.length;
    s.call = { ...s.call, endedReason: "declined" };
    if (s.phase === "call_offered") s.phase = "intro";
  }
  if (channel === "voice") {
    s.call.silenceStrikes = 0;
    // "hold on a sec": a person just says "sure" and waits; no questions, no check-ins for a while.
    if (HOLD.test(clean) && clean.split(/\s+/).length <= 8) {
      s.call.holding = true;
      const ctx: Ctx = { s, channel, actions: [{ type: "patience", ms: 90000 }], newMessages: [], move: EVENT_MOVES.silence };
      emitAgentText(ctx, "sure, take your time.");
      return { session: s, newMessages: [userMsg, ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: ctx.actions };
    }
    // "i'll let you know once it's connected": they're off doing something, so wait like after "hold on".
    s.call.holding = WAITING_ON_THEM.test(clean);
    // They said bye: say it back (always, and audibly), then hang up. No model, nothing to go wrong.
    if (/\b(end (the |this )?call|hang up|you can go|let'?s end|bye|goodbye|gotta go|got to go|talk (to you )?(soon|later)|see (you|ya)|that'?s all|that'?s it)\b/i.test(clean) && !/\b(don'?t|do not|not)\b[^.!?]{0,10}\b(hang up|end)/i.test(clean) && clean.split(/\s+/).length <= 12 && s.call.active) {
      const name = s.slots.userName.value;
      const ctx: Ctx = { s, channel, actions: [], newMessages: [], move: EVENT_MOVES.recap };
      emitAgentText(ctx, `okay, bye${name ? ` ${name}` : ""}! i'll text you a quick recap.`);
      ctx.actions.push({ type: "end_call", final: true });
      return { session: s, newMessages: [userMsg, ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: ctx.actions };
    }
  }
  // Name reply safety net: models sometimes say "julia it is" without saving it.
  const named = await captureAgentName(s, channel, clean);
  // A second pass reads the message for names, needs and refusals while the reply is written.
  const heard = extract(s, clean);
  // "call you nova, and can you check my email": the name and its contact card come first, then the rest.
  const early = named ? null : await nameFirst(s, channel, clean, heard);
  // Pure laughter or thanks, over text, when a gif is allowed: answer with one.
  if (channel === "text" && !s.call.active && (LAUGH.test(clean) || THANKS.test(clean)) && gifAllowed(s)) {
    const gif = makeGif(s, LAUGH.test(clean) ? "lol" : "ok");
    s.transcript.push(gif);
    recordAsk(s, null);
    return { session: s, newMessages: [userMsg, ...(early?.msgs ?? []), gif], chips: computeDirective(s, channel).chips, actions: [] };
  }
  // They just named the assistant: answer the way persona does, instantly, no model needed.
  if (named?.card && channel === "text" && s.callOffers === 0 && !s.call.active) {
    const name = s.slots.agentName.value!;
    s.callOffers = 1;
    if (s.phase === "intro") s.phase = "call_offered";
    recordAsk(s, null);
    const ctx: Ctx = { s, channel, actions: [], newMessages: [], move: EVENT_MOVES.named };
    emitAgentText(ctx, `${nameAck(name)} save my contact card so you know it's me\n\nwant me to give you a quick call to get you set up? way easier than typing it all out`);
    s.transcript.push(named.card);
    ctx.newMessages.push(named.card);
    await Promise.all(named.pending);
    return { session: s, newMessages: [userMsg, ...(early?.msgs ?? []), ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: [] };
  }
  // They said yes to our call offer: ring now, the way persona does ("calling you now."), no model needed.
  const prevText = [...s.transcript].slice(0, -1).reverse().find((m) => m.role === "agent" && (!m.kind || m.kind === "text"));
  // Asking for a call is the answer; no need to confirm it back ("could we call?" -> ring).
  const asksForCall =
    /\b(call me(?=\s*($|[.!?,]|(now|back|please|pls|plz|asap|right now|real quick|quick|when|whenever|anytime|later|today|tomorrow|so|and|if|then)\b))|(can|could|should|shall) (we|you) (call|hop on a call|do a call)|let'?s (call|hop on a call|do a call)|give me a (call|ring)|ring me|phone me|hop on a (quick )?call)\b/i.test(clean) &&
    !NEGATED_CALL.test(clean);
  // A short yes ("sure", "yeah call me") is a yes; "yes but u aren't listening..." is not (it rang once).
  const saidYesToOffer = !!prevText && OFFERED_CALL.test(prevText.text) && YES.test(clean) && !/\bbut\b/i.test(clean) && (clean.trim().split(/\s+/).length <= 4 || /\b(call|ring)\b/i.test(clean));
  if (channel === "text" && !s.call.active && s.slots.agentName.status !== "missing" && (asksForCall || saidYesToOffer) && !CALL_NO.test(clean)) {
    const ctx: Ctx = { s, channel, actions: [], newMessages: [], move: EVENT_MOVES.callNow };
    const out = await runTool(ctx, "start_call", {});
    if (!out.startsWith("error")) {
      recordAsk(s, null);
      // "i'm krish, call me": take their name too, and say it, before ringing.
      const e = await heard.catch(() => null);
      const hadName = s.slots.userName.status === "filled";
      if (e) await applyExtracted(s, { ...e, agentName: null }, async () => {});
      const name = !hadName && s.slots.userName.status === "filled" ? s.slots.userName.value : null;
      emitAgentText(ctx, name ? `nice to meet you ${name}! calling you now.` : "calling you now.");
      return { session: s, newMessages: [userMsg, ...(early?.msgs ?? []), ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: ctx.actions };
    }
  }
  // "send" / "did you send it?" with a draft waiting: answered in code, so it's never vague about what happened.
  const pendingDraft = channel === "text" && !s.call.active && s.draft && !s.draft.sent ? s.draft : null;
  if (channel === "text" && s.draft?.sent && SENT_Q.test(clean)) {
    const ctx: Ctx = { s, channel, actions: [], newMessages: [], move: EVENT_MOVES.honest };
    emitAgentText(ctx, `yep, it went to ${s.draft.to}.`);
    return { session: s, newMessages: [userMsg, ...(early?.msgs ?? []), ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: [] };
  }
  // "yes" right after "want me to send the draft to x?" counts too.
  const sendCmd = SEND_CMD.test(clean) || (YES.test(clean) && clean.split(/\s+/).length <= 4 && !!prevAgent && /\bsend\b[^?]*\?/i.test(prevAgent.text));
  if (pendingDraft && (sendCmd || SENT_Q.test(clean))) {
    const ctx: Ctx = { s, channel, actions: [], newMessages: [], move: EVENT_MOVES.honest };
    if (s.slots.gmail.status !== "filled") {
      const hasCard = s.transcript.some((m) => m.kind === "gmail_link");
      emitAgentText(ctx, `${sendCmd ? "not sent yet" : "no, not yet"}: i need your gmail connected to send it. ${hasCard ? "tap the \"connect your google account\" card" : "here's the link, one tap"} and i'll send it right after.`);
      if (!hasCard) {
        ctx.resendOk = true;
        const link = msg("agent", "text", "Connect your Google account", { kind: "gmail_link" });
        ctx.newMessages.push(link);
        s.transcript.push(link);
      }
    } else if (sendCmd) {
      const out = await sendEmailTool(ctx);
      emitAgentText(ctx, out.startsWith("sent") ? `sent to ${pendingDraft.to}.` : pendingDraft.to ? `couldn't send it: ${out.replace(/^error: /, "").split(".")[0]}.` : "who should it go to? send me their email address.");
    } else {
      emitAgentText(ctx, `no, not yet. want me to send it to ${pendingDraft.to || "them"}?`);
    }
    recordAsk(s, null);
    return { session: s, newMessages: [userMsg, ...(early?.msgs ?? []), ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: ctx.actions };
  }
  // "send me the terms link": that's the legal page, not gmail (a run sent the gmail link three times).
  if (TERMS_LINK.test(clean)) {
    const ctx: Ctx = { s, channel, actions: [], newMessages: [], move: EVENT_MOVES.honest };
    const card = msg("agent", "text", "yourpersona.com/legal", { kind: "link_preview" });
    if (channel === "voice") {
      s.transcript.push(card);
      ctx.newMessages.push(card);
      emitAgentText(ctx, "sure, i just texted you the terms link. it's in our chat.");
    } else {
      emitAgentText(ctx, "here are the terms and privacy policy:");
      s.transcript.push(card);
      ctx.newMessages.push(card);
    }
    recordAsk(s, null);
    return { session: s, newMessages: [userMsg, ...(early?.msgs ?? []), ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: ctx.actions };
  }
  // They said yes to the link: send it now (not left to the model), then let the reply mention it.
  let linkSent: Msg[] = [];
  let linkNote: string | undefined;
  const lastLinkAsk = [...s.transcript].slice(0, -1).reverse().find((m) => m.role === "agent" && (!m.kind || m.kind === "text"));
  const askedForLink = WANTS_LINK.test(clean) && !/\b(don'?t|do not|not)\b/i.test(clean);
  if (s.slots.gmail.status === "missing" && (askedForLink || (lastLinkAsk?.text.includes(GMAIL_ASK_MARK) && gmailConsent(s)))) {
    const ctx: Ctx = { s, channel, actions: [], newMessages: [] };
    const out = await runTool(ctx, "send_gmail_link", {});
    if (!out.startsWith("error")) {
      linkSent = ctx.newMessages;
      linkNote =
        channel === "voice"
          ? "You just put the Gmail link in the text chat (a separate stream from this call). Say out loud that you're texting it right now, that it's the card that says 'connect your google account', and that signing in takes a few seconds. Don't send another."
          : "You just sent the Gmail link card in the chat. Say it's right there (the card that says 'connect your google account') and that it takes a few seconds. Don't send another.";
    }
  } else if (s.slots.gmail.status === "missing" && lastLinkAsk?.text.includes(GMAIL_ASK_MARK) && /^\s*(no|nah|nope|not now|later|no thanks)\b/i.test(clean)) {
    s.slots.gmail.status = "declined";
  }
  // "skip all this, just find me sushi": setup ends now, in code, and the request gets answered.
  if (!s.call.active && s.phase !== "graduated" && SKIP_SETUP.test(clean)) {
    s.phase = "graduated";
    s.graduatedReason = "they skipped setup";
    for (const k of Object.keys(s.slots) as SlotKey[]) if (s.slots[k].status === "missing") s.slots[k].status = "deferred";
    const bare = /^\s*(ok(ay)?,?\s*)?(can we |let'?s |i want to |just )?skip( all( of)?)?( this| that| it| setup| the setup| the rest)*\W*$/i.test(clean);
    const r = await turn(
      s,
      "text",
      bare
        ? "They skipped setup, and setup is over: you're their full assistant now. Say that's fine in a few words and ask what they want to get done first. Don't ask for their name, Gmail, or a call."
        : "They skipped setup, and setup is over: you're their full assistant now. Help with what they asked for in this same message, right now, in text. Don't offer a call, and don't ask for their name or Gmail.",
    );
    r.actions.push({ type: "graduate" });
    r.newMessages.unshift(userMsg, ...(early?.msgs ?? []));
    return r;
  }
  if (/^\s*skip setup\s*$/i.test(clean) && s.phase !== "graduated") {
    const skip = s.call.active
      ? await turn(s, channel, "They want to skip the rest of setup. Say a short goodbye, say you'll pick it up over text, and call end_call.", goodbyeLine(s), { forceEnd: true })
      : await turn(s, channel, "The user asked to skip setup. Respect it: call graduate, then ask what they want to get done first.");
    if (s.call.active) s.graduateAfterCall = true;
    skip.newMessages.unshift(userMsg, ...(early?.msgs ?? []));
    return skip;
  }
  // They answered something else instead of naming it ("i need help with my inbox"): follow them, then a
  // double text takes "persona" as a default they can change. A short "hi" or "?" gets one more chance.
  let skippedName = false;
  if (channel === "text" && !s.call.active && s.phase !== "graduated" && s.slots.agentName.status === "missing" && s.lastAskedSlot === "agentName" && !OWN_NAME.test(clean.trim()) && !DELEGATE.test(clean) && !LAUGH.test(clean) && !NAME_HINT.test(clean)) {
    const askIdx = s.transcript.findLastIndex((m) => m.role === "agent" && NAME_ASK.test(m.text));
    const replies = s.transcript.slice(askIdx + 1).filter((m) => m.role === "user").length;
    const e0 = await heard.catch(() => null);
    if (!e0?.agentName && (clean.trim().split(/\s+/).length >= 3 || replies >= 2)) {
      defaultAgentName(s);
      skippedName = true;
    }
  }
  // They typed in the chat while we're on the call: answer out loud, and say we saw their text.
  const replyChannel: Channel = channel === "text" && s.call.active ? "voice" : channel;
  const sawText = channel === "text" && s.call.active ? "They just TEXTED this in the chat while you're on the call. Answer out loud on the call and mention you saw their text." : undefined;
  const r = await turn(
    s,
    replyChannel,
    [early?.note, linkNote ?? sawText, skippedName ? "They skipped naming you. You're going by Persona for now and a separate text right after yours tells them, so don't mention your name or ask for one. Just respond to what they said." : undefined].filter(Boolean).join(" ") || (interrupted ? "They talked over you mid-sentence. Drop what you were saying and respond to what they just said; don't repeat your cut-off line unless they ask." : undefined),
    linkNote ? (channel === "voice" ? "okay, i'm texting you the link right now. it's the card that says connect your google account, tap it whenever you're ready." : "here you go, it's the card right there. signing in takes a few seconds.") : channel === "voice" ? "sorry, i missed that. say it one more time?" : "sorry, i lost my train of thought for a sec. can you say that again?",
    // A note about an interruption or a text mid-call still gets this turn's move (like the gmail offer).
    { soft: !linkNote },
  );
  if (linkSent.length) {
    // The link sits right before the reply that mentions it.
    r.newMessages.unshift(...linkSent);
    if (s.call.active) r.actions.unshift({ type: "patience", ms: 30000 });
  }
  if (early) r.newMessages.unshift(...early.msgs);
  r.newMessages.unshift(userMsg);
  if (skippedName && !r.actions.some((a) => a.type === "start_call")) {
    const ctx: Ctx = { s, channel: "text", actions: [], newMessages: [], move: EVENT_MOVES.defaultName };
    emitAgentText(ctx, SKIPPED_NAME);
    r.newMessages.push(...ctx.newMessages);
  }
  if (channel === "voice" && s.call.holding && s.call.active) r.actions.push({ type: "patience", ms: 90000 });
  // Image bytes were for this one reply; storing them would bloat every later read and write.
  if (userMsg.attachments?.some((a) => a.dataUrl)) {
    const i = s.transcript.indexOf(userMsg);
    if (i >= 0) s.transcript[i] = { ...userMsg, attachments: userMsg.attachments.map(({ dataUrl, ...a }) => ({ ...a, summary: a.summary ?? (dataUrl ? "a photo they sent" : undefined) })) };
  }
  const card = named?.card;
  if (card && !r.newMessages.includes(card)) {
    // Card goes after the text, like persona's.
    if (!s.transcript.includes(card)) s.transcript.push(card);
    r.newMessages.push(card);
  }
  await Promise.all(named?.pending ?? []);
  const e = await heard;
  // Only rename the assistant from the extractor when they clearly meant to (answering the ask, or "call you X").
  const meantAgentName = s.lastAskedSlot === "agentName" || /\b(call (you|yourself)|your name|name you|rename)\b/i.test(clean);
  await applyExtracted(s, meantAgentName ? e : { ...e, agentName: null }, async (value) => {
    const ctx: Ctx = { s, channel, actions: [], newMessages: [] };
    await runTool(ctx, "set_slot", { slot: "agentName", value });
    await Promise.all(ctx.pending ?? []);
    const card = ctx.newCard ?? ctx.newMessages.find((m) => m.kind === "contact_card");
    if (card) {
      if (!s.transcript.includes(card)) s.transcript.push(card);
      if (!r.newMessages.includes(card)) r.newMessages.push(card);
    }
  });
  return r;
}

export type SessionEvent =
  | { type: "open" }
  | { type: "call_started"; byUser?: boolean }
  | { type: "call_declined" }
  | { type: "call_ended"; reason: "user_hangup" | "agent_ended" | "error" }
  | { type: "silence" }
  | { type: "text_idle" } // over text, their turn and they went quiet (left on read)
  | { type: "contact_saved" }
  | { type: "mic_denied" }
  | { type: "gmail_connected"; email?: string }
  | { type: "gmail_failed"; error: string };

function eventMsg(s: Session, text: string): Msg {
  const m = msg("event", "text", text, { kind: "event" });
  s.transcript.push(m);
  return m;
}

export async function handleEvent(s: Session, e: SessionEvent): Promise<TurnResult> {
  const start = s.transcript.length;
  const r = await handleEventInner(s, e);
  // Anything the event added to the transcript (e.g. "Call ended (12s)") goes out with the reply, in order.
  const added = s.transcript.slice(start);
  const updated = r.newMessages.filter((m) => !added.includes(m));
  r.newMessages = [...updated, ...added.filter((m) => m.kind === "event" || r.newMessages.includes(m))];
  return r;
}

async function handleEventInner(s: Session, e: SessionEvent): Promise<TurnResult> {
  const idle = (): TurnResult => ({ session: s, newMessages: [], chips: computeDirective(s, "text").chips, actions: [] });
  switch (e.type) {
    case "open": {
      if (s.transcript.length > 0) return idle(); // resume after refresh: no duplicate greeting
      // Scripted, like Persona's real first text: who it is, what it does, the legal line, then the one ask.
      const intro = [
        msg("agent", "text", "Hey! I'm your new personal assistant"),
        msg("agent", "text", INTRO_CAPABILITIES),
        msg("agent", "text", "yourpersona.com/legal", { kind: "link_preview" }),
        msg("agent", "text", "What do you want to call me?", { move: EVENT_MOVES.intro }),
      ];
      s.transcript.push(...intro);
      recordAsk(s, "agentName");
      return { session: s, newMessages: intro, chips: computeDirective(s, "text").chips, actions: [] };
    }
    case "call_started":
      if (s.call.active) return idle();
      s.call = { active: true, startedAt: Date.now(), silenceStrikes: 0, byUser: !!e.byUser };
      s.prePhase = s.phase;
      s.phase = "on_call";
      eventMsg(s, "Call started");
      {
        // Written by code so the first words come right away (no model wait on the line).
        const ctx: Ctx = { s, channel: "voice", actions: [], newMessages: [], move: EVENT_MOVES.greet };
        const who = s.slots.agentName.value ?? "me";
        const name = s.slots.userName.value;
        // They called us: they're bringing something. Warm, open, no agenda, nothing from before.
        const next = e.byUser
          ? "really good to hear from you. what's going on?"
          : s.slots.userName.status === "missing"
            ? "what should i call you?"
            : s.slots.helpNeed.status === "missing"
              ? "what's been taking up most of your time lately?"
              : "how's it going?";
        const line = e.byUser ? `hey${name ? ` ${name}` : ""}! ${next}` : `hey${name ? ` ${name}` : ""}, it's ${who}! ${next}`;
        // Right after hello, a quick "can you hear me?" (10s) catches a dead mic; after that, quiet is fine.
        ctx.actions.push({ type: "patience", ms: 10000 });
        emitAgentText(ctx, line);
        recordAsk(s, !e.byUser && s.slots.userName.status === "missing" ? "userName" : !e.byUser && s.slots.helpNeed.status === "missing" ? "helpNeed" : null, true);
        return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "voice").chips, actions: ctx.actions };
      }
    case "call_declined":
      s.call = { ...s.call, active: false, endedReason: "declined" };
      s.callOffers = Math.max(s.callOffers, 1);
      if (s.phase === "call_offered") s.phase = "intro";
      eventMsg(s, "Call declined");
      {
        // Written by code: the model once answered a decline with "i'll wait here for you to pick up".
        const ctx: Ctx = { s, channel: "text", actions: [], newMessages: [], move: EVENT_MOVES.declined };
        emitAgentText(ctx, "no worries, we can keep it to text. what's on your mind?");
        recordAsk(s, null);
        return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "text").chips, actions: [] };
      }
    case "call_ended": {
      if (!s.call.active) return idle(); // duplicate hangup events
      s.call = { ...s.call, active: false, endedAt: Date.now(), endedReason: e.reason };
      if (s.pendingVoice) {
        s.voice = s.pendingVoice;
        s.pendingVoice = undefined;
      }
      s.phase = s.prePhase === "graduated" || s.graduateAfterCall ? "graduated" : "post_call";
      if (s.graduateAfterCall) {
        s.graduateAfterCall = false;
        for (const k of Object.keys(s.slots) as SlotKey[]) if (s.slots[k].status === "missing") s.slots[k].status = "deferred";
      }
      const secs = Math.round(((s.call.endedAt ?? 0) - (s.call.startedAt ?? 0)) / 1000);
      eventMsg(s, `Call ended (${secs}s)`);
      const how =
        e.reason === "agent_ended"
          ? "You ended it after saying goodbye, so don't say you got cut off."
          : e.reason === "user_hangup"
            ? "They hung up (maybe on purpose, maybe not)."
            : "The line dropped on our side.";
      const r = await turn(s, "text", `${RECAP_INSTRUCTION} ${how} Call lasted ${secs}s.`, recapFallback(s, e.reason), {
        move: EVENT_MOVES.recap,
        avoid: e.reason === "agent_ended" ? /\b(cut off|dropped|lost you|got disconnected)\b/i : undefined,
      });
      // A text always follows a call. If the model's recap got filtered to nothing, the code-written one goes out.
      if (!r.newMessages.some((m) => m.role === "agent" && m.channel === "text" && !m.kind)) {
        const ctx: Ctx = { s, channel: "text", actions: [], newMessages: [], move: EVENT_MOVES.recap };
        emitAgentText(ctx, recapFallback(s, e.reason));
        r.newMessages.push(...ctx.newMessages);
      }
      return r;
    }
    case "silence": {
      if (!s.call.active) return idle();
      s.call.silenceStrikes += 1;
      const name = s.slots.userName.value;
      // Quiet is fine. Only after a real while does it check in, once; if it's still quiet after
      // that, it says it's hanging up and does (never waits forever, never hangs up without warning).
      if (s.call.silenceStrikes >= MAX_SILENCE_STRIKES) {
        const ctx: Ctx = { s, channel: "voice", actions: [], newMessages: [], move: EVENT_MOVES.silence };
        emitAgentText(ctx, `i haven't heard anything for a bit, so i'm going to hang up now. i'll text you, and you can call me back anytime. bye${name ? ` ${name}` : ""}!`);
        ctx.actions.push({ type: "end_call" });
        return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "voice").chips, actions: ctx.actions };
      }
      // When the conversation has just run out, pick it back up gently instead of "still there?".
      const line = !heardThemThisCall(s)
        ? "hello? can you hear me okay?"
        : s.call.holding
          ? "still there? no rush."
          : "is there anything you wanted to ask me, about setup or anything else? i'm here to help, and we can always just text if that's easier.";
      const ctx: Ctx = { s, channel: "voice", actions: [{ type: "patience", ms: s.call.holding ? 30000 : 20000 }], newMessages: [], move: EVENT_MOVES.silence };
      emitAgentText(ctx, line);
      return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "voice").chips, actions: ctx.actions };
    }
    case "text_idle": {
      // Left on read over text. A friend doesn't go silent and doesn't nag: one easy double text,
      // a lighter one much later, then quiet until they're back.
      if (s.call.active) return idle();
      const lastUserIdx = s.transcript.findLastIndex((m) => m.role === "user");
      const since = s.transcript.slice(lastUserIdx + 1);
      const lastAgent = since.findLast((m) => m.role === "agent" && (!m.kind || m.kind === "text"));
      if (!lastAgent || Date.now() - lastAgent.ts < IDLE_MIN_MS) return idle(); // their message is newer, or another tab just nudged
      const nudges = countNudges(since);
      if (nudges >= MAX_IDLE_NUDGES) return idle();
      // They signed off ("thanks, bye"), or we already said goodbye: nothing to chase.
      if (lastUserIdx >= 0 && USER_BYE.test(s.transcript[lastUserIdx].text) && nudges === 0) return idle();
      const ctx: Ctx = { s, channel: "text", actions: [], newMessages: [], move: EVENT_MOVES.nudge };
      const name = s.slots.userName.value;
      if (nudges >= 1) {
        // The second one never asks anything: it just leaves the door open.
        emitAgentText(ctx, name ? `all good ${name}, no rush. i'm here whenever` : "all good, no rush. i'm here whenever");
        recordAsk(s, null);
        return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "text").chips, actions: [] };
      }
      // They never answered "what do you want to call me?": take a default they can change, keep moving.
      if (s.slots.agentName.status === "missing" && s.lastAskedSlot === "agentName") {
        defaultAgentName(s);
        ctx.move = EVENT_MOVES.defaultName;
        const d = computeDirective(s, "text");
        const callAsk = d.offerCall && s.callOffers === 0;
        if (callAsk) {
          s.callOffers = 1;
          if (s.phase === "intro") s.phase = "call_offered";
        }
        emitAgentText(ctx, `${SKIPPED_NAME}${callAsk ? `\n\nwant me to give you a quick call to get you set up? way easier than typing it all out` : ""}`);
        recordAsk(s, null, callAsk);
        return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "text").chips, actions: [] };
      }
      // The link is sitting in their texts: they may be mid sign-in. Give room, no question.
      if (linkPending(s)) {
        emitAgentText(ctx, "no rush on the google sign in btw. the card's right up there whenever you're ready");
        recordAsk(s, null);
        return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "text").chips, actions: [] };
      }
      // An unanswered call offer: take the pressure off and keep the conversation going over text.
      if (OFFERED_CALL.test(lastAgent.text) && !s.call.active) {
        const q = s.slots.helpNeed.status === "missing" ? " what's been eating your time lately?" : "";
        emitAgentText(ctx, `no pressure on the call btw, texting works just as well.${q}`);
        recordAsk(s, q ? "helpNeed" : null, !!q);
        return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "text").chips, actions: [] };
      }
      return turn(s, "text", IDLE_INSTRUCTION, name ? `no rush ${name}, i'm around whenever` : "no rush, i'm around whenever", { move: EVENT_MOVES.nudge, avoid: /\b(just checking in|are you (still )?there|still there|did you (see|get) my)\b/i });
    }
    case "contact_saved": {
      if (s.contactSaved) return idle();
      s.contactSaved = true;
      // Saving the card is them doing what we asked; if the call offer is still unanswered, pick it back up.
      const lastOffer = s.transcript.findLastIndex((m) => m.role === "agent" && (!m.kind || m.kind === "text") && OFFERED_CALL.test(m.text));
      const answered = lastOffer >= 0 && s.transcript.slice(lastOffer + 1).some((m) => m.role === "user");
      const lastText = s.transcript.findLastIndex((m) => m.role === "agent" && (!m.kind || m.kind === "text"));
      // The offer is still the last thing it said: it's right there, asking again is just noise.
      if (lastOffer < 0 || lastOffer === lastText || answered || s.call.active || s.callDeclinedAt !== undefined || s.phase === "graduated") return idle();
      const ctx: Ctx = { s, channel: "text", actions: [], newMessages: [], move: EVENT_MOVES.named };
      emitAgentText(ctx, "saved, now you'll know it's me. want me to call now?");
      return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "text").chips, actions: [] };
    }
    case "mic_denied":
      eventMsg(s, "Microphone unavailable");
      s.callOffers = MAX_CALL_OFFERS; // no mic: don't keep offering calls
      s.call = { ...s.call, active: false, endedReason: "error" };
      if (s.phase === "on_call" || s.phase === "call_offered") s.phase = "intro";
      return turn(
        s,
        "text",
        "The call couldn't start because their microphone isn't available. No problem: carry on over text.",
        "looks like your mic isn't available, no problem. we can do this over text.",
      );
    case "gmail_connected": {
      // Only trust what the oauth callback verified (test runs may pass an email explicitly).
      const v = s.gmailVerified ?? (process.env.ALLOW_TEST_EVENTS === "1" && e.email ? { email: e.email, unread: 7, inbox: DEMO_INBOX } : null);
      if (!v) return idle();
      s.gmailVerified = undefined;
      if (s.slots.gmail.status === "filled" && s.gmailEmail === v.email) return idle();
      s.slots.gmail = { value: v.email, status: "filled", asks: s.slots.gmail.asks, source: s.call.active ? "voice" : "text", updatedAt: Date.now() };
      s.gmailEmail = v.email;
      s.gmailUnread = v.unread;
      eventMsg(s, `Gmail connected: ${v.email}`);
      // They connected to send a draft: that's the next step, the inbox can wait.
      if (s.draft && !s.draft.sent && !s.call.active) {
        const ctx: Ctx = { s, channel: "text", actions: [], newMessages: [], move: EVENT_MOVES.callNow };
        emitAgentText(ctx, s.draft.to ? `connected. want me to send the draft to ${s.draft.to} now?` : "connected. who should the draft go to? send me their email address.");
        return { session: s, newMessages: ctx.newMessages, chips: computeDirective(s, "text").chips, actions: [] };
      }
      // Interrupt only if waiting would cost them something; everything else is a digest line.
      const t = await triageInbox(s, v.inbox ?? []);
      let inboxNote: string;
      let fallback: string;
      if (t.interrupt) {
        const it = t.interrupt.item;
        (s.alerts ??= []).push({ id: it.id, category: t.interrupt.category!, reason: t.interrupt.reason, subject: it.subject, from: it.fromName, shownAt: Date.now(), outcome: "pending" });
        inboxNote = `From their unread mail, ONE item is worth raising now: "${it.subject}" from ${it.fromName} (${it.snippet.slice(0, 120)}). Why it matters: ${t.interrupt.reason}. Mention just this one, say briefly why (the evidence), and offer one concrete thing you can do about it. Say the rest can wait for a digest. Don't list other emails.`;
        fallback = `gmail's connected. one thing that looks like it can't wait: "${it.subject}" from ${it.fromName}. want me to draft a reply?`;
      } else {
        inboxNote = `Nothing in their unread mail looks urgent (no deadlines, money issues, or people waiting). Don't list emails or invent any. Just say it's connected and nothing needs them right now; you'll keep the rest for a digest.`;
        fallback = "gmail's connected. nothing urgent in there, i'll keep the rest for a digest.";
      }
      return turn(s, s.call.active ? "voice" : "text", `Their Gmail just connected. ${inboxNote}`, fallback, t.interrupt ? { move: EVENT_MOVES.interrupt } : {});
    }
    case "gmail_failed": {
      const cancelled = /access_denied|cancel/i.test(e.error);
      eventMsg(s, cancelled ? "Gmail connection cancelled" : "Gmail connection didn't finish");
      return turn(
        s,
        s.call.active ? "voice" : "text",
        cancelled
          ? "They closed the Google screen without connecting. That's a choice, not an error: acknowledge lightly, no pressure, and carry on with whatever they need."
          : `Connecting Gmail didn't complete (${e.error.slice(0, 80)}). Own it lightly, reassure them it's optional and they can retry anytime; don't push.`,
        cancelled ? "no worries, we can skip gmail for now." : "looks like that didn't go through, my bad. it's optional, and the link works whenever.",
      );
    }
  }
}

function keepFillIns(m: string, inner: string) {
  return PLACEHOLDER.test(inner) && !STAGE_VERB.test(inner) ? m : " ";
}

// --- email drafts and sending (gmail.compose) ---

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
// A send needs their explicit ok, after they've seen the exact draft.
const SEND_OK = /\b(send( it| that| this| the (email|draft|message)| away)?|ship it|fire (it )?(off|away)|go ahead|yes|yeah|yep|yup|sure|do it|ok(ay)?|looks good|perfect)\b/i;
const SEND_HOLD = /\b(don'?t|do not|not yet|wait|hold|change|edit|fix|but|instead|actually|no)\b/i;

type GmailAccess = { token: string } | { demo: true } | { error: string };

async function gmailAccess(s: Session): Promise<GmailAccess> {
  if (s.slots.gmail.status !== "filled") return { error: "error: gmail isn't connected. write the draft right in your message instead, and offer the link if they want it saved or sent" };
  const token = await getSecret(`gtoken:${s.id}`).catch(() => null);
  if (!token) {
    if (s.gmailEmail === "demo.user@gmail.com" || process.env.ALLOW_TEST_EVENTS === "1") return { demo: true };
    return { error: "error: your gmail access has expired. tell them honestly and offer to send the link again to reconnect" };
  }
  if ((await getSecret(`gscope:${s.id}`).catch(() => null)) === "read") {
    return { error: "error: their gmail connection only allows reading, not drafts or sending. show the draft in the chat anyway, and ask if they want the link again to allow drafts (one tap)" };
  }
  return { token };
}

const scopeError = (reason: "expired" | "no_scope" | "failed", what: string) =>
  reason === "expired"
    ? "error: your gmail access has expired. tell them honestly and offer to send the link again to reconnect"
    : reason === "no_scope"
      ? "error: their gmail connection doesn't allow drafts or sending. ask if they want the link again to allow it (one tap)"
      : `error: gmail didn't ${what}. tell them honestly; never say it worked`;

async function saveDraftTool(ctx: Ctx, input: Record<string, unknown>): Promise<string> {
  const { s } = ctx;
  const d = { to: String(input.to ?? "").trim().slice(0, 200), subject: String(input.subject ?? "").trim().slice(0, 200), body: String(input.body ?? "").trim().slice(0, 5000) };
  if (!d.body) return "error: the draft is empty";
  // "[your name]" when we know their name is just a gap we can fill.
  if (s.slots.userName.value) d.body = d.body.replace(/\[(your|my|sender'?s?) (full )?name\]/gi, s.slots.userName.value);
  // They gave the address in their message but it didn't make it into the draft.
  if (!d.to) d.to = lastUserText(s).match(/[^\s@<>(),;:]+@[^\s@<>(),;:]+\.[a-z]{2,}/i)?.[0] ?? "";
  if (d.to && !EMAIL_RE.test(d.to)) return `error: "${d.to}" isn't an email address. ask them for it, or save with an empty "to"`;
  // Connected or not, the draft always shows as one clean message in the chat.
  const access: GmailAccess = s.slots.gmail.status === "filled" ? await gmailAccess(s) : { error: "" };
  let id: string | undefined;
  let where: string;
  if ("token" in access) {
    const r = await saveDraft(access.token, d, s.draft && !s.draft.sent ? s.draft.id : undefined);
    if (r.ok) {
      id = r.value.id;
      where = "saved in their gmail drafts and shown in the chat";
    } else where = `shown in the chat, but NOT saved in gmail: ${scopeError(r.reason, "save the draft").replace(/^error: /, "")}`;
  } else if ("demo" in access) where = "shown in the chat (demo account, not a real gmail)";
  else if (s.slots.gmail.status !== "filled") where = "shown in the chat only: gmail isn't connected, so it isn't saved there and can't be sent yet. if they want it sent, they need to connect gmail first (one tap on the connect card, or offer the link)";
  else where = `shown in the chat only. ${access.error.replace(/^error: /, "")}`;
  const shown = msg("agent", "text", `to: ${d.to || "(who's it going to?)"}\nsubject: ${d.subject || "(no subject)"}\n\n${d.body}`);
  ctx.newMessages.push(shown);
  s.transcript.push(shown);
  ctx.shownDraft = shown.text;
  s.draft = { id, ...d, shownAt: s.transcript.length };
  return `${where}. don't repeat the draft. ask if they want to send it${d.to ? "" : " (and who to)"} or change anything. never say it was sent`;
}

async function sendEmailTool(ctx: Ctx): Promise<string> {
  const { s } = ctx;
  const d = s.draft;
  if (!d || d.sent) return "error: there's no draft to send. write it with save_draft first and let them read it";
  if (!d.to) return "error: the draft has no recipient. ask who it goes to, then save_draft again with it";
  // Their ok has to come after they saw this exact version, and be a clear yes.
  const lastUserIdx = s.transcript.findLastIndex((m) => m.role === "user");
  const last = lastUserText(s);
  const prevAgent = s.transcript.slice(0, lastUserIdx).reverse().find((m) => m.role === "agent" && (!m.kind || m.kind === "text"));
  const sayingSend = /\bsend\b/i.test(last) || (!!prevAgent && /\bsend\b/i.test(prevAgent.text));
  if (lastUserIdx < d.shownAt || !SEND_OK.test(last) || SEND_HOLD.test(last) || !sayingSend) {
    return `error: they haven't clearly said to send this version (they said "${last.slice(0, 60)}"). ask "want me to send it to ${d.to}?" and wait`;
  }
  if (s.slots.gmail.status !== "filled") {
    return "error: NOT sent, gmail isn't connected yet. say plainly it hasn't been sent, and that as soon as they tap the \"connect your google account\" card you'll send it (offer the link if there's no card)";
  }
  const access = await gmailAccess(s);
  if ("error" in access) return access.error;
  if ("demo" in access) {
    if (process.env.ALLOW_TEST_EVENTS !== "1") return "error: this is a demo account, so nothing can really be sent. tell them honestly; the draft is in the chat to copy";
  } else {
    // Written before gmail was connected: save it there now, then send.
    if (!d.id) {
      const saved = await saveDraft(access.token, d);
      if (!saved.ok) return scopeError(saved.reason, "send it");
      d.id = saved.value.id;
    }
    const r = await sendDraft(access.token, d.id);
    if (!r.ok) return scopeError(r.reason, "send it");
  }
  d.sent = true;
  ctx.sentEmail = true;
  return `sent to ${d.to}. tell them in a few words`;
}

// They named the assistant inside a longer message ("call you nova, can you check my email?").
// Answer the name first, with the contact card, before the link or the rest of the reply.
const NAME_HINT = /\b(call (you|yourself)|your name('?s| is| will be)|name you|i'?ll call you|you'?re|you are|go by)\b/i;
async function nameFirst(s: Session, channel: Channel, text: string, heard: ReturnType<typeof extract>): Promise<{ msgs: Msg[]; note: string } | null> {
  if (channel !== "text" || s.call.active || s.slots.agentName.status !== "missing") return null;
  if (s.lastAskedSlot !== "agentName" && !NAME_HINT.test(text)) return null;
  const e = await heard.catch(() => null);
  const value = e?.agentName?.trim().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  if (!value || value.length > 30) return null;
  const ctx: Ctx = { s, channel, actions: [], newMessages: [] };
  if ((await runTool(ctx, "set_slot", { slot: "agentName", value })).startsWith("error")) return null;
  await Promise.all(ctx.pending ?? []);
  const ack = msg("agent", "text", `${nameAck(value)} here's my contact card so you know it's me.`);
  s.transcript.push(ack);
  const msgs = [ack];
  if (ctx.newCard) {
    s.transcript.push(ctx.newCard);
    msgs.push(ctx.newCard);
  }
  return { msgs, note: `You just said "${value} it is" and sent your contact card. Don't mention your name, the contact card, or saving it again this turn. Answer the rest of their message; if there is nothing else, just greet them by name if they gave one.` };
}

// A bare "send it" (not "send me the link"), and "did you send it?".
const SEND_CMD = /^\s*(ok(ay)?,? |yes,? |yeah,? |yep,? )?(please )?(send|send it|send that|send the (email|draft|message)|send it now|go ahead and send( it)?|ship it)( now| please)?[.! ]*$/i;
const SENT_Q = /\b(did (u|you) (send|sent)|was it sent|is it sent|has it (been )?sent|did it (go|send))\b/i;

// They're going off to do something and will come back ("i'll let you know once it's connected").
const WAITING_ON_THEM = /\b(i'?ll (let you know|check (back )?(in )?with you|get back to you|tell you|be right back)|once (it'?s|that'?s|i'?m|i've) (connected|done|set up|signed in|finished)|as soon as (it'?s|that'?s|i'?m) (connected|done|set up))\b/i;

// A reply is at most a few texts: a long list stays together in the last bubble instead of arriving
// as a dozen separate messages.
function capBubbles(bubbles: string[], max: number) {
  return bubbles.length <= max ? bubbles : [...bubbles.slice(0, max - 1), bubbles.slice(max - 1).join("\n\n")];
}

// The model has no clock: without this it guessed "january 2025" for today's date.
export function nowLine(tz?: string, now = new Date()) {
  const fmt = (zone: string) =>
    now.toLocaleString("en-US", { timeZone: zone, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `NOW: ${fmt("UTC")} UTC${tz ? `; their local time: ${fmt(tz)} (${tz})` : ""}. Use this for any question about today's date, the day, or the time anywhere (convert time zones from it); never guess the date.`;
}

// The legal page, not the gmail link.
const TERMS_LINK = /\b(terms|tos|legal|privacy( policy)?|policy|t&c|conditions)\b[^.?!]{0,30}\b(link|page|again|send|text)\b|\b(link|send|text)\b[^.?!]{0,30}\b(terms|tos|legal|privacy( policy)?|t&c)\b/i;

// Asking for (or pushing) the gmail connection again.
const GMAIL_ASKISH = /\b(connect|hook up|link|sign in)\b[^.?!]{0,40}\b(gmail|google|email|inbox)\b|\b(gmail|google) (link|card)\b|\bwant me to (text|send) you (a|the) link\b/i;
// The connect link went out and hasn't failed or been used yet: it's in their texts.
export function linkPending(s: Session) {
  if (s.slots.gmail.status !== "missing") return false;
  const lastLink = s.transcript.map((m) => m.kind).lastIndexOf("gmail_link");
  const lastFail = s.transcript.findLastIndex((m) => m.kind === "event" && /^Gmail connection/.test(m.text));
  return lastLink >= 0 && lastLink > lastFail;
}

// A standing "no calls" ("i hate phone calls", "text only"), whenever it's said.
const NO_CALLS = /\b(don'?t|do not|dont|pls don'?t|please don'?t|never) (call|ring|phone)( me)?\b|\b(didn'?t|did not|don'?t|do not) want (you|u) to (call|ring|phone)\b|\bno (phone )?calls?\b|\bhate (phone )?calls\b|\b(text|texting) only\b|\bonly text\b|\bnot a phone person\b|\brather (just )?text\b/i;

// Naming it something rude is usually a poke: take it with a laugh instead of cheerfully missing it.
const INSULT_NAME = /^(ugly|idiot|stupid|dumb|dummy|loser|trash|garbage|moron|clown|useless|lame|jerk|butthead|poopy?|bitch|asshole|dumbass)$/i;
function nameAck(name: string) {
  return INSULT_NAME.test(name.trim()) ? `ouch, ${name.toLowerCase()}? harsh, but i'll wear it. ${name} it is.` : `${name} it is.`;
}

// Left on read over text: first double text after about 45s (client timer), a lighter one minutes later, then quiet.
export const MAX_IDLE_NUDGES = 2;
const IDLE_MIN_MS = 20000;
const IDLE_INSTRUCTION =
  "They haven't answered your last text for a bit (left on read). Send ONE short, relaxed double text, like a friend who doesn't take it personally. Don't repeat or rephrase your last question and don't say \"just checking in\" or \"are you there\". Either suggest one concrete, easy next thing tied to what they told you, leading with what it gets them (a few words, no explanation), or make a light joke about the silence and leave the door open. No guilt, no pitch, no list.";
// Double texts sent since their last message (a two-bubble nudge counts once).
export function countNudges(msgs: Msg[]) {
  const isNudge = (m?: Msg) => m?.move?.id === "nudge" || m?.move?.id === "default-name";
  return msgs.filter((m, i) => isNudge(m) && !(isNudge(msgs[i - 1]) && m.ts - msgs[i - 1].ts < 5000)).length;
}
const SKIPPED_NAME = "hey, looks like you skipped my name. i'll go by persona for now, you can rename me anytime";

// They didn't pick a name: go by "Persona" (a default they can change with one text) instead of stalling on it.
function defaultAgentName(s: Session) {
  s.slots.agentName = { ...s.slots.agentName, value: "Persona", status: "filled", source: "text", updatedAt: Date.now() };
  s.agentNameDefaulted = true;
  if (s.lastAskedSlot === "agentName") s.lastAskedSlot = undefined;
}
