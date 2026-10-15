// Bring-your-own keys: a visitor's own provider keys ride along on each request as headers and win over
// the server's env keys for that request only. They live in this request's async context, never in the
// session, redis, logs or a response. scrub() takes them back out of any text headed for a log.
import { AsyncLocalStorage } from "async_hooks";

export interface UserKeys {
  anthropic?: string;
  cartesia?: string;
  browserbase?: string;
  deepgram?: string;
}

export const KEY_HEADERS: Record<keyof UserKeys, string> = {
  anthropic: "x-anthropic-key",
  cartesia: "x-cartesia-key",
  browserbase: "x-browserbase-key",
  deepgram: "x-deepgram-key",
};

// Printable ASCII, no spaces, a sane length: anything else is ignored rather than forwarded.
const VALID = /^[\x21-\x7e]{8,256}$/;

export function keysFrom(req: Request): UserKeys {
  const out: UserKeys = {};
  for (const [name, header] of Object.entries(KEY_HEADERS) as [keyof UserKeys, string][]) {
    const v = req.headers.get(header)?.trim();
    if (v && VALID.test(v)) out[name] = v;
  }
  return out;
}

const store = new AsyncLocalStorage<UserKeys>();
export const userKeys = (): UserKeys => store.getStore() ?? {};
export const withKeys = <T>(keys: UserKeys, fn: () => Promise<T>): Promise<T> => store.run(keys, fn);

// Redact any visitor key (from this request, or passed in) out of text before it's logged.
export function scrub(text: unknown, keys: UserKeys = userKeys()): string {
  let s = text instanceof Error ? (text.stack ?? text.message) : String(text);
  for (const k of Object.values(keys)) if (k) s = s.split(k).join("[key]");
  return s;
}
