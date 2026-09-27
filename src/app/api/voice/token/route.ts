import { loadSession } from "@/lib/store";

// Short-lived Deepgram token so the browser can stream mic audio without ever seeing our key.
export async function GET(req: Request) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return Response.json({ error: "stt not configured" }, { status: 503 });
  const id = new URL(req.url).searchParams.get("s") ?? "";
  const s = /^[A-Za-z0-9_-]{6,32}$/.test(id) ? await loadSession(id).catch(() => null) : null;
  if (!s) return Response.json({ error: "unknown session" }, { status: 403 });
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
  return Response.json({ token: access_token }, { headers: { "Cache-Control": "no-store" } });
}
