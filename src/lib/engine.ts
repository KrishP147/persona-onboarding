import { nanoid } from "nanoid";
import type { Attachment, Channel, ClientAction, Msg, Session, SlotKey, TurnResult, VoiceStyle } from "./types";
import { computeDirective, directiveText, recordAsk, MAX_SILENCE_STRIKES } from "./policy";
import { RECAP_INSTRUCTION, SYSTEM_PROMPT } from "./prompt";
import { mockReply } from "./mock";
import { provider, quick, runToolLoop, type Part, type ToolDef, type Turn } from "./llm";
import { DEMO_INBOX, recordOutcome, triageInbox } from "./triage";
import { EVENT_MOVES, chooseMove, markUsed } from "./moves";
import { GIF_MIN_GAP, GIF_MOODS, GIFS, gifUrl, type GifMood } from "./gifs";
import { applyExtracted, extract } from "./extract";
import type { Move } from "./types";

const MAX_TOOL_ROUNDS = 3;
const HISTORY_LIMIT = 40;

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
    const prefix = m.channel === "voice" && m.role === "user" ? "(on call) " : "";
    let text = m.kind === "gmail_link" ? "[sent the Connect Gmail link]" : m.kind === "gif" ? "[sent a gif]" : prefix + m.text;
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
  const lastGif = agentMsgs.map((m) => m.kind).lastIndexOf("gif");
  return agentMsgs.length >= 5 && (lastGif < 0 || agentMsgs.length - lastGif >= GIF_MIN_GAP);
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
}

