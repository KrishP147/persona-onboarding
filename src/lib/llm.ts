// One small LLM surface, two providers. Gemini is the default when its key is set;
// Anthropic is used when asked for (LLM_PROVIDER=anthropic), per call (via: "anthropic", for the
// harness grader), or as a fallback when Gemini is rate limited or down (LLM_FALLBACK=anthropic).
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, HarmBlockThreshold, HarmCategory, ThinkingLevel, type Content, type Part as GPart, type SafetySetting, type ThinkingConfig } from "@google/genai";
import { recordUsage } from "./usage";
import { addFloat, getFloat, incrDaily, incrTotal } from "./store";
import { costOf } from "./usage";

// Hard dollar cap on Claude, shared across every server instance. When it's spent, calls stop
// (the conversation falls back to its scripted lines) instead of running up a bill.
const CLAUDE_BUDGET_USD = Number(process.env.CLAUDE_BUDGET_USD ?? 1.75);
async function assertClaudeBudget() {
  const spent = await getFloat("claude-spend").catch(() => 0);
  if (spent >= CLAUDE_BUDGET_USD) throw new Error(`claude budget used ($${spent.toFixed(2)} of $${CLAUDE_BUDGET_USD})`);
}
// Haiku 4.5 doesn't take the effort setting; newer models do.
const effortFor = (model: string) => (model.includes("haiku") ? {} : { effort: "low" as const });

// Paid fallback budget: at most this many Claude turns per day, counted across all instances.
const FALLBACK_DAILY_TURNS = Number(process.env.LLM_FALLBACK_DAILY_TURNS ?? 60);
// ...and a lifetime cap, so the total spend is bounded no matter how many days it runs.
const FALLBACK_TOTAL_TURNS = Number(process.env.LLM_FALLBACK_TOTAL_TURNS ?? 120);

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
  gemini: { agent: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite", fast: process.env.GEMINI_FAST_MODEL ?? "gemini-3.5-flash-lite" },
  anthropic: { agent: process.env.AGENT_MODEL ?? "claude-sonnet-5", fast: process.env.FAST_MODEL ?? "claude-haiku-4-5" },
};
export const models = () => (provider ? MODELS[provider] : MODELS.gemini);

// Local dev and test runs use a key from a separate Google project (its own free quota), so testing
// can never use up the live demo's quota. Production only ever sees GEMINI_API_KEY.
const geminiKey = (process.env.NODE_ENV !== "production" && process.env.GEMINI_API_KEY_TWO) || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const gemini = provider === "gemini" ? new GoogleGenAI({ apiKey: geminiKey }) : null;
// Cloudflare Workers AI: a free daily allowance, used as the second tier when gemini is out.
// Any OpenAI-style chat completions endpoint (cloudflare workers ai, cohere's compatibility api).
type Oai = { name: string; url: string; token: string; model: string };
const CF: Oai | null =
  process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID
    ? {
        name: "cloudflare",
        url: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
        token: process.env.CLOUDFLARE_API_TOKEN,
        model: process.env.CLOUDFLARE_MODEL ?? "@cf/meta/llama-4-scout-17b-16e-instruct",
      }
    : null;
// Local test runs only (LLM_TEST_VIA=cohere): the agent runs on cohere's free trial key, so testing
// never touches the demo's quotas or costs anything. Never used in production.
const TEST_COHERE: Oai | null =
  process.env.NODE_ENV !== "production" && process.env.LLM_TEST_VIA === "cohere" && process.env.COHERE_API_KEY
    ? { name: "cohere", url: "https://api.cohere.ai/compatibility/v1/chat/completions", token: process.env.COHERE_API_KEY, model: process.env.COHERE_MODEL ?? "command-a-03-2025" }
    : null;
const anthropicClient = hasAnthropic ? new Anthropic() : null;
const anthropic = provider === "anthropic" ? anthropicClient : null;
const fallback = process.env.LLM_FALLBACK === "anthropic" ? anthropicClient : null;
type Via = "anthropic" | "cohere" | undefined;

// Default filters block ordinary swearing ("this is fucking annoying"), which left the user with
// silence. Only block clearly severe content; the prompt handles tone.
const SAFETY: SafetySetting[] = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// Free-tier quotas are per model (some only 20 requests a day), so the agent walks a chain of
// models: fast ones first, slower ones as a last resort. A model that says it's out of quota is
// skipped until it's likely back (a minute for per-minute limits, an hour for daily ones), so a
// spent model never adds delay. 503 "high demand" gets one quick retry.
type GenParams = Parameters<GoogleGenAI["models"]["generateContent"]>[0];
const AGENT_CHAIN = (process.env.GEMINI_AGENT_CHAIN ?? "gemini-3.5-flash-lite,gemini-2.5-flash,gemini-3.5-flash,gemini-flash-latest").split(",");
const FAST_CHAIN = (process.env.GEMINI_FAST_CHAIN ?? "gemini-3.5-flash-lite").split(",");
const coolUntil = new Map<string, number>();

