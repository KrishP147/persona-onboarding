"use client";
// sun / moon / system switch, top right on / and /chat. the pre-paint script in layout.tsx
// sets html[data-theme] first; this keeps it in sync with the choice and the os setting.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { THEME_KEY } from "./theme-script";

export type ThemePref = "light" | "dark" | "system";
const EVENT = "persona-theme";
const PREFS: ThemePref[] = ["light", "dark", "system"];
const LABEL: Record<ThemePref, string> = { light: "Light", dark: "Dark", system: "System" };

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const el = document.documentElement;
  el.setAttribute("data-theme", dark ? "dark" : "light");
  el.style.colorScheme = dark ? "dark" : "light";
}

function subscribePref(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const pref = useSyncExternalStore(subscribePref, readPref, () => "system" as ThemePref);
  const set = useCallback((p: ThemePref) => {
    try {
      if (p === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, p);
    } catch {}
    apply(p);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [pref, set];
}

// the resolved theme (what html[data-theme] says), for the few places css vars can't reach
function subscribeResolved(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
export function useDark(): boolean {
  return useSyncExternalStore(subscribeResolved, () => document.documentElement.getAttribute("data-theme") === "dark", () => false);
}

function Icon({ p }: { p: ThemePref }) {
  if (p === "light")
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1" />
      </svg>
    );
  if (p === "dark")
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden>
        <path d="M13.6 10.1A5.8 5.8 0 0 1 5.9 2.4a5.8 5.8 0 1 0 7.7 7.7z" />
      </svg>
    );
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <rect x="1.8" y="2.6" width="12.4" height="8.4" rx="1.6" />
      <path d="M5.6 13.6h4.8M8 11v2.6" />
    </svg>
  );
}

// three small icon buttons in a track, same shape as the phone picker
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [pref, set] = useThemePref();
  // follow the os while on "system"
  useEffect(() => {
    if (pref !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [pref]);
  return (
    <div role="radiogroup" aria-label="Theme" className={`inline-flex p-[3px] rounded-full bg-alt ${className}`}>
      {PREFS.map((p) => {
        const on = pref === p;
        return (
          <button
            key={p}
            role="radio"
            aria-checked={on}
            aria-label={LABEL[p]}
            title={LABEL[p]}
            onClick={() => set(p)}
            className={`w-8 h-[28px] flex items-center justify-center rounded-full transition-[background-color,color,box-shadow] duration-150 ease-[var(--ease-press)] ${on ? "bg-canvas text-ink shadow-[0_1px_2px_rgba(0,0,0,.08),0_2px_8px_-2px_rgba(0,0,0,.08)] dark:bg-step-300" : "text-ink-mute hover:text-ink"}`}
          >
            <Icon p={p} />
          </button>
        );
      })}
    </div>
  );
}