const WANTS_OUT = /\b(skip|not now|later|no more questions|stop asking|just (help|do|get)|let'?s (just )?(start|go)|that'?s (it|all)|i'?m good|enough setup)\b/i;

function lastUserText(s: Session) {
  return [...s.transcript].reverse().find((m) => m.role === "user")?.text ?? "";
}

function userWantsOut(s: Session) {
  return WANTS_OUT.test(lastUserText(s));
}

async function runTool(ctx: Ctx, name: string, input: Record<string, unknown>): Promise<string> {
  const { s } = ctx;
  switch (name) {
    case "set_slot": {
      const slot = input.slot as SlotKey;
      const value = String(input.value ?? "").trim().slice(0, 200);
      if (!SETTABLE.includes(slot as (typeof SETTABLE)[number]) || !value) return "error: invalid slot or empty value";
      const renamed = slot === "agentName" && s.slots.agentName.value && s.slots.agentName.value !== value;
      s.slots[slot] = { ...s.slots[slot], value, status: "filled", source: ctx.channel, updatedAt: Date.now() };
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
      const lastEnd = s.transcript.findLastIndex((m) => m.kind === "event" && /^Call (ended|declined)/.test(m.text));
      const askedSince = s.transcript.slice(lastEnd + 1).some((m) => m.role === "user" && /\b(call|ring|phone)\b/i.test(m.text));
      if (lastEnd >= 0 && s.call.endedReason !== "agent_ended" && !askedSince) return "error: they just declined or hung up. don't call again unless they ask; carry on over text";
      ctx.actions.push({ type: "start_call" });
      return "ringing the user";
    }
    case "send_gmail_link": {
      if (s.slots.gmail.status === "filled") return `already connected as ${s.gmailEmail}`;
      const lastLink = s.transcript.map((m) => m.kind).lastIndexOf("gmail_link");
      const lastFail = s.transcript.findLastIndex((m) => m.kind === "event" && /^Gmail connection/.test(m.text));
      if (lastLink >= 0 && lastLink > lastFail && !ctx.resendOk) return "already sent; it's still in their texts. don't send another, just point to it";
      const link = msg("agent", "text", "Connect your Google account", { kind: "gmail_link" });
      if (ctx.channel === "voice") {
        // On a call the ask still lands in the chat, in writing, right above the link.
        const need = shortNeed(s);
        const ask = msg("agent", "text", `here's the link to connect your gmail${need ? ` so i can help with ${need}` : ""}. it's read only, and i never send anything without asking you first.`);
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
    case "end_call":
      if (!s.call.active) return "not on a call";
      ctx.actions.push({ type: "end_call" });
      return "hanging up after this message";
    case "graduate": {
      const open = (Object.keys(s.slots) as SlotKey[]).filter((k) => s.slots[k].status === "missing");
      if (s.call.active) return "error: say goodbye and end_call first; graduate after the call";
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
  let state = directiveText(s, d, channel);
  if (extraInstruction) state += `\n\nINSTRUCTION: ${extraInstruction}`;
  else {
    // One research-backed move per turn, chosen in code, so the principles actually get applied.
    const move = chooseMove(s, channel, { callFirst: d.callFirst, mayAsk: d.mayAsk });
    markUsed(s, move.id);
    ctx.move = { id: move.id, label: move.label, source: move.source };
    state += `\n\nMOVE THIS TURN (${move.label}): ${move.instruction}`;
  }
  const r = await runToolLoop({ system: SYSTEM_PROMPT, state, turns: toTurns(s), tools: TOOLS, maxRounds: MAX_TOOL_ROUNDS }, (c) => runTool(ctx, c.name, c.input));
  if (r.refused) return "hmm, i can't help with that one. anything else on your mind?";
  return r.text;
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

const GOODBYE = /\b(bye|goodbye|talk (to you )?(soon|later)|take care|catch you|ciao|see ya|i'?ll let you go|call me (back )?(whenever|anytime)|good talking|have a good one)\b/i;
// "i just sent you a link" said without actually sending one.
const CLAIMS_LINK = /\b(sent|dropped|texted|shared|popped)\b[^.?!]{0,40}\blink\b|\blink\b[^.?!]{0,30}\b(your texts|our texts|the chat|the thread)\b/i;

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

function emitAgentText(ctx: Ctx, raw: string) {
  // House style: no em dashes, no stage directions like "(waiting for reply)".
  const text = stopAtRepeat(raw).replace(/\s*[—]\s*/g, ", ").replace(/^\s*\(on call\)\s*/gim, "").replace(/^\s*\*?\([^)]*\)\*?\s*$/gm, "").trim();
  const bubbles = ctx.channel === "voice" ? [text.replace(/\n+/g, " ").trim()] : text.split(/\n\s*\n/).map((b) => b.trim());
  for (const b of bubbles.filter(Boolean)) {
    const m = msg("agent", ctx.channel, b, ctx.move ? { move: ctx.move } : {});
    ctx.newMessages.push(m);
    ctx.s.transcript.push(m);
  }
  if (ctx.channel === "voice" && text.trim()) ctx.actions.push({ type: "speak", text: text.replace(/\n+/g, " ").trim() });
}

async function turn(
  s: Session,
  channel: Channel,
  extraInstruction?: string,
  fallback?: string,
  opts: { forceEnd?: boolean; move?: Move } = {},
): Promise<TurnResult> {
  const resendOk = /\b(resend|send (it|the link) again|another link|new link|lost the link)\b/i.test(lastUserText(s));
  const ctx: Ctx = { s, channel, actions: [], newMessages: [], resendOk, move: opts.move };
  let text = "";
  try {
    text = await generate(ctx, extraInstruction);
  } catch (err) {
    // Provider down or overloaded: fall through to the scripted line rather than go quiet.
    console.error("llm turn failed", err);
  }
  if (!text.trim() && fallback && !ctx.newMessages.some((m) => m.kind === "gif")) text = fallback;
  if (opts.forceEnd && !ctx.actions.some((a) => a.type === "end_call")) ctx.actions.push({ type: "end_call" });
  // Placing a call: the text is just the heads up; the talking happens on the call.
  if (channel === "text" && ctx.actions.some((a) => a.type === "start_call")) {
    text = "calling you now.";
    ctx.move = EVENT_MOVES.callNow;
  }
  if (channel === "voice" && ctx.actions.some((a) => a.type === "end_call") && !GOODBYE.test(text)) {
    text = `${text.trim()} ${goodbyeLine(s)}`.trim();
  }
  // An offer to call made in words counts as an offer (so it isn't repeated next turn).
  if (channel === "text" && !s.call.active && /\b(quick call|give you a (quick )?(call|ring)|hop on a (quick )?call|mind if i call)\b/i.test(text) && !ctx.offeredCall) {
    s.callOffers += 1;
    if (s.phase === "intro") s.phase = "call_offered";
  }
  // Keep words and actions in sync: if it says the link is in their texts, it is.
  if (CLAIMS_LINK.test(text) && s.slots.gmail.status === "missing" && !ctx.newMessages.some((m) => m.kind === "gmail_link")) {
    await runTool(ctx, "send_gmail_link", {});
  }
  const after = computeDirective(s, channel);
  recordAsk(s, text.includes("?") && after.mayAsk ? after.nextSlot : null);
  emitAgentText(ctx, text);
  await Promise.all(ctx.pending ?? []);
  if (ctx.newCard) {
    s.transcript.push(ctx.newCard);
    ctx.newMessages.push(ctx.newCard);
  }
  const final = computeDirective(s, channel);
  return { session: s, newMessages: ctx.newMessages, chips: final.chips, actions: ctx.actions };
}

const NOT_A_NAME = /^(no|nah|nope|idk|i don'?t know|you pick|whatever|skip|why|what|hi|hey|hello|yes|yeah|ok|okay|sure)\b/i;

// Right after the agent asks for its name, a short reply like "Julia" or "call you Max" is the name.
async function captureAgentName(s: Session, channel: Channel, text: string): Promise<{ card?: Msg; pending: Promise<void>[] } | undefined> {
  if (channel !== "text" || s.slots.agentName.status !== "missing" || s.lastAskedSlot !== "agentName") return;
  const m = text.trim().match(/^(?:(?:i'?ll |let'?s |i wanna |i want to )?call (?:you|yourself) |how about |go with |name(?: you)?(?: is)? )?([\p{L}][\p{L}'-]{0,19}(?: [\p{L}][\p{L}'-]{0,19})?)[.!]?$/iu);
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
): Promise<TurnResult> {
  const clean = text.slice(0, 4000);
  // The client shows the message instantly under its own id; reuse it so there's no duplicate.
  const userMsg = msg("user", channel, clean, { ...(attachments?.length ? { attachments } : {}), ...(clientId ? { id: clientId } : {}) });
  s.transcript.push(userMsg);
  recordOutcome(s, clean); // did they act on the last interruption, or wave it off?
  if (channel === "voice") s.call.silenceStrikes = 0;
  // Name reply safety net: models sometimes say "julia it is" without saving it.
  const named = await captureAgentName(s, channel, clean);
  // A second pass reads the message for names, needs and refusals while the reply is written.
  // Pure laughter or thanks, over text, when a gif is allowed: answer with one.
  if (channel === "text" && !s.call.active && (LAUGH.test(clean) || THANKS.test(clean)) && gifAllowed(s)) {
    const gif = makeGif(s, LAUGH.test(clean) ? "lol" : "ok");
    s.transcript.push(gif);
    recordAsk(s, null);
    return { session: s, newMessages: [userMsg, gif], chips: computeDirective(s, channel).chips, actions: [] };
  }
  // They just named the assistant: answer the way persona does, instantly, no model needed.
  if (named?.card && channel === "text" && s.callOffers === 0 && !s.call.active) {
    const name = s.slots.agentName.value!;
    s.callOffers = 1;
    if (s.phase === "intro") s.phase = "call_offered";
    recordAsk(s, null);
    const ctx: Ctx = { s, channel, actions: [], newMessages: [], move: EVENT_MOVES.named };
    emitAgentText(ctx, `${name} it is. save my contact card so you know it's me, and i'll walk you through setup on a quick call.\n\nwant me to call?`);
    s.transcript.push(named.card);
    ctx.newMessages.push(named.card);
    await Promise.all(named.pending);
    return { session: s, newMessages: [userMsg, ...ctx.newMessages], chips: computeDirective(s, channel).chips, actions: [] };
  }
  const heard = extract(s, clean);
  if (/^\s*skip setup\s*$/i.test(clean) && s.phase !== "graduated") {
    return turn(s, channel, "The user tapped 'Skip setup'. Respect it: call graduate, then ask what they want to get done first.");
  }
  const r = await turn(
    s,
    channel,
    interrupted ? "They talked over you mid-sentence. Drop what you were saying and respond to what they just said; don't repeat your cut-off line unless they ask." : undefined,
    channel === "voice" ? "sorry, i missed that. say it one more time?" : "sorry, i lost my train of thought for a sec. can you say that again?",
  );
  r.newMessages.unshift(userMsg);
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
  | { type: "call_started" }
  | { type: "call_declined" }
  | { type: "call_ended"; reason: "user_hangup" | "agent_ended" | "error" }
  | { type: "silence" }
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
      s.call = { active: true, startedAt: Date.now(), silenceStrikes: 0 };
      s.phase = "on_call";
      eventMsg(s, "Call started");
      return turn(
        s,
        "voice",
        "The call just connected. Two short spoken sentences, normal punctuation: a warm hello with your name, then one easy question that picks up where the texts left off (never re-ask anything already known). Like: \"hey, it's julia! what should i call you?\"",
        "hey, it's me. thanks for picking up, this'll only take a minute.",
        { move: EVENT_MOVES.greet },
      );
    case "call_declined":
      s.call = { ...s.call, active: false, endedReason: "declined" };
      s.callOffers = Math.max(s.callOffers, 1);
      if (s.phase === "call_offered") s.phase = "intro";
      eventMsg(s, "Call declined");
      return turn(
        s,
        "text",
        "The user declined the call. Totally fine: one short, easygoing text that you're happy to keep it to texting. No question this time.",
        "no worries, texting works great.",
        { move: EVENT_MOVES.declined },
      );
    case "call_ended": {
      if (!s.call.active) return idle(); // duplicate hangup events
      s.call = { ...s.call, active: false, endedAt: Date.now(), endedReason: e.reason };
      if (s.pendingVoice) {
        s.voice = s.pendingVoice;
        s.pendingVoice = undefined;
      }
      s.phase = s.phase === "graduated" ? "graduated" : "post_call";
      const secs = Math.round(((s.call.endedAt ?? 0) - (s.call.startedAt ?? 0)) / 1000);
      eventMsg(s, `Call ended (${secs}s)`);
      const how =
        e.reason === "agent_ended"
          ? "You ended it after saying goodbye, so don't say you got cut off."
          : e.reason === "user_hangup"
            ? "They hung up (maybe on purpose, maybe not)."
            : "The line dropped on our side.";
      return turn(s, "text", `${RECAP_INSTRUCTION} ${how} Call lasted ${secs}s.`, recapFallback(s, e.reason), { move: EVENT_MOVES.recap });
    }
    case "silence": {
      if (!s.call.active) return idle();
      s.call.silenceStrikes += 1;
      if (s.call.silenceStrikes >= MAX_SILENCE_STRIKES) {
        const r = await turn(
          s,
          "voice",
          "The user has been silent for a while. Say it seems like now isn't a great time, which is totally fine, that you'll text them instead, and say goodbye by name if you know it. Then call end_call.",
          goodbyeLine(s),
          { forceEnd: true, move: EVENT_MOVES.silence },
        );
        return r;
      }
      return turn(
        s,
        "voice",
        s.call.silenceStrikes === 1
          ? `The user has gone quiet. Don't say "still there?". Offer help instead: "take your time. want me to say that again?" or restate your last question more simply.`
          : `Still quiet (${s.call.silenceStrikes}x). Offer an easy out: you can just text them instead if that's easier.`,
        s.call.silenceStrikes === 1 ? "take your time. want me to say that again?" : "no pressure. i can also just text you if that's easier.",
        { move: EVENT_MOVES.silence },
      );
    }
    case "contact_saved":
      // Quiet bookkeeping, no reply: saving a contact isn't something to chat about.
      s.contactSaved = true;
      return idle();
    case "mic_denied":
      eventMsg(s, "Microphone unavailable");
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
