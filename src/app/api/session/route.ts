import { z } from "zod";
import { loadSession, newSession, saveSession, withSession } from "@/lib/store";
import { handleEvent, usingMock } from "@/lib/engine";
import { computeDirective } from "@/lib/policy";

// GET ?id=... → resume (or create) a session. POST → deliver a client event.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  let s = id ? await loadSession(id).catch(() => null) : null;
  if (!s) {
    s = newSession();
    await saveSession(s);
  }
  const channel = s.call.active ? "voice" : "text";
  return Response.json({ session: s, chips: computeDirective(s, channel).chips, mock: usingMock() });
}

const Event = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open") }),
  z.object({ type: z.literal("call_started") }),
  z.object({ type: z.literal("call_declined") }),
  z.object({ type: z.literal("call_ended"), reason: z.enum(["user_hangup", "agent_ended", "error"]) }),
  z.object({ type: z.literal("silence") }),
  z.object({ type: z.literal("mic_denied") }),
  z.object({ type: z.literal("gmail_connected"), email: z.string().email() }),
  z.object({ type: z.literal("gmail_failed"), error: z.string().max(200) }),
]);

const Body = z.object({ sessionId: z.string().min(6).max(32), event: Event });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  try {
    const result = await withSession(parsed.data.sessionId, (s) => handleEvent(s, parsed.data.event));
    return Response.json(result);
  } catch (err) {
    console.error("event failed", err);
    return Response.json({ error: "event failed" }, { status: 500 });
  }
}
