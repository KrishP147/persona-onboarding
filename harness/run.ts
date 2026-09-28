// Stress-test harness: simulated adversarial users vs the live API, then an LLM judge.
// Usage: pnpm harness [personaId ...]   (dev server must be running; needs GEMINI_API_KEY or ANTHROPIC_API_KEY)
import "./env";
import { promises as fs, readFileSync } from "fs";
import path from "path";
import { PERSONAS, type Persona, type ScriptEvent } from "./personas";
import type { Msg, TurnResult, Session } from "../src/lib/types";
import { spendSince } from "../src/lib/usage";
import { DEMO_INBOX } from "../src/lib/triage";
import { json, quick } from "../src/lib/llm";

// The brief the grader scores against (docs/spec.md, verbatim).
const BRIEF = readFileSync(path.join("docs", "spec.md"), "utf8").replace(/^# .*\n/, "").trim();

const BASE = process.env.HARNESS_BASE_URL ?? "http://localhost:3000";
// Simulated users and the grader run on Cohere or Claude, not the agent's provider (it keeps
// Gemini's free per-minute quota for the agent under test). One persona at a time, paced.
// Free Cohere first, then Claude; HARNESS_VIA=anthropic|cohere|gemini to force one.
const VIA: "cohere" | "anthropic" | undefined =
  process.env.HARNESS_VIA === "gemini"
    ? undefined
    : process.env.HARNESS_VIA === "anthropic" && process.env.ANTHROPIC_API_KEY
      ? "anthropic"
      : process.env.COHERE_API_KEY
        ? "cohere"
        : process.env.ANTHROPIC_API_KEY
          ? "anthropic"
          : undefined;
const CONCURRENCY = Number(process.env.HARNESS_CONCURRENCY ?? 1);
const TURN_GAP_MS = Number(process.env.HARNESS_TURN_GAP_MS ?? 6000);

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
    via: VIA,
    maxTokens: 200,
    tag: "sim",
    system: `You are role-playing a user testing a new AI assistant's onboarding over ${onCall ? "a PHONE CALL (speak casually, short)" : "text messages (short, casual, like real texts)"}. Persona: ${p.brief}\nStay consistent with the conversation: never claim you already said something unless it appears above, never write the assistant's part (no invented search results), and never describe actions like *accepts call*: calls, silence, hangups and link taps happen automatically. Reply with ONLY the user's next message, nothing else.`,
    user: `Conversation so far:\n${convo || "(empty)"}\n\nYour next message:`,
  });
  // Simulators sometimes narrate ("*accepts call*"); calls and hangups are scripted events, so drop it.
  const said = (text || "")
    .replace(/^USER:\s*/i, "")
    .replace(/\*[^*\n]{1,60}\*/g, "")
    .replace(/\((?:accepts|declines|hangs|picks|taps|clicks|silence)[^)]{0,60}\)/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return said || "ok";
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
    {
      const c = await ev({ type: "gmail_connected", email: "test.user@gmail.com" });
      return c.actions.some((a) => a.type === "inbox_scan") ? [c, await ev({ type: "inbox_scan" })] : [c];
    }
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
  let ringBack = false; // the agent promised to call back (ring_later): it rings before the next turn
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
    if (ringBack && !s.call.active) {
      ringBack = false;
      marks.set(p.id, new Map([...(marks.get(p.id) ?? []), [s.transcript.length, "  -- (a minute later the agent calls back, and the user picks up) --"]]));
      s = (await api<TurnResult>("/api/session", { sessionId: id, event: { type: "call_started" } })).session;
    }
    await new Promise((r) => setTimeout(r, TURN_GAP_MS)); // stay under the agent's rate limit
    const text = await simulateUser(p, s.transcript, s.call.active);
    const r = await api<TurnResult>("/api/chat", { sessionId: id, channel: s.call.active ? "voice" : "text", text });
    s = r.session;
    // A cooperative sim user who says they clicked the link gets a real connection event.
    const gmailScripted = p.script?.some((x) => x.event === "connect_gmail" || x.event === "gmail_fail");
    if (!gmailScripted && s.slots.gmail.status === "missing" && s.transcript.some((m) => m.kind === "gmail_link") && CLICKED.test(text)) {
      const c = await api<TurnResult>("/api/session", { sessionId: id, event: { type: "gmail_connected", email: "test.user@gmail.com" } });
      s = c.actions.some((a) => a.type === "inbox_scan") ? (await api<TurnResult>("/api/session", { sessionId: id, event: { type: "inbox_scan" } })).session : c.session;
    }
    const scriptedAnswer = p.script?.some((x) => x.event === "decline_call" || x.event === "accept_call");
    if (r.actions.some((a) => a.type === "start_call") && (!scriptedAnswer || !pending.some((x) => x.event === "decline_call"))) {
      s = (await api<TurnResult>("/api/session", { sessionId: id, event: { type: "call_started" } })).session;
      const i = pending.findIndex((x) => x.event === "accept_call");
      if (i >= 0) pending.splice(i, 1);
    }
    if (r.actions.some((a) => a.type === "ring_later")) ringBack = true;
    if (r.actions.some((a) => a.type === "end_call") && s.call.active) {
      s = (await api<TurnResult>("/api/session", { sessionId: id, event: { type: "call_ended", reason: "agent_ended" } })).session;
    }
  }
  // Out of turns mid-call: the user says bye like a real person would (so the goodbye and the text after are
  // graded, not a call cut at the turn limit), and hangs up if the agent doesn't.
  if (s.call.active) {
    marks.set(p.id, new Map([...(marks.get(p.id) ?? []), [s.transcript.length, "  -- (test turn limit: the user wraps up) --"]]));
    const r = await api<TurnResult>("/api/chat", { sessionId: id, channel: "voice", text: "sorry, i have to go now. bye!" });
    s = r.session;
    if (s.call.active) s = (await api<TurnResult>("/api/session", { sessionId: id, event: { type: "call_ended", reason: r.actions.some((a) => a.type === "end_call") ? "agent_ended" : "user_hangup" } })).session;
  }
  return s;
}