async function geminiCall(params: GenParams, opts: { chain: string[]; deep: boolean }) {
  const chain = opts.chain.filter((m) => (coolUntil.get(m) ?? 0) < Date.now());
  let last: unknown = new Error("all gemini models are cooling down");
  for (const model of chain) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await gemini!.models.generateContent({
          ...params,
          model,
          config: { ...params.config, thinkingConfig: thinking(model, opts.deep), httpOptions: { timeout: 15000 } },
        });
        return { res, model };
      } catch (err) {
        last = err;
        const status = (err as { status?: number }).status;
        const msg = String((err as Error).message ?? "");
        if (status === 429) {
          coolUntil.set(model, Date.now() + (/PerDay/i.test(msg) ? 60 * 60e3 : 60e3));
          break; // next model
        }
        if (status === 400) break; // e.g. a setting this model doesn't support: try the next one
        if (status !== 503 && status !== 500) throw err;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
      }
    }
  }
  throw last;
}

// Thinking settings differ by model family: 2.5 takes a token budget (0 = off), 3.x takes a level,
// and some 3.x models don't accept MINIMAL. Chat wants the lightest setting: speed is part of feeling human.
function thinking(model: string, deep: boolean): ThinkingConfig {
  // With thinking fully off, 2.5 flash drifted (tool names as text, offering a call mid-call); a small budget fixes it.
  if (model.startsWith("gemini-2")) return { thinkingBudget: deep ? Number(process.env.GEMINI_THINKING_BUDGET ?? 384) : 0 };
  if (/latest|3\.8/.test(model)) return { thinkingLevel: ThinkingLevel.LOW };
  return { thinkingLevel: deep && process.env.GEMINI_AGENT_THINKING === "low" ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL };
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
  const cost = costOf(model, { input: u.input_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, output: u.output_tokens });
  // Recorded first: its turn-meter update is synchronous, and the agent loop doesn't await this.
  const rec = recordUsage(model, tag, {
    input: u.input_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    output: u.output_tokens,
  });
  await addFloat("claude-spend", cost).catch(() => {});
  await rec;
}

export interface LoopOpts {
  system: string; // stable, cacheable
  state: string; // per-turn
  turns: Turn[];
  tools: ToolDef[];
  maxRounds: number;
  // Tools whose results the model must see before replying: text written alongside them
  // ("let me check") is dropped and the loop goes another round.
  lookup?: Set<string>;
}

type LoopResult = { text: string; refused?: boolean };
type Exec = (c: ToolCall) => Promise<string>;

// Model/tool loop. Stops after the first round that produced text (more rounds only add
// filler) unless a tool errored and the model needs to see why.
export async function runToolLoop(o: LoopOpts, exec: Exec): Promise<LoopResult> {
  if (TEST_COHERE) return oaiLoop(TEST_COHERE, o, exec);
  if (gemini) {
    try {
      return await geminiLoop(o, exec);
    } catch (geminiErr) {
      let err = geminiErr;
      // Second tier, still free: cloudflare workers ai.
      if (CF) {
        try {
          return await oaiLoop(CF, o, exec);
        } catch (cfErr) {
          console.error("cloudflare failed:", String((cfErr as Error).message ?? cfErr).slice(0, 160));
          err = cfErr;
        }
      }
      // Last resort: a paid fallback keeps the conversation going, only if explicitly enabled,
      // and only within a small daily budget so a busy day can't run up a bill.
      if (!fallback) throw err;
      if ((await incrDaily("anthropic-fallback").catch(() => Infinity)) > FALLBACK_DAILY_TURNS) throw err;
      if ((await incrTotal("anthropic-fallback").catch(() => Infinity)) > FALLBACK_TOTAL_TURNS) throw err;
      console.error("gemini failed, falling back to anthropic:", String((err as Error).message ?? err).slice(0, 120));
      return anthropicLoop(fallback, o, exec);
    }
  }
  if (anthropic) return anthropicLoop(anthropic, o, exec);
  return { text: "" };
}

// Gemini can return a reply in several text parts; gluing them blindly gave "sage it is.since...".
function joinParts(parts: string[]) {
  return parts.reduce((acc, p) => (acc && /[.!?,]$/.test(acc) && /^\S/.test(p) ? `${acc} ${p}` : acc + p), "");
}

// OpenAI-style chat completions on Cloudflare Workers AI, with the same tool loop rules.
type CfMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

