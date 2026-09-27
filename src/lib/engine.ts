import Anthropic from "@anthropic-ai/sdk";
import { nanoid } from "nanoid";
import type { Attachment, Channel, ClientAction, Msg, Session, SlotKey, TurnResult, VoiceStyle } from "./types";
import { computeDirective, directiveText, recordAsk, MAX_SILENCE_STRIKES } from "./policy";
import { RECAP_INSTRUCTION, SYSTEM_PROMPT } from "./prompt";
import { mockReply } from "./mock";

const MODEL = process.env.AGENT_MODEL ?? "claude-sonnet-5";
const FAST_MODEL = process.env.FAST_MODEL ?? "claude-haiku-4-5";
const MAX_TOOL_ROUNDS = 3;
const HISTORY_LIMIT = 40;

const client = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? new Anthropic() : null;
export const usingMock = () => client === null;

const SETTABLE = ["agentName", "userName", "helpNeed"] as const;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "set_slot",
    description: "Record or update something you learned: your own name (agentName), what to call the user (userName), or what they want help with (helpNeed).",
    strict: true,
    input_schema: {
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
    strict: true,
    input_schema: {
      type: "object",
      properties: { slot: { type: "string", enum: [...SETTABLE, "gmail"] } },
      required: ["slot"],
      additionalProperties: false,
    },
  },
  {
    name: "offer_call",
    description: "You are proposing a quick call in this message. Shows 'Call me' / 'Text is fine' buttons.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "start_call",
    description: "Ring the user now. Only after they agreed to a call.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "send_gmail_link",
    description: "Drop a secure 'Connect Gmail' link into the text thread. Works during a call.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "end_call",
    description: "Hang up after saying goodbye on the call.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "graduate",
    description: "User is ready for the full assistant (they know what they need or asked to skip). Remaining items get deferred.",
    strict: true,
    input_schema: {
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

function toApiMessages(s: Session): Anthropic.MessageParam[] {
  const convo = s.transcript.filter((m) => m.role !== "event" && m.kind !== "contact_card").slice(-HISTORY_LIMIT);
  const lastUserIdx = convo.map((m) => m.role).lastIndexOf("user");
  const out: Anthropic.MessageParam[] = [];
  convo.forEach((m, i) => {
    const role = m.role === "user" ? "user" : "assistant";
    const prefix = m.channel === "voice" ? "(on call) " : "";
    let text = m.kind === "gmail_link" ? "[sent the Connect Gmail link]" : prefix + m.text;
    if (m.attachments?.length) text += "\n" + m.attachments.map(attachmentText).join("\n");
    const blocks: Anthropic.ContentBlockParam[] = [];
    // Only the latest user message carries actual image pixels; older ones use the summary.
    if (i === lastUserIdx) {
      for (const a of m.attachments ?? []) {
        const match = a.kind === "image" && a.dataUrl?.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/);
        if (match) blocks.push({ type: "image", source: { type: "base64", media_type: match[1] as "image/png", data: match[2] } });
      }
    }
    blocks.push({ type: "text", text: text || "(empty)" });
    const prev = out[out.length - 1];
    if (prev && prev.role === role && Array.isArray(prev.content)) prev.content.push(...blocks);
    else out.push({ role, content: blocks });
  });
  if (out.length === 0 || out[0].role !== "user") out.unshift({ role: "user", content: "(user opened the chat)" });
  // API needs a final user turn; if the agent spoke last (e.g. event-triggered turn), add a nudge.
  if (out[out.length - 1].role !== "user") out.push({ role: "user", content: "(no new message from the user)" });
  return out;
}

async function classifyVoice(name: string): Promise<VoiceStyle> {
  if (!client) return "neutral";
  try {
    const r = await client.messages.create({
      model: FAST_MODEL,
      max_tokens: 5,
      system: "Classify how a name is most commonly perceived for picking a TTS voice. Answer with exactly one word: feminine, masculine, or neutral. Ambiguous, unisex, invented, or object names are neutral.",
      messages: [{ role: "user", content: name.slice(0, 60) }],
    });
    const t = r.content.find((b) => b.type === "text")?.text.trim().toLowerCase() ?? "";
    return t.startsWith("fem") ? "feminine" : t.startsWith("masc") ? "masculine" : "neutral";
  } catch {
    return "neutral";
  }
}

export interface Ctx {
  s: Session;
  channel: Channel;
  actions: ClientAction[];
  newMessages: Msg[];
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
        s.voice = await classifyVoice(value);
        // One contact card per session, updated in place (client upserts by id): no duplicates on rename.
        let card = s.transcript.find((m) => m.kind === "contact_card");
        if (card) card.text = value;
        else {
          card = msg("agent", "text", value, { kind: "contact_card" });
          s.transcript.push(card);
        }
        ctx.newMessages.push(card);
        return `saved. voice set to ${s.voice}.${renamed ? " contact card updated in place." : ""}`;
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
      s.callOffers += 1;
      if (s.phase === "intro") s.phase = "call_offered";
      return "call buttons shown";
    case "start_call":
      if (s.call.active) return "already on a call";
      ctx.actions.push({ type: "start_call" });
      return "ringing the user";
    case "send_gmail_link": {
      if (s.slots.gmail.status === "filled") return `already connected as ${s.gmailEmail}`;
      const link = msg("agent", "text", "Connect your Google account", { kind: "gmail_link" });
      ctx.newMessages.push(link);
      s.transcript.push(link);
      return "link sent to their texts";
    }
    case "end_call":
      if (!s.call.active) return "not on a call";
      ctx.actions.push({ type: "end_call" });
      return "hanging up after this message";
    case "graduate":
      s.phase = "graduated";
      s.graduatedReason = String(input.reason ?? "");
      for (const k of Object.keys(s.slots) as SlotKey[]) if (s.slots[k].status === "missing") s.slots[k].status = "deferred";
      ctx.actions.push({ type: "graduate" });
      return "graduated; you're now the full assistant";
    default:
      return `error: unknown tool ${name}`;
  }
}

