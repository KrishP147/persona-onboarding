import { z } from "zod";
import { getSecret, incrDaily, loadSession, setSecret } from "@/lib/store";
import { AURA_VOICES, CARTESIA_MODEL, CARTESIA_VERSION, CARTESIA_VOICES, ELEVEN_MODEL, ELEVEN_VOICES } from "@/lib/voice";

const Body = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{6,32}$/),
  text: z.string().min(1).max(800),
  style: z.enum(["feminine", "masculine", "neutral"]),
});

type Style = z.infer<typeof Body>["style"];
type Provider = { name: string; key: string | undefined; call: (key: string, text: string, style: Style) => Promise<Response> };

// Voices in order of preference. A provider that's out of credits (or rejects the key) is skipped
// for a while, so a call never switches voices sentence to sentence.
const PROVIDERS: Provider[] = [
  { name: "elevenlabs", key: process.env.ELEVENLABS_API_KEY, call: eleven },
  { name: "cartesia", key: process.env.CARTESIA_API_KEY, call: cartesia },
  { name: "deepgram", key: process.env.DEEPGRAM_API_KEY, call: aura },
];

// Text to speech, only for a session that's on a call, so the endpoint can't be used as a free
// TTS service. The client falls back to browser speech on any error.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const { sessionId, text, style } = parsed.data;
  const s = await loadSession(sessionId).catch(() => null);
  if (!s?.call.active) return Response.json({ error: "no active call" }, { status: 403 });
  // A call that "started" long ago and never ended isn't a call anymore.
  if (s.call.startedAt && Date.now() - s.call.startedAt > 20 * 60 * 1000) return Response.json({ error: "call expired" }, { status: 403 });
  // Plenty for real calls, not enough to use this as a free text to speech service.
  if ((await incrDaily(`tts:${sessionId}`).catch(() => 0)) > 300) return Response.json({ error: "too many" }, { status: 429 });

  for (const p of PROVIDERS) {
    if (!p.key) continue;
    if ((await getSecret(`tts:${p.name}-out`).catch(() => null)) === "1") continue;
    const res = await p.call(p.key, text, style).catch(() => null);
    if (res?.ok && res.body) return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
    const status = res?.status ?? 0;
    console.error(`${p.name} tts failed`, status, (await res?.text().catch(() => "")) ?? "");
    // Out of credits or a bad key won't fix itself mid-call: skip this provider for 6 hours.
    if (status === 401 || status === 402 || (p.name === "elevenlabs" && status === 429)) await setSecret(`tts:${p.name}-out`, "1", 6 * 3600).catch(() => {});
  }
  return Response.json({ error: "tts failed" }, { status: 502 });
}

function eleven(key: string, text: string, style: Style) {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICES[style]}/stream?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: ELEVEN_MODEL }),
  });
}

function cartesia(key: string, text: string, style: Style) {
  return fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: { "X-API-Key": key, "Cartesia-Version": CARTESIA_VERSION, "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: CARTESIA_MODEL,
      transcript: text,
      voice: CARTESIA_VOICES[style],
      output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
    }),
  });
}

function aura(key: string, text: string, style: Style) {
  return fetch(`https://api.deepgram.com/v1/speak?model=${AURA_VOICES[style]}&encoding=mp3`, {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}
