import { incrDaily, loadSession } from "@/lib/store";

// Voice notes in the text thread: the browser records, we transcribe with Deepgram (pre-recorded),
// and the transcript goes to the agent like any typed message. The audio itself isn't stored.
export async function POST(req: Request) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return Response.json({ error: "not configured" }, { status: 503 });
  const id = new URL(req.url).searchParams.get("s") ?? "";
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id) || !(await loadSession(id).catch(() => null))) {
    return Response.json({ error: "unknown session" }, { status: 403 });
  }
  const audio = await req.arrayBuffer();
  if (audio.byteLength === 0) return Response.json({ error: "empty" }, { status: 400 });
  if (audio.byteLength > 4_000_000) return Response.json({ error: "too long" }, { status: 413 }); // about 2+ minutes of opus
  if ((await incrDaily(`notes:${id}`).catch(() => 0)) > 60) return Response.json({ error: "too many" }, { status: 429 });

  const q = new URLSearchParams({ model: "nova-3", smart_format: "true", detect_language: "true" });
  const res = await fetch(`https://api.deepgram.com/v1/listen?${q}`, {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": req.headers.get("content-type") || "audio/webm" },
    body: audio,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    console.error("deepgram transcribe failed", res.status, await res.text().catch(() => ""));
    return Response.json({ error: "transcription failed" }, { status: 502 });
  }
  const data = (await res.json()) as {
    metadata?: { duration?: number };
    results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
  };
  const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
  return Response.json({ transcript, duration: data.metadata?.duration ?? null });
}
