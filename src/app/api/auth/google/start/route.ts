import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { authUrl, googleConfig } from "@/lib/google";
import { demoForm, popupPage } from "../popup";

// Opened in a popup so an ongoing call in the main tab keeps running.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("s") ?? "";
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(sessionId)) return new Response("bad session", { status: 400 });

  if (!googleConfig()) {
    // No OAuth client configured: offer a clearly labeled demo account instead of a dead end.
    return popupPage({
      title: "Google sign-in isn't set up here",
      body: `<p>This build has no Google OAuth client configured, so there's no real sign-in.</p>
${demoForm(sessionId, "Connect a demo account", false)}
<p><a href="#" onclick="window.close()">Cancel</a></p>`,
    });
  }

  // Real sign-in first. Google blocks accounts that aren't approved testers on its own page (it never comes
  // back here), so the sample inbox is offered up front too, one tap away, instead of after a dead end.
  if (url.searchParams.get("go") !== "1") {
    return popupPage({
      title: "Connect your Gmail",
      body: `<p><a class="btn" href="/api/auth/google/start?s=${sessionId}&go=1">Sign in with Google</a></p>
<p class="small">Read-only inbox, drafts only with your ok. During this trial, Google sign-in works for approved test accounts only.</p>
${demoForm(sessionId, "Use a demo inbox instead")}
<p><a href="#" onclick="window.close()">Cancel</a></p>`,
    });
  }

  const nonce = nanoid(16);
  const jar = await cookies();
  jar.set("g_oauth", `${nonce}.${sessionId}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return Response.redirect(authUrl(req, nonce), 302);
}
