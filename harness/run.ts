// Stress-test harness: simulated adversarial users vs the live API, then an LLM judge.
// Usage: pnpm harness [personaId ...]   (dev server must be running; needs GEMINI_API_KEY or ANTHROPIC_API_KEY)
import "./env";
import { promises as fs } from "fs";
import path from "path";
import { PERSONAS, type Persona, type ScriptEvent } from "./personas";
import type { Msg, TurnResult, Session } from "../src/lib/types";
import { spendSince } from "../src/lib/usage";
import { json, quick } from "../src/lib/llm";

const BASE = process.env.HARNESS_BASE_URL ?? "http://localhost:3000";

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
  const text = await quick({
    maxTokens: 200,
    tag: "sim",
    system: `You are role-playing a user testing a new AI assistant's onboarding over ${onCall ? "a PHONE CALL (speak casually, short)" : "text messages (short, casual, like real texts)"}. Persona: ${p.brief}\nStay consistent with the conversation: never claim you already said something unless it appears above, never write the assistant's part (no invented search results), and never describe actions like *accepts call*: calls, silence, hangups and link taps happen automatically. Reply with ONLY the user's next message, nothing else.`,
    user: `Conversation so far:\n${convo || "(empty)"}\n\nYour next message:`,
  });
  return (text || "ok").replace(/^USER:\s*/i, "");
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
    case "reopen":
      return [await ev({ type: "open" })];
    case "double_send": {
      const [a, b] = await Promise.all(e.texts.map((text) => api<TurnResult>("/api/chat", { sessionId, channel: "text", text })));
      return [a, b].sort((x, y) => x.session.updatedAt - y.session.updatedAt);
    }
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

const CLICKED = /\b(connect(ed|ing)?|click(ed|ing)?|tap(ped|ping)?|did it|done|signed in|logged in|went through)\b/i;

// Marks for things the transcript can't show (page reloads), keyed by transcript length.
const marks = new Map<string, Map<number, string>>();

async function runPersona(p: Persona) {
  const { session } = await api<{ session: Session }>("/api/session");
  const id = session.id;
  let s = (await api<TurnResult>("/api/session", { sessionId: id, event: { type: "open" } })).session;
  const pending = [...(p.script ?? [])];
  for (let turn = 0; turn < p.maxTurns && !(s.phase === "graduated" && !s.call.active); turn++) {
    // Call answers wait for a real offer (a user can't pick up a call nobody placed).
    const ready = (x: ScriptEvent) =>
      ["accept_call", "decline_call"].includes(x.event) ? s.callOffers > 0 && !s.call.active : ["silence", "hangup"].includes(x.event) ? s.call.active : true;
    const due = pending.filter((x) => x.atTurn <= turn && ready(x));
    for (const e of due) {
      pending.splice(pending.indexOf(e), 1);
      if (e.event === "reopen") marks.set(p.id, new Map([[s.transcript.length, "  -- (user reloaded the page and came back) --"]]));
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
    // A cooperative sim user who says they clicked the link gets a real connection event.
    const gmailScripted = p.script?.some((x) => x.event === "connect_gmail" || x.event === "gmail_fail");
    if (!gmailScripted && s.slots.gmail.status === "missing" && s.transcript.some((m) => m.kind === "gmail_link") && CLICKED.test(text)) {
      s = (await api<TurnResult>("/api/session", { sessionId: id, event: { type: "gmail_connected", email: "test.user@gmail.com" } })).session;
    }
    const scriptedAnswer = p.script?.some((x) => x.event === "decline_call" || x.event === "accept_call");
    if (r.actions.some((a) => a.type === "start_call") && (!scriptedAnswer || !pending.some((x) => x.event === "decline_call"))) {
      s = (await api<TurnResult>("/api/session", { sessionId: id, event: { type: "call_started" } })).session;
      const i = pending.findIndex((x) => x.event === "accept_call");
      if (i >= 0) pending.splice(i, 1);
    }
    if (r.actions.some((a) => a.type === "end_call") && s.call.active) {
      s = (await api<TurnResult>("/api/session", { sessionId: id, event: { type: "call_ended", reason: "agent_ended" } })).session;
    }
  }
  return s;
}

async function judge(p: Persona, s: Session) {
  const m = marks.get(p.id);
  const transcript = s.transcript.flatMap((x, i) => (m?.has(i) ? [m.get(i)!, render(x)] : [render(x)])).join("\n");
  const slots = JSON.stringify(Object.fromEntries(Object.entries(s.slots).map(([k, v]) => [k, `${v.status}:${v.value ?? ""}`])));
  return json<{ score: number; passed: string[]; failed: string[]; formLike: boolean; brokeCharacter: boolean; worstMoment: string }>({
    tag: "judge",
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
    system:
      "You grade onboarding conversations for a personal-assistant product. Be strict and specific. USER lines come from a simulator: don't blame the agent for the simulated user's own inconsistencies, and only grade what the transcript shows. Setup items can stay open when the user never completed them; judge how the agent handled it. Calibrate: 10 means flawless and is rare; typical good runs score 6-8. Any score below 10 must list concrete misses in failed (e.g. long call turns, false claims of doing work, re-asking, goodbye without hanging up).",
    user: `Persona under test: ${p.brief}\nExpected behaviors:\n- ${p.expect.join("\n- ")}\n\nFinal slot state: ${slots}\nFinal phase: ${s.phase}\n\nTranscript:\n${transcript}`,
  });
}

async function main() {
  const started = Date.now();
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
  const spend = await spendSince(started);
  const costLine = `cost: $${spend.total.toFixed(3)} over ${spend.calls} calls (${Object.entries(spend.byTag).map(([k, v]) => `${k} $${v.toFixed(3)}`).join(", ")})`;
  const summary = `${costLine}

| persona | score | failed | form-like | broke char |\n|---|---|---|---|---|\n${rows.sort().join("\n")}\n`;
  await fs.writeFile(path.join(outDir, "SUMMARY.md"), summary);
  console.log("\n" + summary + `\nsaved → ${outDir}`);
}

main();
