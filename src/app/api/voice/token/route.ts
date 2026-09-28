import { incrDaily, loadSession } from "@/lib/store";
import { keyterms } from "@/lib/voice";

// Short-lived Deepgram token so the browser can stream mic audio without ever seeing our key.
export async function GET(req: Request) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return Response.json({ error: "stt not configured" }, { status: 503 });
  const id = new URL(req.url).searchParams.get("s") ?? "";
  const s = /^[A-Za-z0-9_-]{6,32}$/.test(id) ? await loadSession(id).catch(() => null) : null;
  if (!s) return Response.json({ error: "unknown session" }, { status: 403 });
  if ((await incrDaily(`dgtoken:${id}`).catch(() => 0)) > 40) return Response.json({ error: "too many" }, { status: 429 });
  const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: 30 }),
  });
  if (!res.ok) {
    console.error("deepgram grant failed", res.status, await res.text().catch(() => ""));
    return Response.json({ error: "stt unavailable" }, { status: 502 });
  }
  const { access_token } = (await res.json()) as { access_token: string };
  // nova-3 keyterm prompting: the words this call most needs to hear right (append each as `keyterm=` on the listen url).
  return Response.json({ token: access_token, keyterms: keyterms(s) }, { headers: { "Cache-Control": "no-store" } });
}
