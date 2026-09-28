// Dev-only token ledger so harness runs can report real spend. Off in prod.
import { AsyncLocalStorage } from "async_hooks";
import { promises as fs } from "fs";
import path from "path";

export const USAGE_FILE = path.join(".data", "usage.jsonl");
export const TURNS_FILE = path.join(".data", "turns.jsonl");

// $ per MTok: input, output. Cache writes 1.25x input; reads 0.1x input.
const PRICES: Record<string, [number, number]> = {
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
  "gemini-3.5-flash": [1.5, 9],
  "gemini-3.5-flash-lite": [0.3, 2.5],
};

export interface Tokens {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface UsageRow {
  ts: number;
  model: string;
  tag: string;
  cost: number;
}

export function costOf(model: string, u: Tokens) {
  const [inP, outP] = PRICES[model] ?? [5, 25];
  return (u.input * inP + (u.cacheWrite ?? 0) * inP * 1.25 + (u.cacheRead ?? 0) * inP * 0.1 + u.output * outP) / 1e6;
}

export async function recordUsage(model: string, tag: string, u: Tokens) {
  // Before any await: callers fire this without waiting, and the turn's meter must still see it.
  const m = meters.getStore();
  if (m) {
    m.cost += costOf(model, u);
    m.calls += 1;
    if (tag === "agent") m.model = model;
  }
  if (process.env.ALLOW_TEST_EVENTS !== "1") return;
  const row: UsageRow = { ts: Date.now(), model, tag, cost: costOf(model, u) };
  try {
    await fs.mkdir(path.dirname(USAGE_FILE), { recursive: true });
    await fs.appendFile(USAGE_FILE, JSON.stringify(row) + "\n");
  } catch {
    // ledger is best effort
  }
}

export async function spendSince(ts: number) {
  const text = await fs.readFile(USAGE_FILE, "utf8").catch(() => "");
  const rows = text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as UsageRow).filter((r) => r.ts >= ts);
  const byTag: Record<string, number> = {};
  for (const r of rows) byTag[r.tag] = (byTag[r.tag] ?? 0) + r.cost;
  return { total: rows.reduce((a, r) => a + r.cost, 0), byTag, calls: rows.length };
}

// Per-turn meter: every model call made while handling one message or event (reply, extractor, triage) adds its
// cost here, and the reply's own wall time is timed in engine.generate. Cheap: no extra calls, no extra storage.
export interface Meter {
  cost: number;
  calls: number;
  model?: string;
  latencyMs?: number;
}
const meters = new AsyncLocalStorage<Meter>();
export const currentMeter = () => meters.getStore();
export function metered<T>(fn: () => Promise<T>): Promise<[T, Meter]> {
  const m: Meter = { cost: 0, calls: 0 };
  return meters.run(m, async (): Promise<[T, Meter]> => [await fn(), m]);
}

export interface TurnRow {
  ts: number;
  session: string;
  model: string;
  latencyMs: number;
  cost: number;
  calls: number;
}
export async function recordTurn(row: TurnRow) {
  if (process.env.ALLOW_TEST_EVENTS !== "1") return;
  try {
    await fs.mkdir(path.dirname(TURNS_FILE), { recursive: true });
    await fs.appendFile(TURNS_FILE, JSON.stringify(row) + "\n");
  } catch {
    // best effort
  }
}

export function percentile(xs: number[], p: number) {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}
