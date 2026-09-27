import { z } from "zod";
import { incrDaily, loadSession } from "@/lib/store";
import { CARTESIA_MODEL, CARTESIA_VERSION, CARTESIA_VOICES } from "@/lib/voice";

const Body = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{6,32}$/),
  text: z.string().min(1).max(800),
  style: z.enum(["feminine", "masculine", "neutral"]),
});

// Text to speech via Cartesia. Only for a session that's on a call, so the endpoint can't be
// used as a free TTS service. The client falls back to browser speech on any error.
export async function POST(req: Request) {
  const key = process.env.CARTESIA_API_KEY;
  if (!key) return Response.json({ error: "tts not configured" }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const { sessionId, text, style } = parsed.data;
  const s = await loadSession(sessionId).catch(() => null);
  if (!s?.call.active) return Response.json({ error: "no active call" }, { status: 403 });
  // A call that "started" long ago and never ended isn't a call anymore.
  if (s.call.startedAt && Date.now() - s.call.startedAt > 20 * 60 * 1000) return Response.json({ error: "call expired" }, { status: 403 });
  // Plenty for real calls, not enough to use this as a free text to speech service.
  if ((await incrDaily(`tts:${sessionId}`).catch(() => 0)) > 300) return Response.json({ error: "too many" }, { status: 429 });

  const res = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: { "X-API-Key": key, "Cartesia-Version": CARTESIA_VERSION, "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: CARTESIA_MODEL,
      transcript: text,
      voice: CARTESIA_VOICES[style],
      output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
    }),
  });
  if (!res.ok || !res.body) {
    console.error("cartesia tts failed", res.status, await res.text().catch(() => ""));
    return Response.json({ error: "tts failed" }, { status: 502 });
  }
  // Stream straight through so playback can start as soon as bytes arrive.
  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
