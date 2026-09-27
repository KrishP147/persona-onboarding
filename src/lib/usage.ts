// Dev-only token ledger so harness runs can report real spend. Off in prod.
import { promises as fs } from "fs";
import path from "path";

export const USAGE_FILE = path.join(".data", "usage.jsonl");

// $ per MTok: input, output. Cache writes 1.25x input; reads 0.1x (Anthropic) / 0.25x (Gemini).
const PRICES: Record<string, [number, number]> = {
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
  "gemini-2.5-flash": [0.3, 2.5],
  "gemini-2.5-flash-lite": [0.1, 0.4],
  "gemini-3-flash-preview": [0.5, 3],
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
  const readRate = model.startsWith("gemini") ? 0.25 : 0.1;
  return (u.input * inP + (u.cacheWrite ?? 0) * inP * 1.25 + (u.cacheRead ?? 0) * inP * readRate + u.output * outP) / 1e6;
}

export async function recordUsage(model: string, tag: string, u: Tokens) {
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
