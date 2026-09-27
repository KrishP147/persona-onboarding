import type { InboxItem } from "./types";

// Minimal Google OAuth (authorization code flow) without extra deps.
// We read the email, the unread count, and headers + previews of recent unread mail once
// (for triage), then drop the token. Message bodies are never fetched.

export const GMAIL_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly"];

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
  const tok = (await res.json()) as { access_token: string; scope?: string };
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
  const list = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=" + encodeURIComponent("is:unread in:inbox newer_than:14d"), auth);
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
