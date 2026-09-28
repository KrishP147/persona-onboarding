// Real-user onboarding funnel from prod sessions. Run: pnpm -s funnel   (needs UPSTASH_REDIS_REST_URL/TOKEN)
//
// Read-only: KEYS + MGET over upstash rest, never a write, no model calls. Aggregate only: the output
// has counts, percentages and times, never a name, an email address, or a word anyone typed.
// Test traffic is left out: the browser e2e script's fixed opening ("Julia", then "sure, call me").
// (the harness runs against a local dev server with its own in-memory store, so it never shows up here.)
import { writeFileSync } from "node:fs";
import type { Session } from "../src/lib/types";

const GOODBYE = /\b(bye|talk soon|take care|call me (back )?(whenever|anytime))\b/i; // a call the agent closed properly

const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis<T>(cmd: (string | number)[]): Promise<T> {
  const res = await fetch(URL_!, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(cmd) });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  return ((await res.json()) as { result: T }).result;
}

const STEPS = [
  ["opened", "opened the chat"],
  ["engaged", "sent a first text"],
  ["named", "named the assistant (or took the default)"],
  ["offered", "was offered a call"],
  ["called", "took a call"],
  ["userName", "told us their name"],
  ["need", "said what they need help with"],
  ["gmail", "connected gmail (real or demo)"],
  ["done", "finished setup or graduated early"],
] as const;
type Step = (typeof STEPS)[number][0];

interface Row {
  steps: Record<Step, boolean>;
  defaultedName: boolean;
  demoGmail: boolean;
  early: boolean;
  calls: number;
  hangups: number;
  turns: number;
  valueMs: number | null;
  cost: number | null;
}

function isTest(s: Session) {
  const said = s.transcript.filter((m) => m.role === "user").map((m) => m.text.trim().toLowerCase());
  const e2e = said[0] === "julia" && said[1] === "sure, call me";
  return e2e;
}

function measure(s: Session): Row {
  const t = s.transcript;
  const user = t.filter((m) => m.role === "user");
  const events = t.filter((m) => m.kind === "event");
  const calls = events.filter((m) => m.text === "Call started").length;
  const filled = (k: keyof Session["slots"]) => s.slots[k]?.status === "filled";
  const early = s.phase === "graduated" && Object.values(s.slots).some((x) => x.status === "deferred");
  // First useful thing done for them: inbox triage (runs on connect) or a draft shown in the chat.
  const connectedAt = events.find((m) => m.text.startsWith("Gmail connected"))?.ts;
  const draftAt = s.draft ? (t[s.draft.shownAt - 1]?.ts ?? t[s.draft.shownAt]?.ts) : undefined;
  const firstValue = [connectedAt, draftAt].filter((x): x is number => typeof x === "number").sort((a, b) => a - b)[0];
  const start = t[0]?.ts ?? s.createdAt;
  const steps: Record<Step, boolean> = {
    opened: t.length > 0,
    engaged: user.length > 0,
    named: filled("agentName"),
    offered: s.callOffers > 0 || calls > 0,
    called: calls > 0,
    userName: filled("userName"),
    need: filled("helpNeed"),
    gmail: filled("gmail"),
    done: s.phase === "graduated" || Object.values(s.slots).every((x) => x.status !== "missing"),
  };
  // Each step counts only if every step before it happened too (a funnel, not a checklist).
  let ok = true;
  for (const [k] of STEPS) {
    ok = ok && steps[k];
    steps[k] = ok;
  }
  return {
    steps,
    defaultedName: !!s.agentNameDefaulted && s.slots.agentName.value === "Persona",
    demoGmail: s.gmailEmail === "demo.user@gmail.com",
    early,
    calls,
    hangups: t.filter((m, i) => m.kind === "event" && m.text.startsWith("Call ended") && !GOODBYE.test(t.slice(0, i).findLast((x) => x.role === "agent" && x.channel === "voice")?.text ?? "")).length,
    turns: user.length,
    valueMs: firstValue ? firstValue - start : null,
    cost: s.metrics?.cost ?? null,
  };
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "n/a");
const dur = (ms: number | null) => (ms === null ? "n/a" : ms < 60000 ? `${Math.round(ms / 1000)}s` : `${(ms / 60000).toFixed(1)} min`);