async function oaiLoop(api: Oai, o: LoopOpts, exec: Exec): Promise<LoopResult> {
  const out = collector();
  const messages: CfMessage[] = [
    { role: "system", content: `${o.system}\n\nSTATE (from the system, not the user):\n${o.state}` },
    ...o.turns.map((t): CfMessage => {
      const text = t.parts.map((p) => (p.type === "text" ? p.text : "[they sent a photo]")).join("\n");
      return t.role === "user" ? { role: "user", content: text } : { role: "assistant", content: text };
    }),
  ];
  const tools = o.tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.schema } }));
  for (let round = 0; round < o.maxRounds; round++) {
    const res = await fetch(api.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${api.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: api.model, messages, tools, max_tokens: 600 }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`${api.name} ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string | object } }[] } }[] };
    const m = data.choices?.[0]?.message;
    const roundText = (m?.content ?? "").trim();
    const calls = m?.tool_calls ?? [];
    if (calls.length === 0) {
      out.add(roundText);
      break;
    }
    const results: string[] = [];
    for (const c of calls) {
      let input: Record<string, unknown> = {};
      try {
        input = typeof c.function.arguments === "string" ? JSON.parse(c.function.arguments || "{}") : (c.function.arguments as Record<string, unknown>);
      } catch {
        input = {};
      }
      results.push(await exec({ name: c.function.name, input }));
    }
    const failed = results.some((r) => r.startsWith("error")) || calls.some((c) => o.lookup?.has(c.function.name));
    if (!failed) out.add(roundText);
    messages.push({
      role: "assistant",
      content: roundText || null,
      tool_calls: calls.map((c) => ({ id: c.id, type: "function", function: { name: c.function.name, arguments: typeof c.function.arguments === "string" ? c.function.arguments : JSON.stringify(c.function.arguments) } })),
    });
    calls.forEach((c, i) => messages.push({ role: "tool", tool_call_id: c.id, content: results[i] }));
    if (out.get() && !failed) break;
  }
  return { text: out.get() };
}

// One-shot text or JSON on cloudflare, for background helpers when gemini is out.
async function cloudflareOnce(cf: Oai, system: string, user: string, maxTokens: number, schema?: Record<string, unknown>): Promise<string> {
  const res = await fetch(cf.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cf.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cf.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
      ...(schema ? { response_format: { type: "json_schema", json_schema: { name: "out", schema } } } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`cloudflare ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  return (data.choices?.[0]?.message?.content ?? "").trim();
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
  const contents = geminiContents(o.turns);
  // Later rounds stay on whichever model answered first (tool results and signatures belong to it).
  let chain = MODELS.gemini.agent === AGENT_CHAIN[0] ? AGENT_CHAIN : [MODELS.gemini.agent, ...AGENT_CHAIN];
  for (let round = 0; round < o.maxRounds; round++) {
    const { res, model } = await geminiCall(
      {
        model: chain[0],
        contents,
        config: {
          systemInstruction: `${o.system}\n\nSTATE (from the system, not the user):\n${o.state}`,
          tools: [{ functionDeclarations: o.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.schema })) }],
          safetySettings: SAFETY,
          // Replies are a few short bubbles; a low cap also bounds runaway repetition.
          maxOutputTokens: 1200,
        },
      },
      { chain, deep: true },
    );
    chain = [model, ...chain.filter((m) => m !== model)];
    void geminiUsage(model, "agent", res.usageMetadata);
    if (res.promptFeedback?.blockReason) return { text: "", refused: true };
    const content = res.candidates?.[0]?.content;
    const roundText = joinParts((content?.parts ?? []).filter((p) => p.text && !p.thought).map((p) => p.text!));
    const calls = res.functionCalls ?? [];
    if (!content || calls.length === 0) {
      out.add(roundText);
      break;
    }
    const results = await Promise.all(calls.map((c) => exec({ name: c.name ?? "", input: (c.args ?? {}) as Record<string, unknown> })));
    const failed = results.some((x) => x.startsWith("error")) || calls.some((c) => o.lookup?.has(c.name ?? ""));
    // Words written alongside a tool that failed ("calling you now!" + a refused call) don't go out;
    // the next round, which sees the error, writes the reply instead.
    if (!failed) out.add(roundText);
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
    await assertClaudeBudget();
    const response = await client.messages.create(
      {
      model,
      max_tokens: 4000,
      output_config: effortFor(model),
      system: [
        { type: "text", text: o.system, cache_control: { type: "ephemeral" } },
        { type: "text", text: `STATE (from the system, not the user):\n${o.state}` },
      ],
      tools: o.tools.map((t) => ({ name: t.name, description: t.description, strict: true, input_schema: t.schema as Anthropic.Tool.InputSchema })),
      messages,
      },
      { timeout: 20000 },
    );
    void anthropicUsage(model, "agent", response.usage);
    if (response.stop_reason === "refusal") return { text: "", refused: true };
    const roundText = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n\n");
    const uses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || uses.length === 0) {
      out.add(roundText);
      break;
    }
    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      const r = await exec({ name: u.name, input: (u.input ?? {}) as Record<string, unknown> });
      results.push({ type: "tool_result", tool_use_id: u.id, content: r, is_error: r.startsWith("error") });
    }
    const wait = results.some((r) => r.is_error) || uses.some((u) => o.lookup?.has(u.name));
    if (!wait) out.add(roundText);
    if (out.get() && !wait) break;
    messages.push({ role: "user", content: results });
  }
  return { text: out.get() };
}

