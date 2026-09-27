// One small LLM surface, two providers. Gemini is the default when its key is set;
// Anthropic is used when asked for (LLM_PROVIDER=anthropic), per call (via: "anthropic", for the
// harness grader), or as a fallback when Gemini is rate limited or down (LLM_FALLBACK=anthropic).
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, HarmBlockThreshold, HarmCategory, ThinkingLevel, type Content, type Part as GPart, type SafetySetting, type ThinkingConfig } from "@google/genai";
import { recordUsage } from "./usage";

export type Part = { type: "text"; text: string } | { type: "image"; mime: string; data: string };
export interface Turn {
  role: "user" | "assistant";
  parts: Part[];
}
export interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}
export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

const hasGemini = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
const hasAnthropic = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
export const provider: "gemini" | "anthropic" | null =
  process.env.LLM_PROVIDER === "anthropic" && hasAnthropic ? "anthropic" : hasGemini ? "gemini" : hasAnthropic ? "anthropic" : null;

const MODELS = {
  gemini: { agent: process.env.GEMINI_MODEL ?? "gemini-3.5-flash", fast: process.env.GEMINI_FAST_MODEL ?? "gemini-3.5-flash-lite" },
  anthropic: { agent: process.env.AGENT_MODEL ?? "claude-sonnet-5", fast: process.env.FAST_MODEL ?? "claude-haiku-4-5" },
};
export const models = () => (provider ? MODELS[provider] : MODELS.gemini);

const gemini = provider === "gemini" ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY }) : null;
const anthropicClient = hasAnthropic ? new Anthropic() : null;
const anthropic = provider === "anthropic" ? anthropicClient : null;
const fallback = process.env.LLM_FALLBACK === "anthropic" ? anthropicClient : null;
type Via = "anthropic" | undefined;

// Default filters block ordinary swearing ("this is fucking annoying"), which left the user with
// silence. Only block clearly severe content; the prompt handles tone.
const SAFETY: SafetySetting[] = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// Gemini sometimes answers 503 "high demand" or 429. Retry briefly, then drop to the lighter
// model, so a busy moment never turns into silence for the user.
type GenParams = Parameters<GoogleGenAI["models"]["generateContent"]>[0];
async function geminiCall(params: GenParams) {
  const models = [params.model, MODELS.gemini.fast].filter((m, i, a) => a.indexOf(m) === i);
  let last: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await gemini!.models.generateContent({ ...params, model });
      } catch (err) {
        last = err;
        const status = (err as { status?: number }).status;
        if (status !== 503 && status !== 429 && status !== 500) throw err;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  throw last;
}

// Gemini 3 takes a level; 2.5 takes a token budget (0 = off on flash models).
// Chat replies use the lightest thinking by default: it's a conversation, and speed is part of feeling human.
const AGENT_THINKING = process.env.GEMINI_AGENT_THINKING === "low" ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL;
function thinking(model: string, deep: boolean): ThinkingConfig {
  if (model.startsWith("gemini-3")) return { thinkingLevel: deep ? AGENT_THINKING : ThinkingLevel.MINIMAL };
  return { thinkingBudget: deep ? 512 : 0 };
}

function geminiContents(turns: Turn[]): Content[] {
  return turns.map((t) => ({
    role: t.role === "user" ? "user" : "model",
    parts: t.parts.map((p): GPart => (p.type === "text" ? { text: p.text } : { inlineData: { mimeType: p.mime, data: p.data } })),
  }));
}

async function geminiUsage(model: string, tag: string, u?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number }) {
  if (!u) return;
  const cached = u.cachedContentTokenCount ?? 0;
  await recordUsage(model, tag, {
    input: (u.promptTokenCount ?? 0) - cached,
    cacheRead: cached,
    output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
  });
}

async function anthropicUsage(model: string, tag: string, u: Anthropic.Usage) {
  await recordUsage(model, tag, {
    input: u.input_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    output: u.output_tokens,
  });
}

export interface LoopOpts {
  system: string; // stable, cacheable
  state: string; // per-turn
  turns: Turn[];
  tools: ToolDef[];
  maxRounds: number;
}

type LoopResult = { text: string; refused?: boolean };
type Exec = (c: ToolCall) => Promise<string>;

// Model/tool loop. Stops after the first round that produced text (more rounds only add
// filler) unless a tool errored and the model needs to see why.
export async function runToolLoop(o: LoopOpts, exec: Exec): Promise<LoopResult> {
  if (gemini) {
    try {
      return await geminiLoop(o, exec);
    } catch (err) {
      // Quota or outage: a paid fallback keeps the conversation going, only if explicitly enabled.
      if (!fallback) throw err;
      console.error("gemini failed, falling back to anthropic:", String((err as Error).message ?? err).slice(0, 120));
      return anthropicLoop(fallback, o, exec);
    }
  }
  if (anthropic) return anthropicLoop(anthropic, o, exec);
  return { text: "" };
}

function collector() {
  let text = "";
  return {
    add: (t: string) => {
      if (t.trim()) text += (text ? "\n\n" : "") + t.trim();
    },
    get: () => text,
  };
}

