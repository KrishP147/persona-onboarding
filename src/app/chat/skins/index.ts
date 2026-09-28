"use client";
import { useCallback, useSyncExternalStore } from "react";
import { galaxy } from "./galaxy";
import { iphone } from "./iphone";
import { pixel } from "./pixel";
import { SKIN_IDS, type Skin, type SkinId } from "./types";

export const SKINS: Record<SkinId, Skin> = { iphone, pixel, galaxy };
export type { Skin, SkinId } from "./types";

const KEY = "persona-phone-skin";
const EVENT = "persona-skin";
const isSkin = (v: unknown): v is SkinId => SKIN_IDS.includes(v as SkinId);

// iphone/ipad -> iphone, samsung -> galaxy, other android -> pixel, desktop -> pixel
export function detectSkin(ua: string, touchMac = false): SkinId {
  if (/iPhone|iPad|iPod/i.test(ua) || touchMac) return "iphone";
  if (/Android/i.test(ua)) return /Samsung|SM-[A-Z0-9]/i.test(ua) ? "galaxy" : "pixel";
  return "pixel";
}

// ?phone= wins, then the saved pick, then the device
function read(): SkinId {
  try {
    const q = new URL(window.location.href).searchParams.get("phone");
    if (isSkin(q)) return q;
  } catch {}
  try {
    const s = localStorage.getItem(KEY);
    if (isSkin(s)) return s;
  } catch {}
  // ipads report as macs; a touch mac is an ipad
  const touchMac = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  return detectSkin(navigator.userAgent, touchMac);
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

// server render has no device: null until the client knows
export function useSkin(): [Skin | null, (id: SkinId) => void] {
  const id = useSyncExternalStore(subscribe, read, () => null);
  const set = useCallback((next: SkinId) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    try {
      // keep the url in step so a shared link opens the same phone
      const url = new URL(window.location.href);
      if (url.searchParams.has("phone")) {
        url.searchParams.set("phone", next);
        window.history.replaceState(null, "", url);
      }
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [id ? SKINS[id] : null, set];
}