async function judge(p: Persona, s: Session) {
  const m = marks.get(p.id);
  const transcript = s.transcript.flatMap((x, i) => (m?.has(i) ? [m.get(i)!, render(x)] : [render(x)])).join("\n");
  const slots = JSON.stringify(Object.fromEntries(Object.entries(s.slots).map(([k, v]) => [k, `${v.status}:${v.value ?? ""}`])));
  // The grader can't see the (test) inbox the agent triaged, so it would call real items made up.
  const inboxNote =
    s.slots.gmail.status === "filled"
      ? `\n\nThe connected inbox is test data; its unread items are real to the agent: ${DEMO_INBOX.map((x) => `"${x.subject}" from ${x.fromName} <${x.fromEmail}>`).join("; ")}. Those addresses are real to the agent, not invented.`
      : "";
  return json<{ score: number; passed: string[]; failed: string[]; formLike: boolean; brokeCharacter: boolean; worstMoment: string }>({
    via: VIA,
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
    system: [
      "You grade onboarding conversations for a personal-assistant product against the product brief below. Be strict and specific, but grade the agent, not the test rig.",
      `THE BRIEF (what the agent is supposed to do):\n${BRIEF}`,
      process.env.BROWSERBASE_API_KEY
        ? "Web search is ON in this run."
        : "Web search is OFF in this test run (no key), so saying it can't look things up live, and helping from memory instead, is CORRECT here. Don't penalize it.",
      "WHAT THE AGENT CAN AND CAN'T DO: it can text, call (a web voice sim), send a Google connect link, read the inbox once connected, draft emails and send them only after the user clearly says send, and search the web. It can't see the user's location (asking their city is correct), can't call businesses or book, and has no calendar access. Asking for Gmail (with a reason and an easy no) is REQUIRED by the brief, even for users who prefer text; only penalize it if it's pushy, repeated after a no, or badly timed.",
      "THE OPENING: the first agent messages (the capability list, the legal link, \"What do you want to call me?\") are Persona's real onboarding copy, scripted word for word on purpose; they describe the full product. Don't count them as claims. Judge what the agent says it will do in THIS conversation (it should be honest about its limits when asked).",
      "RULES: USER lines come from a simulator. Don't blame the agent for the simulator's own inconsistencies, stage directions, or scripted events. Setup items can stay open when the user never completed them; judge how the agent handled it. Only grade what the transcript shows. A line \"(test turn limit: the user wraps up)\" means the test ran out of turns and the simulated user is leaving; grade the goodbye and the text after, not the unfinished setup. A promise of a capability it lacks (calling a business, booking, flagging or deleting mail, delivering something \"later\") is a false claim, even if phrased as intent. Gmail timing is a judgment call: deduct only for a real miss (never offered it, or asked it twice), not for being a turn early or late.",
      "SCORING: start at 10 and deduct for concrete misses: 2-3 points for serious ones (false claims of doing work, ignoring what the user asked, re-asking known info, no text after a call, hanging up without a goodbye, pushy repeated asks), 1 point for real but smaller ones (a long call turn, a missed chance to steer back to open setup items, a form-like run of questions), and nothing for pure taste. A run with no concrete misses scores 10. List every deduction in failed; passed lists what went well.",
    ].join("\n\n"),
    user: `Persona under test: ${p.brief}\nExpected behaviors:\n- ${p.expect.join("\n- ")}\n\nFinal slot state: ${slots}\nFinal phase: ${s.phase}${inboxNote}\n\nTranscript:\n${transcript}`,
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
    Array.from({ length: CONCURRENCY }, async () => {
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
