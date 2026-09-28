// optional per-session numbers from the server (typed loosely: older servers don't send them)
type Metrics = { turns?: number; costUsd?: number; p50Ms?: number };

export function metricsLine(session: unknown): string | null {
  const m = (session as { metrics?: Metrics } | null)?.metrics;
  if (!m || typeof m.turns !== "number") return null;
  const parts = [`${m.turns} turn${m.turns === 1 ? "" : "s"}`];
  if (typeof m.costUsd === "number") parts.push(`$${m.costUsd.toFixed(m.costUsd > 0 && m.costUsd < 0.01 ? 3 : 2)}`);
  if (typeof m.p50Ms === "number") parts.push(`p50 ${Math.round(m.p50Ms)}ms`);
  return `this session: ${parts.join(" · ")}`;
}