const claudeFor = (via: Via) => (via === "anthropic" ? anthropicClient : anthropic);

// Cohere (free trial key): used for testing only, as the harness's simulated users and grader.
// Trial keys are rate limited and not meant for production traffic, so the demo never uses it.
const COHERE_MODEL = process.env.COHERE_MODEL ?? "command-a-03-2025";
async function cohereChat(system: string, user: string, maxTokens: number, schema?: Record<string, unknown>): Promise<string> {
  const body = {
    model: COHERE_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: maxTokens,
    ...(schema ? { response_format: { type: "json_object", json_schema: schema } } : {}),
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("https://api.cohere.com/v2/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.COHERE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 4000 * (attempt + 1))); // trial keys allow ~20 calls a minute
      continue;
    }
    if (!res.ok) throw new Error(`cohere ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { message?: { content?: { type: string; text?: string }[] } };
    return (data.message?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
  }
  throw new Error("cohere rate limited");
}

// One-shot plain text (classifiers, simulated users).
export async function quick(o: { system: string; user: string; maxTokens: number; tag: string; model?: string; via?: Via }): Promise<string> {
  if ((o.via === "cohere" || TEST_COHERE) && process.env.COHERE_API_KEY) return cohereChat(o.system, o.user, o.maxTokens);
  const claude = claudeFor(o.via);
  if (gemini && !(o.via === "anthropic" && claude)) {
    const chain = o.model ? [o.model] : FAST_CHAIN;
    try {
      const { res, model } = await geminiCall({ model: chain[0], contents: o.user, config: { systemInstruction: o.system, maxOutputTokens: o.maxTokens } }, { chain, deep: false });
      await geminiUsage(model, o.tag, res.usageMetadata);
      return (res.text ?? "").trim();
    } catch (err) {
      if (!CF) throw err;
      return cloudflareOnce(CF, o.system, o.user, o.maxTokens);
    }
  }
  if (claude) {
    const model = MODELS.anthropic.fast;
    await assertClaudeBudget();
    const r = await claude.messages.create({ model, max_tokens: o.maxTokens, system: o.system, messages: [{ role: "user", content: o.user }] });
    await anthropicUsage(model, o.tag, r.usage);
    return (r.content.find((b) => b.type === "text")?.text ?? "").trim();
  }
  return "";
}

// One-shot structured output against a JSON schema.
export async function json<T>(o: { system: string; user: string; schema: Record<string, unknown>; tag: string; via?: Via; fast?: boolean }): Promise<T> {
  if ((o.via === "cohere" || TEST_COHERE) && process.env.COHERE_API_KEY) return JSON.parse((await cohereChat(o.system, o.user, 1500, o.schema)) || "{}") as T;
  const claude = claudeFor(o.via);
  if (gemini && !(o.via === "anthropic" && claude)) {
    // Background helpers (fast) only use the light model's quota, never the agent's.
    const chain = o.fast ? FAST_CHAIN : AGENT_CHAIN;
    try {
      const { res, model } = await geminiCall(
        { model: chain[0], contents: o.user, config: { systemInstruction: o.system, responseMimeType: "application/json", responseJsonSchema: o.schema } },
        { chain, deep: !o.fast },
      );
      await geminiUsage(model, o.tag, res.usageMetadata);
      return JSON.parse(res.text ?? "{}") as T;
    } catch (err) {
      if (!CF) throw err;
      return JSON.parse((await cloudflareOnce(CF, o.system, o.user, 800, o.schema)) || "{}") as T;
    }
  }
  if (claude) {
    const model = o.fast ? MODELS.anthropic.fast : MODELS.anthropic.agent;
    await assertClaudeBudget();
    const r = await claude.messages.create({
      model,
      max_tokens: 1500,
      output_config: { ...effortFor(model), format: { type: "json_schema", schema: o.schema } },
      system: o.system,
      messages: [{ role: "user", content: o.user }],
    });
    await anthropicUsage(model, o.tag, r.usage);
    return JSON.parse(r.content.find((b) => b.type === "text")?.text ?? "{}") as T;
  }
  throw new Error("no LLM key configured");
}
