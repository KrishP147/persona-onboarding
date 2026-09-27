import { z } from "zod";
import { loadSession } from "@/lib/store";
import { CARTESIA_MODEL, CARTESIA_VERSION, CARTESIA_VOICES } from "@/lib/voice";

const Body = z.object({
  sessionId: z.string().min(6).max(32),
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
