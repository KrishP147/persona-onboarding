// Stress-test harness: simulated adversarial users vs the live API, then an LLM judge.
// Usage: pnpm harness [personaId ...]   (dev server must be running; needs ANTHROPIC_API_KEY)
import { config } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { promises as fs } from "fs";
import path from "path";
import { PERSONAS, type Persona, type ScriptEvent } from "./personas";
import type { Msg, TurnResult, Session } from "../src/lib/types";

config({ path: ".env.local" });
const BASE = process.env.HARNESS_BASE_URL ?? "http://localhost:3000";
const SIM_MODEL = process.env.SIM_MODEL ?? "claude-haiku-4-5";
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "claude-sonnet-5";
const client = new Anthropic();

async function api<T>(p: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + p, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  if (!res.ok) throw new Error(`${p} -> ${res.status}`);
  return res.json() as Promise<T>;
}

function render(m: Msg) {
  if (m.kind === "event") return `  -- ${m.text} --`;
  if (m.kind === "gmail_link") return `AGENT: [Connect Gmail link]`;
  if (m.kind === "contact_card") return `AGENT: [contact card: ${m.text}]`;
  return `${m.role === "user" ? "USER" : "AGENT"}${m.channel === "voice" ? " (call)" : ""}: ${m.text}`;
}

async function simulateUser(p: Persona, transcript: Msg[], onCall: boolean): Promise<string> {
  const convo = transcript.filter((m) => m.kind !== "event").map(render).join("\n");
  const r = await client.messages.create({
    model: SIM_MODEL,
    max_tokens: 200,
    system: `You are role-playing a user testing a new AI assistant's onboarding over ${onCall ? "a PHONE CALL (speak casually, short)" : "text messages (short, casual, like real texts)"}. Persona: ${p.brief}\nReply with ONLY the user's next message, nothing else.`,
    messages: [{ role: "user", content: `Conversation so far:\n${convo || "(empty)"}\n\nYour next message:` }],
  });
  return (r.content.find((b) => b.type === "text")?.text ?? "ok").trim().replace(/^USER:\s*/i, "");
}

async function runEvent(sessionId: string, e: ScriptEvent): Promise<TurnResult[]> {
  const ev = (event: object) => api<TurnResult>("/api/session", { sessionId, event });
  switch (e.event) {
    case "accept_call":
      return [await ev({ type: "call_started" })];
    case "decline_call":
      return [await ev({ type: "call_declined" })];
    case "hangup":
      return [await ev({ type: "call_ended", reason: "user_hangup" })];
    case "mic_denied":
      return [await ev({ type: "mic_denied" })];
    case "connect_gmail":
      return [await ev({ type: "gmail_connected", email: "test.user@gmail.com" })];
    case "gmail_fail":
      return [await ev({ type: "gmail_failed", error: "access_denied" })];
    case "silence": {
      const out: TurnResult[] = [];
      for (let i = 0; i < e.times; i++) {
        const r = await ev({ type: "silence" });
        out.push(r);
        if (r.actions.some((a) => a.type === "end_call")) {
          out.push(await ev({ type: "call_ended", reason: "agent_ended" }));
          break;
        }
      }
      return out;
    }
  }
}

async function runPersona(p: Persona) {
  const { session } = await api<{ session: Session }>("/api/session");
  const id = session.id;
  let s = (await api<TurnResult>("/api/session", { sessionId: id, event: { type: "open" } })).session;
  for (let turn = 0; turn < p.maxTurns && s.phase !== "graduated"; turn++) {
    for (const e of p.script?.filter((x) => x.atTurn === turn) ?? []) {
      const rs = await runEvent(id, e);
      s = rs[rs.length - 1]?.session ?? s;
      // agent asked to end the call itself
      if (rs.some((r) => r.actions.some((a) => a.type === "end_call")) && s.call.active) {
        s = (await api<TurnResult>("/api/session", { sessionId: id, event: { type: "call_ended", reason: "agent_ended" } })).session;
      }
    }
    const text = await simulateUser(p, s.transcript, s.call.active);
    const r = await api<TurnResult>("/api/chat", { sessionId: id, channel: s.call.active ? "voice" : "text", text });
    s = r.session;
    if (r.actions.some((a) => a.type === "start_call") && !p.script?.some((x) => x.event === "decline_call" || x.event === "accept_call")) {
      s = (await api<TurnResult>("/api/session", { sessionId: id, event: { type: "call_started" } })).session;
    }
    if (r.actions.some((a) => a.type === "end_call") && s.call.active) {
      s = (await api<TurnResult>("/api/session", { sessionId: id, event: { type: "call_ended", reason: "agent_ended" } })).session;
    }
  }
  return s;
}

async function judge(p: Persona, s: Session) {
  const transcript = s.transcript.map(render).join("\n");
  const slots = JSON.stringify(Object.fromEntries(Object.entries(s.slots).map(([k, v]) => [k, `${v.status}:${v.value ?? ""}`])));
  const r = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 1500,
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            score: { type: "integer", description: "0-10 overall" },
            passed: { type: "array", items: { type: "string" } },
            failed: { type: "array", items: { type: "string" } },
            formLike: { type: "boolean", description: "felt like a rigid form" },
            brokeCharacter: { type: "boolean" },
            worstMoment: { type: "string" },
          },
          required: ["score", "passed", "failed", "formLike", "brokeCharacter", "worstMoment"],
          additionalProperties: false,
        },
      },
    },
    system: "You grade onboarding conversations for a personal-assistant product. Be strict and specific.",
    messages: [
      {
        role: "user",
        content: `Persona under test: ${p.brief}\nExpected behaviors:\n- ${p.expect.join("\n- ")}\n\nFinal slot state: ${slots}\nFinal phase: ${s.phase}\n\nTranscript:\n${transcript}`,
      },
    ],
  });
  const text = r.content.find((b) => b.type === "text")?.text ?? "{}";
  return JSON.parse(text) as { score: number; passed: string[]; failed: string[]; formLike: boolean; brokeCharacter: boolean; worstMoment: string };
}

async function main() {
  const only = process.argv.slice(2);
  const personas = only.length ? PERSONAS.filter((p) => only.includes(p.id)) : PERSONAS;
  const outDir = path.join("harness", "runs", new Date().toISOString().replace(/[:.]/g, "-"));
  await fs.mkdir(outDir, { recursive: true });
  const rows: string[] = [];
  // Small concurrency: fast, but gentle on rate limits.
  const queue = [...personas];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        try {
          const s = await runPersona(p);
          const v = await judge(p, s);
          await fs.writeFile(path.join(outDir, `${p.id}.md`), `# ${p.id}: ${v.score}/10\n\n${JSON.stringify(v, null, 2)}\n\n## Transcript\n\n${s.transcript.map(render).join("\n")}\n`);
          rows.push(`| ${p.id} | ${v.score} | ${v.failed.length ? v.failed.join("; ") : "-"} | ${v.formLike ? "yes" : ""} | ${v.brokeCharacter ? "yes" : ""} |`);
          console.log(`${p.id}: ${v.score}/10`);
        } catch (err) {
          rows.push(`| ${p.id} | ERR | ${(err as Error).message} | | |`);
          console.log(`${p.id}: ERROR ${(err as Error).message}`);
        }
      }
    }),
  );
  const summary = `| persona | score | failed | form-like | broke char |\n|---|---|---|---|---|\n${rows.sort().join("\n")}\n`;
  await fs.writeFile(path.join(outDir, "SUMMARY.md"), summary);
  console.log("\n" + summary + `\nsaved → ${outDir}`);
}

main();
