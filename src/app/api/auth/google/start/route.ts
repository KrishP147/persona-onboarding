import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { authUrl, googleConfig } from "@/lib/google";
import { popupPage } from "../popup";

// Opened in a popup so an ongoing call in the main tab keeps running.
export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("s") ?? "";
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(sessionId)) return new Response("bad session", { status: 400 });

  if (!googleConfig()) {
    // No OAuth client configured: offer a clearly labeled demo account instead of a dead end.
    return popupPage({
      title: "Google sign-in isn't set up here",
      body: `<p>This build has no Google OAuth client configured, so there's no real sign-in.</p>
<form method="post" action="/api/auth/google/demo"><input type="hidden" name="s" value="${sessionId}">
<button type="submit">Connect a demo account</button></form>
<p><a href="#" onclick="window.close()">Cancel</a></p>`,
    });
  }

  const nonce = nanoid(16);
  const jar = await cookies();
  jar.set("g_oauth", `${nonce}.${sessionId}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return Response.redirect(authUrl(req, nonce), 302);
}
