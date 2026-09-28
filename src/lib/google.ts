import type { InboxItem } from "./types";
import type { Session } from "./types";
import { DEMO_INBOX } from "./triage";

// Minimal Google OAuth (authorization code flow) without extra deps.
// We read the email, the unread count, and headers + previews of recent unread mail once
// (for triage), then drop the token. Message bodies are never fetched.

export const GMAIL_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"];

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function redirectUri(req: Request) {
  return process.env.GOOGLE_REDIRECT_URI ?? new URL("/api/auth/google/callback", req.url).toString();
}

export function authUrl(req: Request, state: string) {
  const cfg = googleConfig()!;
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "online",
    include_granted_scopes: "true",
    prompt: "select_account",
    state,
  }).toString();
  return u.toString();
}

export async function exchangeCode(req: Request, code: string) {
  const cfg = googleConfig()!;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri(req),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange ${res.status}`);
  const tok = (await res.json()) as { access_token: string; scope?: string; expires_in?: number };
  return tok;
}

export async function fetchIdentity(accessToken: string) {
  const auth = { headers: { Authorization: `Bearer ${accessToken}` } };
  const who = await fetch("https://openidconnect.googleapis.com/v1/userinfo", auth);
  if (!who.ok) throw new Error(`userinfo ${who.status}`);
  const { email } = (await who.json()) as { email?: string };
  if (!email) throw new Error("no email on account");
  // Best effort: unread count is a nice touch, never a blocker.
  let unread: number | undefined;
  try {
    const inbox = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX", auth);
    if (inbox.ok) unread = ((await inbox.json()) as { messagesUnread?: number }).messagesUnread;
  } catch {}
  const inbox = await fetchUnreadHeaders(auth).catch(() => []);
  return { email, unread, inbox };
}

async function fetchUnreadHeaders(auth: { headers: Record<string, string> }): Promise<InboxItem[]> {
  return fetchMessages(auth, "is:unread in:inbox newer_than:14d", 20);
}

// Latest messages matching a Gmail search (headers + Gmail's short preview; bodies are never fetched).
export async function readInbox(accessToken: string, query = "in:inbox", max = 5): Promise<InboxItem[] | null> {
  const auth = { headers: { Authorization: `Bearer ${accessToken}` } };
  const probe = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", auth);
  if (probe.status === 401) return null; // token expired: they need to reconnect
  return fetchMessages(auth, query, Math.min(Math.max(max, 1), 10));
}

async function fetchMessages(auth: { headers: Record<string, string> }, query: string, max: number): Promise<InboxItem[]> {
  const list = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=` + encodeURIComponent(query), auth);
  if (!list.ok) return [];
  const ids = (((await list.json()) as { messages?: { id: string }[] }).messages ?? []).map((m) => m.id);
  const got = await Promise.all(
    ids.map(async (id) => {
      const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, auth);
      if (!r.ok) return null;
      const m = (await r.json()) as { id: string; snippet?: string; labelIds?: string[]; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } };
      const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
      const from = h("from");
      const email = from.match(/<([^>]+)>/)?.[1] ?? from;
      const item: InboxItem = {
        id: m.id,
        fromName: from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || email,
        fromEmail: email,
        subject: h("subject").slice(0, 160),
        snippet: (m.snippet ?? "").slice(0, 200),
        date: Number(m.internalDate ?? Date.now()),
        labels: m.labelIds,
      };
      return item;
    }),
  );
  return got.filter((x): x is InboxItem => x !== null);
}

// Drafts and sending (gmail.compose). A draft is always shown to them before it can be sent.
export type Draft = { to: string; subject: string; body: string };

function rawMessage(d: Draft) {
  const subject = /^[\x20-\x7e]*$/.test(d.subject) ? d.subject : `=?UTF-8?B?${Buffer.from(d.subject, "utf8").toString("base64")}?=`;
  const lines = [...(d.to ? [`To: ${d.to}`] : []), `Subject: ${subject}`, "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "", d.body.replace(/\r?\n/g, "\r\n")];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

type GmailResult<T> = { ok: true; value: T } | { ok: false; reason: "expired" | "no_scope" | "failed" };

async function gmailPost<T>(accessToken: string, path: string, body: object, method = "POST"): Promise<GmailResult<T>> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) return { ok: false, reason: "expired" };
  if (res.status === 403) return { ok: false, reason: "no_scope" };
  if (!res.ok) {
    console.error(`gmail ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return { ok: false, reason: "failed" };
  }
  return { ok: true, value: (await res.json()) as T };
}

// Creates a draft, or replaces the one we already made (so edits don't pile up in their drafts folder).
export function saveDraft(accessToken: string, d: Draft, draftId?: string) {
  const body = { ...(draftId ? { id: draftId } : {}), message: { raw: rawMessage(d) } };
  return gmailPost<{ id: string }>(accessToken, draftId ? `drafts/${draftId}` : "drafts", body, draftId ? "PUT" : "POST");
}

export function sendDraft(accessToken: string, draftId: string) {
  return gmailPost<{ id: string }>(accessToken, "drafts/send", { id: draftId });
}

export const DEMO_EMAIL = "demo.user@gmail.com";
// The sample inbox, verified the same way the oauth callback verifies a real one (consumed by gmail_connected).
export function connectDemo(s: Session) {
  s.gmailVerified = { email: DEMO_EMAIL, unread: 14, demo: true, inbox: DEMO_INBOX };
}
