import { z } from "zod";
import { SessionBusyError, withSession } from "@/lib/store";
import { handleUserMessage } from "@/lib/engine";

const Body = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{6,32}$/),
  channel: z.enum(["text", "voice"]),
  text: z.string().max(8000).default(""),
  interrupted: z.boolean().optional(),
  heardBefore: z.string().max(1000).optional(), // what they heard of the line they cut off
  tz: z.string().max(64).optional(), // their browser's time zone
  clientId: z.string().regex(/^[A-Za-z0-9_-]{6,32}$/).optional(),
  attachments: z
    .array(
      z.object({
        kind: z.enum(["image", "audio", "video", "file"]),
        name: z.string().max(200),
        mime: z.string().max(100),
        summary: z.string().max(4000).optional(),
        dataUrl: z.string().max(1_500_000).optional(), // client downsizes to ~150KB
      }),
    )
    .max(4)
    .optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const { sessionId, channel, text, attachments, interrupted, clientId, heardBefore, tz } = parsed.data;
  if (!text.trim() && !attachments?.length) return Response.json({ error: "empty message" }, { status: 400 });
  try {
    const result = await withSession(sessionId, (s) => {
      if (tz && validTz(tz)) s.tz = tz;
      return handleUserMessage(s, channel, text, attachments, interrupted, clientId, heardBefore);
    });
    return Response.json(result);
  } catch (err) {
    // Another turn on this session is still running: a retryable conflict, not a server error.
    if (err instanceof SessionBusyError) return Response.json({ error: "busy" }, { status: 409 });
    console.error("chat turn failed", err);
    return Response.json({ error: "turn failed" }, { status: 500 });
  }
}

function validTz(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