async function main() {
  if (!URL_ || !TOKEN) throw new Error("set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN");
  const keys = await redis<string[]>(["KEYS", "session:*"]);
  const sessions: Session[] = [];
  for (let i = 0; i < keys.length; i += 50) {
    const vals = await redis<(string | null)[]>(["MGET", ...keys.slice(i, i + 50)]);
    for (const v of vals) {
      try {
        if (v) sessions.push(JSON.parse(v) as Session);
      } catch {}
    }
  }
  const sinceAt = process.argv.indexOf("--since");
  const since = sinceAt >= 0 ? Date.parse(process.argv[sinceAt + 1] ?? "") : NaN;
  if (sinceAt >= 0 && Number.isNaN(since)) throw new Error("--since needs an iso date, e.g. --since 2026-09-28T12:00:00Z");
  const real = sessions.filter((s) => s.transcript?.length && !isTest(s) && (Number.isNaN(since) || s.createdAt >= since));
  const all = real.map(measure);
  const openedOnly = all.filter((r) => !r.steps.engaged).length;
  // The funnel starts at the first message: a page load alone (a refresh, a link preview) isn't a person trying it.
  const rows = all.filter((r) => r.steps.engaged);
  const n = rows.length;
  const count = (k: Step) => rows.filter((r) => r.steps[k]).length;
  const FUNNEL = STEPS.slice(1);
  const drops: { step: string; lost: number; rate: number }[] = [];
  FUNNEL.forEach(([k, label], i) => {
    if (!i) return;
    const prev = count(FUNNEL[i - 1][0]);
    drops.push({ step: label, lost: prev - count(k), rate: prev ? (prev - count(k)) / prev : 0 });
  });
  const top = [...drops].sort((a, b) => b.lost - a.lost || b.rate - a.rate).slice(0, 3);
  const valueTimes = rows.map((r) => r.valueMs).filter((x): x is number => x !== null);
  const costs = rows.map((r) => r.cost).filter((x): x is number => x !== null);
  const calls = rows.reduce((a, r) => a + r.calls, 0);
  const hangups = rows.reduce((a, r) => a + r.hangups, 0);
  const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");

  const lines: string[] = [];
  lines.push(`# onboarding funnel`, ``);
  lines.push(
    Number.isNaN(since)
      ? `**development-period baseline, before today's fixes.** prod sessions from the last 7 days: our own testing and debugging plus a few friends, with no reliable way to tell them apart. read it as a baseline, not as how real users behave.`
      : `**sessions since ${stamp(since)} utc**, after the fixes below. still a small sample: friends trying it, possibly some of our own checks.`,
    ``,
    `generated ${stamp(Date.now())} utc by \`pnpm funnel${Number.isNaN(since) ? "" : " --since ..."}\` (read-only over prod sessions, aggregate only).`,
    ``,
  );
  lines.push(`## headline`, ``);
  lines.push(`- **median ${dur(median(valueTimes))} from opening the chat to the first real help** (inbox triage or a draft), across the ${valueTimes.length} sessions that got there.`);
  for (const d of top) {
    lines.push(`- **drop-off: ${d.step}** (lost ${d.lost}, ${Math.round(d.rate * 100)}% of those who reached the step before)`);
    if (CHANGES[d.step]) lines.push(`  - fix: ${CHANGES[d.step]}`);
  }
  lines.push(``, `## funnel`, ``);
  lines.push(
    `n = ${n} sessions that sent at least one message. another ${openedOnly} only opened the page (refreshes, link previews, a look without typing) and aren't in the funnel. ${sessions.length - real.length} ${Number.isNaN(since) ? "e2e test or empty" : "e2e test, empty or pre-cutoff"} sessions left out.`,
    ``,
  );
  lines.push(`| step | reached | of those who texted | from previous step | dropped here |`, `|---|---|---|---|---|`);
  FUNNEL.forEach(([k, label], i) => {
    const c = count(k);
    const prev = i ? count(FUNNEL[i - 1][0]) : c;
    lines.push(`| ${label} | ${c} | ${pct(c, n)} | ${i ? pct(c, prev) : "-"} | ${i ? prev - c : "-"} |`);
  });
  lines.push(`| (opened only, never texted) | ${openedOnly} | not in the funnel | - | - |`);
  lines.push(``, `| metric | value |`, `|---|---|`);
  lines.push(`| median time to first value (chat opened to inbox triage or a draft) | ${dur(median(valueTimes))} (${valueTimes.length} sessions got there) |`);
  lines.push(`| median turns per session | ${median(rows.map((r) => r.turns)) ?? "n/a"} |`);
  lines.push(`| calls | ${calls}, ${hangups} ended by the user before a goodbye |`);
  lines.push(`| took the default name ("persona") | ${rows.filter((r) => r.defaultedName).length} |`);
  lines.push(`| gmail via the demo inbox | ${rows.filter((r) => r.demoGmail).length} of ${count("gmail")} |`);
  lines.push(`| graduated early (skipped the rest) | ${rows.filter((r) => r.early).length} |`);
  lines.push(`| $ per session (where metered) | ${costs.length ? `$${(costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(4)} over ${costs.length}` : "n/a (metering is newer than these sessions)"} |`);
  if (Number.isNaN(since)) lines.push(``, `the fixes above shipped after almost all of these sessions, so their effect will show in \`pnpm funnel --since <deploy time>\`, not here.`);
  const out = lines.join("\n") + "\n";
  writeFileSync("FUNNEL.md", out);
  console.log(out);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

// What we changed because of each drop-off (git log, docs/journal). Keyed by step label.
const CHANGES: Record<string, string> = {
  "sent a first text":
    "left on read gets one relaxed double text after ~45s, then a lighter one, then quiet (ef635c0, journal 13); the scripted intro ends on one easy ask, \"what do you want to call me?\"",
  "named the assistant (or took the default)":
    "skip the name and it goes by \"persona\" (renameable) instead of stalling the whole flow (ef635c0, 8ff806f); a light second try with a suggestion (7b4c634); insult names get a laugh, not a lecture (9094426)",
  "was offered a call": "the call offer comes right after naming, benefit first (\"way easier than typing it all out\") (8ff806f)",
  "took a call":
    "call asks are benefit-first with texting as an equal yes, an unanswered offer gets \"no pressure, texting works just as well\" (ef635c0, 8ff806f); \"no calls\" said anytime stops offers and rings (9d0ca20); \"yes but...\" is not a yes (9094426); \"lol ok\" rings (8ff806f)",
  "told us their name": "the call greeting asks it first; \"i'm krish, call me\" takes the name before ringing (bdca125); a name said on the call and missed is caught after the hangup (9e600f9)",
  "said what they need help with": "the post-hangup pass fills a need said on the call but missed (9e600f9); \"the user leads\" follows their topic instead of digging (journal 12)",
  "connected gmail (real or demo)":
    "the ask says what gmail adds for their specific need (7b4c634); google's test-user wall no longer dead-ends: a demo inbox is one tap away and offered once after a failed connect (9be09db)",
};
