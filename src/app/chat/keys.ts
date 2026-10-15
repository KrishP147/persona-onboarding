"use client";
// the visitor's own provider keys: kept in this browser only (localStorage), sent as headers with this
// page's own requests, never stored on the server. see src/lib/keys.ts for the server side.
import { useCallback, useSyncExternalStore } from "react";

export type KeyName = "anthropic" | "cartesia" | "browserbase" | "deepgram";
export type Keys = Partial<Record<KeyName, string>>;

const LS = "persona-keys";
const EVENT = "persona-keys";
const HEADERS: Record<KeyName, string> = {
  anthropic: "x-anthropic-key",
  cartesia: "x-cartesia-key",
  browserbase: "x-browserbase-key",
  deepgram: "x-deepgram-key",
};
let mem: Keys | null = null; // when storage throws (private mode), keys last for this page only
let snap: { raw: string; keys: Keys } = { raw: "", keys: {} };

function raw(): string {
  if (mem) return JSON.stringify(mem);
  try {
    return localStorage.getItem(LS) ?? "";
  } catch {
    return "";
  }
}

export function loadKeys(): Keys {
  if (typeof window === "undefined") return {};
  const r = raw();
  if (r === snap.raw) return snap.keys; // stable identity for useSyncExternalStore
  let keys: Keys = {};
  try {
    const parsed = r ? (JSON.parse(r) as Record<string, unknown>) : {};
    for (const k of Object.keys(HEADERS) as KeyName[]) if (typeof parsed[k] === "string" && parsed[k]) keys[k] = parsed[k] as string;
  } catch {
    keys = {};
  }
  snap = { raw: r, keys };
  return keys;
}

export function saveKeys(next: Keys) {
  const clean: Keys = {};
  for (const k of Object.keys(HEADERS) as KeyName[]) {
    const v = next[k]?.trim();
    if (v) clean[k] = v;
  }
  try {
    if (Object.keys(clean).length) localStorage.setItem(LS, JSON.stringify(clean));
    else localStorage.removeItem(LS);
    mem = null;
  } catch {
    mem = clean;
  }
  window.dispatchEvent(new Event(EVENT));
}

// headers for a request to our own api; header values must be plain ascii, so anything else is skipped
export function keyHeaders(): Record<string, string> {
  const keys = loadKeys();
  const out: Record<string, string> = {};
  for (const k of Object.keys(HEADERS) as KeyName[]) {
    const v = keys[k];
    if (v && /^[\x21-\x7e]+$/.test(v)) out[HEADERS[k]] = v;
  }
  return out;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
const EMPTY: Keys = {};

export function useKeys(): [Keys, (k: Keys) => void] {
  const keys = useSyncExternalStore(subscribe, loadKeys, () => EMPTY);
  const set = useCallback((k: Keys) => saveKeys(k), []);
  return [keys, set];
}
