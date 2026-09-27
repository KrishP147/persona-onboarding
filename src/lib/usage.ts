// Dev-only token ledger so harness runs can report real spend. Off in prod.
import { promises as fs } from "fs";
import path from "path";
import type Anthropic from "@anthropic-ai/sdk";

export const USAGE_FILE = path.join(".data", "usage.jsonl");

// $ per MTok: input, output. Cache writes 1.25x input, reads 0.1x input.
const PRICES: Record<string, [number, number]> = {
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
};

export interface UsageRow {
  ts: number;
  model: string;
  tag: string;
  cost: number;
}

export function costOf(model: string, u: Anthropic.Usage) {
  const [inP, outP] = PRICES[model] ?? [5, 25];
  const tokens =
    u.input_tokens * inP + (u.cache_creation_input_tokens ?? 0) * inP * 1.25 + (u.cache_read_input_tokens ?? 0) * inP * 0.1 + u.output_tokens * outP;
  return tokens / 1e6;
}

export async function recordUsage(model: string, tag: string, u: Anthropic.Usage) {
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