async function generate(ctx: Ctx, extraInstruction?: string): Promise<string> {
  const { s, channel } = ctx;
  if (!client) return mockReply(ctx, runTool);

  const messages = toApiMessages(s);
  let finalText = "";
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const d = computeDirective(s, channel);
    const state = directiveText(s, d, channel) + (extraInstruction ? `\n\nINSTRUCTION: ${extraInstruction}` : "");
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low" },
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: `STATE (from the system, not the user):\n${state}` },
      ],
      tools: TOOLS,
      messages,
    });
    if (response.stop_reason === "refusal") return "hmm, i can't help with that one. anything else on your mind?";
    const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n\n");
    if (text.trim()) finalText += (finalText ? "\n\n" : "") + text.trim();
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;
    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const t of toolUses) {
      const out = await runTool(ctx, t.name, (t.input ?? {}) as Record<string, unknown>);
      results.push({ type: "tool_result", tool_use_id: t.id, content: out, is_error: out.startsWith("error") });
    }
    messages.push({ role: "user", content: results });
  }
  return finalText;
}

function emitAgentText(ctx: Ctx, text: string) {
  const bubbles = ctx.channel === "voice" ? [text.replace(/\n+/g, " ").trim()] : text.split(/\n\s*\n/).map((b) => b.trim());
  for (const b of bubbles.filter(Boolean)) {
    const m = msg("agent", ctx.channel, b);
    ctx.newMessages.push(m);
    ctx.s.transcript.push(m);
  }
  if (ctx.channel === "voice" && text.trim()) ctx.actions.push({ type: "speak", text: text.replace(/\n+/g, " ").trim() });
}

async function turn(s: Session, channel: Channel, extraInstruction?: string): Promise<TurnResult> {
  const ctx: Ctx = { s, channel, actions: [], newMessages: [] };
  const text = await generate(ctx, extraInstruction);
  const after = computeDirective(s, channel);
  recordAsk(s, text.includes("?") && after.mayAsk ? after.nextSlot : null);
  emitAgentText(ctx, text);
  const final = computeDirective(s, channel);
  return { session: s, newMessages: ctx.newMessages, chips: final.chips, actions: ctx.actions };
}

export async function handleUserMessage(s: Session, channel: Channel, text: string, attachments?: Attachment[]): Promise<TurnResult> {
  const clean = text.slice(0, 4000);
  const userMsg = msg("user", channel, clean, attachments?.length ? { attachments } : {});
  s.transcript.push(userMsg);
  if (channel === "voice") s.call.silenceStrikes = 0;
  if (/^\s*skip setup\s*$/i.test(clean) && s.phase !== "graduated") {
    return turn(s, channel, "The user tapped 'Skip setup'. Respect it: call graduate, then ask what they want to get done first.");
  }
  const r = await turn(s, channel);
  r.newMessages.unshift(userMsg);
  return r;
}

