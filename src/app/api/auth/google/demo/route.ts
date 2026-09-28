import { withSession } from "@/lib/store";
import { popupPage } from "../popup";
import { connectDemo } from "@/lib/google";

// A clearly labeled sample inbox. Always available: during the trial, real Google sign-in only works for
// approved test accounts, and a reviewer who isn't one should still get to see the gmail step work.
export async function POST(req: Request) {
  const form = await req.formData();
  const sessionId = String(form.get("s") ?? "");
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(sessionId)) return new Response("bad session", { status: 400 });
  await withSession(sessionId, async (s) => connectDemo(s));
  return popupPage({ title: "Demo inbox connected", body: "<p>Sample emails, not a real account.</p>", result: { ok: true }, sessionId });
}
