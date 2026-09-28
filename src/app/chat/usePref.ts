"use client";
// a remembered on/off pref (localStorage, with a memory fallback when storage throws)
import { useCallback, useSyncExternalStore } from "react";

const EVENT = "persona-pref";
const mem = new Map<string, boolean>();

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
const noop = () => () => {};

// false on the server, true once hydrated on the client
export const useClient = () => useSyncExternalStore(noop, () => true, () => false);

export function usePref(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const read = useCallback(() => {
    if (mem.has(key)) return mem.get(key)!;
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v === "1";
    } catch {
      return fallback;
    }
  }, [key, fallback]);
  const value = useSyncExternalStore(subscribe, read, () => fallback);
  const set = useCallback(
    (next: boolean) => {
      mem.set(key, next);
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {}
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
