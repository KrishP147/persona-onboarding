import { googleConfig } from "@/lib/google";
import { withSession } from "@/lib/store";
import { popupPage } from "../popup";
import { DEMO_INBOX } from "@/lib/triage";

// Only available when no real OAuth client is configured.
export async function POST(req: Request) {
  if (googleConfig()) return new Response("not available", { status: 404 });
  const form = await req.formData();
  const sessionId = String(form.get("s") ?? "");
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(sessionId)) return new Response("bad session", { status: 400 });
  await withSession(sessionId, async (s) => {
    s.gmailVerified = { email: "demo.user@gmail.com", unread: 14, demo: true, inbox: DEMO_INBOX };
  });
  return popupPage({ title: "Demo account connected", result: { ok: true }, sessionId });
}
