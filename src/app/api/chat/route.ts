import { z } from "zod";
import { withSession } from "@/lib/store";
import { handleUserMessage } from "@/lib/engine";

const Body = z.object({
  sessionId: z.string().min(6).max(32),
  channel: z.enum(["text", "voice"]),
  text: z.string().max(8000).default(""),
  attachments: z
    .array(
      z.object({
        kind: z.enum(["image", "audio", "video", "file"]),
        name: z.string().max(200),
        mime: z.string().max(100),
        summary: z.string().max(4000).optional(),
        dataUrl: z.string().max(6_000_000).optional(),
      }),
    )
    .max(4)
    .optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const { sessionId, channel, text, attachments } = parsed.data;
  if (!text.trim() && !attachments?.length) return Response.json({ error: "empty message" }, { status: 400 });
  try {
    const result = await withSession(sessionId, (s) => handleUserMessage(s, channel, text, attachments));
    return Response.json(result);
  } catch (err) {
    console.error("chat turn failed", err);
    return Response.json({ error: "turn failed" }, { status: 500 });
  }
}
