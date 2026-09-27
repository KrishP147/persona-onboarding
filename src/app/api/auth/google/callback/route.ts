import { cookies } from "next/headers";
import { exchangeCode, fetchIdentity } from "@/lib/google";
import { setSecret, withSession } from "@/lib/store";
import { popupPage } from "../popup";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const [nonce, sessionId] = (jar.get("g_oauth")?.value ?? "").split(".");
  jar.delete("g_oauth");

  if (!nonce || !sessionId || url.searchParams.get("state") !== nonce) {
    return popupPage({ title: "That link expired", body: "<p>Close this and tap the link again.</p>", result: { ok: false, error: "state_mismatch" } });
  }
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (error || !code) {
    // access_denied = the user cancelled on Google's screen. Not a failure worth alarming anyone over.
    return popupPage({ title: "No worries", body: "<p>You can connect anytime.</p>", result: { ok: false, error: error ?? "no_code" }, sessionId });
  }
  try {
    const tok = await exchangeCode(req, code);
    if (!tok.scope?.includes("gmail.readonly")) {
      return popupPage({ title: "Almost", body: "<p>Gmail access wasn't granted, so it isn't connected. That's okay.</p>", result: { ok: false, error: "scope_not_granted" }, sessionId });
    }
    const who = await fetchIdentity(tok.access_token);
    // Kept server side only (never in the session the browser receives), for reading their inbox on request.
    await setSecret(`gtoken:${sessionId}`, tok.access_token, (tok.expires_in ?? 3600) - 60).catch(() => {});
    await withSession(sessionId, async (s) => {
      s.gmailVerified = { email: who.email, unread: who.unread, inbox: who.inbox };
    });
    return popupPage({ title: "Connected", body: `<p>${who.email}</p>`, result: { ok: true }, sessionId });
  } catch (e) {
    console.error("google callback failed", e);
    return popupPage({ title: "That didn't go through", body: "<p>It's optional, you can try again anytime.</p>", result: { ok: false, error: "exchange_failed" }, sessionId });
  }
}