async function geminiLoop(o: LoopOpts, exec: Exec): Promise<LoopResult> {
  const out = collector();
  const model = MODELS.gemini.agent;
  const contents = geminiContents(o.turns);
  for (let round = 0; round < o.maxRounds; round++) {
    const res = await geminiCall({
      model,
      contents,
      config: {
        systemInstruction: `${o.system}\n\nSTATE (from the system, not the user):\n${o.state}`,
        tools: [{ functionDeclarations: o.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.schema })) }],
        thinkingConfig: thinking(model, true),
        safetySettings: SAFETY,
        // Replies are a few short bubbles; a low cap also bounds runaway repetition.
        maxOutputTokens: 1200,
      },
    });
    void geminiUsage(model, "agent", res.usageMetadata);
    if (res.promptFeedback?.blockReason) return { text: "", refused: true };
    const content = res.candidates?.[0]?.content;
    out.add((content?.parts ?? []).filter((p) => p.text && !p.thought).map((p) => p.text).join(""));
    const calls = res.functionCalls ?? [];
    if (!content || calls.length === 0) break;
    const results = await Promise.all(calls.map((c) => exec({ name: c.name ?? "", input: (c.args ?? {}) as Record<string, unknown> })));
    const failed = results.some((x) => x.startsWith("error"));
    // Send the model's own content back untouched: it carries the thought signatures.
    contents.push(content, {
      role: "user",
      parts: calls.map((c, i) => ({ functionResponse: { id: c.id, name: c.name, response: results[i].startsWith("error") ? { error: results[i] } : { output: results[i] } } })),
    });
    if (out.get() && !failed) break;
  }
  return { text: out.get() };
}

async function anthropicLoop(client: Anthropic, o: LoopOpts, exec: Exec): Promise<LoopResult> {
  const out = collector();
  const model = MODELS.anthropic.agent;
  const messages: Anthropic.MessageParam[] = o.turns.map((t) => ({
    role: t.role,
    content: t.parts.map((p): Anthropic.ContentBlockParam =>
      p.type === "text" ? { type: "text", text: p.text } : { type: "image", source: { type: "base64", media_type: p.mime as "image/png", data: p.data } },
    ),
  }));
  for (let round = 0; round < o.maxRounds; round++) {
    const response = await client.messages.create({
      model,
      max_tokens: 4000,
      output_config: { effort: "low" },
      system: [
        { type: "text", text: o.system, cache_control: { type: "ephemeral" } },
        { type: "text", text: `STATE (from the system, not the user):\n${o.state}` },
      ],
      tools: o.tools.map((t) => ({ name: t.name, description: t.description, strict: true, input_schema: t.schema as Anthropic.Tool.InputSchema })),
      messages,
    });
    void anthropicUsage(model, "agent", response.usage);
    if (response.stop_reason === "refusal") return { text: "", refused: true };
    out.add(response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n\n"));
    const uses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || uses.length === 0) break;
    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      const r = await exec({ name: u.name, input: (u.input ?? {}) as Record<string, unknown> });
      results.push({ type: "tool_result", tool_use_id: u.id, content: r, is_error: r.startsWith("error") });
    }
    if (out.get() && !results.some((r) => r.is_error)) break;
    messages.push({ role: "user", content: results });
  }
  return { text: out.get() };
}

const claudeFor = (via: Via) => (via === "anthropic" ? anthropicClient : anthropic);

// One-shot plain text (classifiers, simulated users).
export async function quick(o: { system: string; user: string; maxTokens: number; tag: string; model?: string; via?: Via }): Promise<string> {
  const claude = claudeFor(o.via);
  if (gemini && !(o.via === "anthropic" && claude)) {
    const model = o.model ?? MODELS.gemini.fast;
    const res = await geminiCall({
      model,
      contents: o.user,
      config: { systemInstruction: o.system, maxOutputTokens: o.maxTokens, thinkingConfig: thinking(model, false) },
    });
    await geminiUsage(model, o.tag, res.usageMetadata);
    return (res.text ?? "").trim();
  }
  if (claude) {
    const model = MODELS.anthropic.fast;
    const r = await claude.messages.create({ model, max_tokens: o.maxTokens, system: o.system, messages: [{ role: "user", content: o.user }] });
    await anthropicUsage(model, o.tag, r.usage);
    return (r.content.find((b) => b.type === "text")?.text ?? "").trim();
  }
  return "";
}

// One-shot structured output against a JSON schema.
export async function json<T>(o: { system: string; user: string; schema: Record<string, unknown>; tag: string; via?: Via; fast?: boolean }): Promise<T> {
  const claude = claudeFor(o.via);
  if (gemini && !(o.via === "anthropic" && claude)) {
    const model = o.fast ? MODELS.gemini.fast : MODELS.gemini.agent;
    const res = await geminiCall({
      model,
      contents: o.user,
      config: { systemInstruction: o.system, responseMimeType: "application/json", responseJsonSchema: o.schema, thinkingConfig: thinking(model, !o.fast) },
    });
    await geminiUsage(model, o.tag, res.usageMetadata);
    return JSON.parse(res.text ?? "{}") as T;
  }
  if (claude) {
    const model = o.fast ? MODELS.anthropic.fast : MODELS.anthropic.agent;
    const r = await claude.messages.create({
      model,
      max_tokens: 1500,
      output_config: { effort: "low", format: { type: "json_schema", schema: o.schema } },
      system: o.system,
      messages: [{ role: "user", content: o.user }],
    });
    await anthropicUsage(model, o.tag, r.usage);
    return JSON.parse(r.content.find((b) => b.type === "text")?.text ?? "{}") as T;
  }
  throw new Error("no LLM key configured");
}
