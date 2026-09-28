// Summarize the latest finished harness run into one table for the README: latency and $ per onboarding.
// Run: pnpm -s metrics [run-folder-name] [--root <checkout>]   (reads harness/runs, .data/usage.jsonl, .data/sessions)
//
// Latency: sessions made after the turn meter shipped carry real model latency (request to full reply) in
// session.metrics. Older runs fall back to turn time from the transcript (their text -> our next text), which
// also includes the extractor and tools, so it reads a little high. The table says which one it used.
import { promises as fs } from "fs";
import path from "path";
import { percentile, type UsageRow } from "../src/lib/usage";
import type { Session } from "../src/lib/types";

const args = process.argv.slice(2);
const rootAt = args.indexOf("--root");
const root = rootAt >= 0 ? args[rootAt + 1] : ".";
const want = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--root");
const HARNESS_TAGS = new Set(["sim", "judge"]); // the simulated user and the grader aren't the product's cost

// "2026-09-28T00-15-22-482Z" -> ms
const folderTime = (name: string) => Date.parse(name.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, "T$1:$2:$3.$4Z"));

async function main() {
  const runsDir = path.join(root, "harness", "runs");
  const runs = (await fs.readdir(runsDir)).filter((n) => !Number.isNaN(folderTime(n))).sort();
  let run: string | undefined = want;
  if (!run) {
    for (const r of [...runs].reverse()) {
      if (await fs.stat(path.join(runsDir, r, "SUMMARY.md")).catch(() => null)) { run = r; break; }
    }
  }
  if (!run) throw new Error("no finished harness run (needs SUMMARY.md)");
  const dir = path.join(runsDir, run);
  const start = folderTime(run);
  const end = (await fs.stat(path.join(dir, "SUMMARY.md")).catch(() => null))?.mtimeMs ?? Date.now();
  const personas = (await fs.readdir(dir)).filter((f) => f.endsWith(".md") && f !== "SUMMARY.md").length;

  const usage = (await fs.readFile(path.join(root, ".data", "usage.jsonl"), "utf8").catch(() => ""))
    .split("\n").filter(Boolean).map((l) => JSON.parse(l) as UsageRow).filter((r) => r.ts >= start && r.ts <= end + 5000);
  const product = usage.filter((r) => !HARNESS_TAGS.has(r.tag));
  const productCost = product.reduce((a, r) => a + r.cost, 0);
  const harnessCost = usage.reduce((a, r) => a + r.cost, 0) - productCost;

  const sessDir = path.join(root, ".data", "sessions");
  const sessions: Session[] = [];
  for (const f of await fs.readdir(sessDir).catch(() => [] as string[])) {
    const s = JSON.parse(await fs.readFile(path.join(sessDir, f), "utf8").catch(() => "null")) as Session | null;
    if (s && s.createdAt >= start && s.createdAt <= end && s.transcript.some((m) => m.role === "user")) sessions.push(s);
  }
  const measured = sessions.filter((s) => s.metrics?.latencies.length);
  const latencies = measured.length ? measured.flatMap((s) => s.metrics!.latencies) : sessions.flatMap(turnTimes);
  const how = measured.length ? "model reply (request to full reply)" : "turn time from transcripts (proxy, includes extractor)";
  const onboardings = sessions.length || personas;
  const models: Record<string, number> = {};
  for (const r of product.filter((r) => r.tag === "agent")) models[r.model] = (models[r.model] ?? 0) + 1;

  const ms = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(1)}s` : `${Math.round(x)}ms`);
  console.log(`harness run ${run}: ${onboardings} onboardings, ${latencies.length} replies\n`);
  console.log("| metric | value |\n|---|---|");
  console.log(`| p50 latency | ${ms(percentile(latencies, 50))} |`);
  console.log(`| p95 latency | ${ms(percentile(latencies, 95))} |`);
  console.log(`| $ / onboarding | $${(productCost / Math.max(1, onboardings)).toFixed(4)} |`);
  console.log(`| $ / reply | $${(productCost / Math.max(1, latencies.length)).toFixed(4)} |`);
  console.log(`| agent model | ${Object.entries(models).map(([m, n]) => `${m} (${n})`).join(", ") || "n/a"} |`);
  console.log(`\nlatency = ${how}. $ counts every model call the product made (replies, extractor, voice pick), not the harness's simulated user and grader ($${harnessCost.toFixed(3)} on top).`);
}

// Their message -> our next message, per turn (text and voice), for sessions from before the turn meter.
function turnTimes(s: Session) {
  const out: number[] = [];
  s.transcript.forEach((m, i) => {
    if (m.role !== "user") return;
    const next = s.transcript.slice(i + 1).find((x) => x.role === "agent" || x.role === "user");
    if (next?.role === "agent" && next.ts >= m.ts) out.push(next.ts - m.ts);
  });
  return out;
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