export type SessionEvent =
  | { type: "open" }
  | { type: "call_started" }
  | { type: "call_declined" }
  | { type: "call_ended"; reason: "user_hangup" | "agent_ended" | "error" }
  | { type: "silence" }
  | { type: "mic_denied" }
  | { type: "gmail_connected"; email: string }
  | { type: "gmail_failed"; error: string };

function eventMsg(s: Session, text: string): Msg {
  const m = msg("event", "text", text, { kind: "event" });
  s.transcript.push(m);
  return m;
}

export async function handleEvent(s: Session, e: SessionEvent): Promise<TurnResult> {
  const idle = (): TurnResult => ({ session: s, newMessages: [], chips: computeDirective(s, "text").chips, actions: [] });
  switch (e.type) {
    case "open":
      if (s.transcript.length > 0) return idle(); // resume after refresh: no duplicate greeting
      return turn(s, "text", "The user just opened the chat for the first time. Introduce yourself in one or two short bubbles, say what you can help with in a line, and ask what they'd like to call you.");
    case "call_started":
      if (s.call.active) return idle();
      s.call = { active: true, startedAt: Date.now(), silenceStrikes: 0 };
      s.phase = "on_call";
      eventMsg(s, "Call started");
      return turn(s, "voice", "The call just connected. Greet them by your name if you have one, and say this will take about a minute.");
    case "call_declined":
      s.call = { ...s.call, active: false, endedReason: "declined" };
      s.callOffers = Math.max(s.callOffers, 1);
      if (s.phase === "call_offered") s.phase = "intro";
      eventMsg(s, "Call declined");
      return turn(s, "text", "The user declined the call. Totally fine: continue over text, no pressure, don't offer the call again this turn.");
    case "call_ended": {
      if (!s.call.active) return idle(); // duplicate hangup events
      s.call = { ...s.call, active: false, endedAt: Date.now(), endedReason: e.reason };
      s.phase = s.phase === "graduated" ? "graduated" : "post_call";
      const secs = Math.round(((s.call.endedAt ?? 0) - (s.call.startedAt ?? 0)) / 1000);
      eventMsg(s, `Call ended (${secs}s)`);
      return turn(s, "text", `${RECAP_INSTRUCTION} Reason: ${e.reason}. Call lasted ${secs}s.`);
    }
    case "silence": {
      if (!s.call.active) return idle();
      s.call.silenceStrikes += 1;
      if (s.call.silenceStrikes >= MAX_SILENCE_STRIKES) {
        const r = await turn(s, "voice", "The user has been silent for a while. Say you'll text them instead, warmly, in one sentence, then call end_call.");
        if (!r.actions.some((a) => a.type === "end_call")) r.actions.push({ type: "end_call" });
        return r;
      }
      return turn(s, "voice", `The user has gone quiet (${s.call.silenceStrikes}x). Check in briefly ("still there?") or rephrase your last question more simply.`);
    }
    case "mic_denied":
      eventMsg(s, "Microphone unavailable");
      s.call = { ...s.call, active: false, endedReason: "error" };
      if (s.phase === "on_call" || s.phase === "call_offered") s.phase = "intro";
      return turn(s, "text", "The call couldn't start because their microphone isn't available. No problem: carry on over text.");
    case "gmail_connected":
      s.slots.gmail = { value: e.email, status: "filled", asks: s.slots.gmail.asks, source: "text", updatedAt: Date.now() };
      s.gmailEmail = e.email;
      eventMsg(s, `Gmail connected: ${e.email}`);
      return turn(s, s.call.active ? "voice" : "text", "Their Gmail just connected. Acknowledge in a few words and, if you know what they need, offer one concrete thing you can now do with their inbox.");
    case "gmail_failed":
      eventMsg(s, "Gmail connection didn't finish");
      return turn(s, s.call.active ? "voice" : "text", `Connecting Gmail didn't complete (${e.error.slice(0, 80)}). Reassure them it's optional and they can retry anytime; don't push.`);
  }
}
