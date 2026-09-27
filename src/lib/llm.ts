// One small LLM surface, two providers. Gemini is the default when its key is set;
// Anthropic stays wired for later (LLM_PROVIDER=anthropic).
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, ThinkingLevel, type Content, type Part as GPart, type ThinkingConfig } from "@google/genai";
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
const anthropic = provider === "anthropic" ? new Anthropic() : null;

// Gemini 3 takes a level; 2.5 takes a token budget (0 = off on flash models).
function thinking(model: string, deep: boolean): ThinkingConfig {
  if (model.startsWith("gemini-3")) return { thinkingLevel: deep ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL };
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

// Model/tool loop. Stops after the first round that produced text (more rounds only add
// filler) unless a tool errored and the model needs to see why.
export async function runToolLoop(o: LoopOpts, exec: (c: ToolCall) => Promise<string>): Promise<{ text: string; refused?: boolean }> {
  let finalText = "";
  const add = (t: string) => {
    if (t.trim()) finalText += (finalText ? "\n\n" : "") + t.trim();
  };

  if (gemini) {
    const model = MODELS.gemini.agent;
    const contents = geminiContents(o.turns);
    for (let round = 0; round < o.maxRounds; round++) {
      const res = await gemini.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: `${o.system}\n\nSTATE (from the system, not the user):\n${o.state}`,
          tools: [{ functionDeclarations: o.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.schema })) }],
          thinkingConfig: thinking(model, true),
          // Replies are a few short bubbles; a low cap also bounds runaway repetition.
          maxOutputTokens: 1200,
        },
      });
      void geminiUsage(model, "agent", res.usageMetadata);
      if (res.promptFeedback?.blockReason) return { text: "", refused: true };
      const content = res.candidates?.[0]?.content;
      add((content?.parts ?? []).filter((p) => p.text && !p.thought).map((p) => p.text).join(""));
      const calls = res.functionCalls ?? [];
      if (!content || calls.length === 0) break;
      const outs = await Promise.all(calls.map((c) => exec({ name: c.name ?? "", input: (c.args ?? {}) as Record<string, unknown> })));
      const failed = outs.some((x) => x.startsWith("error"));
      // Send the model's own content back untouched: it carries the thought signatures.
      contents.push(content, {
        role: "user",
        parts: calls.map((c, i) => ({ functionResponse: { id: c.id, name: c.name, response: failed && outs[i].startsWith("error") ? { error: outs[i] } : { output: outs[i] } } })),
      });
      if (finalText && !failed) break;
    }
    return { text: finalText };
  }

  if (anthropic) {
    const model = MODELS.anthropic.agent;
    const messages: Anthropic.MessageParam[] = o.turns.map((t) => ({
      role: t.role,
      content: t.parts.map((p): Anthropic.ContentBlockParam =>
        p.type === "text" ? { type: "text", text: p.text } : { type: "image", source: { type: "base64", media_type: p.mime as "image/png", data: p.data } },
      ),
    }));
    for (let round = 0; round < o.maxRounds; round++) {
      const response = await anthropic.messages.create({
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
      add(response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n\n"));
      const uses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || uses.length === 0) break;
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const u of uses) {
        const out = await exec({ name: u.name, input: (u.input ?? {}) as Record<string, unknown> });
        results.push({ type: "tool_result", tool_use_id: u.id, content: out, is_error: out.startsWith("error") });
      }
      if (finalText && !results.some((r) => r.is_error)) break;
      messages.push({ role: "user", content: results });
    }
    return { text: finalText };
  }

  return { text: finalText };
}

// One-shot plain text (classifiers, simulated users).
export async function quick(o: { system: string; user: string; maxTokens: number; tag: string; model?: string }): Promise<string> {
  if (gemini) {
    const model = o.model ?? MODELS.gemini.fast;
    const res = await gemini.models.generateContent({
      model,
      contents: o.user,
      config: { systemInstruction: o.system, maxOutputTokens: o.maxTokens, thinkingConfig: thinking(model, false) },
    });
    await geminiUsage(model, o.tag, res.usageMetadata);
    return (res.text ?? "").trim();
  }
  if (anthropic) {
    const model = o.model ?? MODELS.anthropic.fast;
    const r = await anthropic.messages.create({ model, max_tokens: o.maxTokens, system: o.system, messages: [{ role: "user", content: o.user }] });
    await anthropicUsage(model, o.tag, r.usage);
    return (r.content.find((b) => b.type === "text")?.text ?? "").trim();
  }
  return "";
}

// One-shot structured output against a JSON schema.
export async function json<T>(o: { system: string; user: string; schema: Record<string, unknown>; tag: string }): Promise<T> {
  if (gemini) {
    const model = MODELS.gemini.agent;
    const res = await gemini.models.generateContent({
      model,
      contents: o.user,
      config: { systemInstruction: o.system, responseMimeType: "application/json", responseJsonSchema: o.schema, thinkingConfig: thinking(model, true) },
    });
    await geminiUsage(model, o.tag, res.usageMetadata);
    return JSON.parse(res.text ?? "{}") as T;
  }
  if (anthropic) {
    const model = MODELS.anthropic.agent;
    const r = await anthropic.messages.create({
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
