"use client";
// first-visit note for reviewers: what this is and what to try. never blocks the session booting underneath.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Wordmark } from "./chrome";
import { useClient, usePref } from "./usePref";

const TRY = [
  ["Hang up mid-call.", "it picks the thread back up in texts."],
  ["Say “skip, just let me in.”", "it stops asking and lets you through."],
  ["Decline the call.", "texting works just as well."],
] as const;

const noop = () => () => {};
const forcedByUrl = () => {
  try {
    return new URL(window.location.href).searchParams.get("intro") === "1";
  } catch {
    return false;
  }
};

export function Intro() {
  const client = useClient();
  const [seen, setSeen] = usePref("persona-intro-seen", false);
  const forced = useSyncExternalStore(noop, forcedByUrl, () => false);
  const [closed, setClosed] = useState(false);
  const open = client && !closed && (forced || !seen);
  const close = () => {
    setClosed(true);
    setSeen(true);
  };
  return open ? <IntroDialog onClose={close} /> : null;
}

function IntroDialog({ onClose }: { onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    // no ring on open; keyboard users still get it once they tab
    primaryRef.current?.focus({ focusVisible: false } as FocusOptions);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !cardRef.current) return;
      // focus trap: cycle within the card
      const els = Array.from(cardRef.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled])"));
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      const inside = cardRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // back to the composer if nothing sensible had focus before
      const composer = document.querySelector<HTMLElement>(".phone-screen textarea, .phone-screen input[type=text]");
      (before && before !== document.body ? before : composer)?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center font-sans text-ink" role="presentation">
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-[rgba(19,21,21,.38)] sk-fade" />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        aria-describedby="intro-desc"
        className="relative w-full sm:w-[440px] max-h-[92dvh] overflow-y-auto bg-canvas rounded-t-[28px] sm:rounded-[28px] px-6 sm:px-7 pt-2 sm:pt-6 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] sm:pb-7 shadow-[0_1px_2px_rgba(19,21,21,.03),0_24px_70px_-20px_rgba(19,21,21,.35)] sk-sheet-ios sm:[animation:sk-fade_250ms_ease-out]"
      >
        <div className="sm:hidden flex justify-center pb-3" aria-hidden>
          <span className="w-9 h-[5px] rounded-full bg-step-300" />
        </div>
        <div className="flex items-center justify-between">
          <Wordmark />
          <button aria-label="Close" onClick={onClose} className="w-11 h-11 -mr-2.5 rounded-full hover:bg-alt flex items-center justify-center text-ink-mute hover:text-ink transition-colors duration-150">
            <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" />
            </svg>
          </button>
        </div>
        <h2 id="intro-title" className="mt-4 text-[25px] leading-[29px] font-semibold tracking-[-0.55px]">
          <span className="text-[var(--p-blue-card)]">Try Persona&rsquo;s onboarding.</span>
          <br />
          Right here in the browser.
        </h2>
        <p className="mt-1 text-[13px] leading-[18px] text-ink-mute">a trial demo by Krish, not the real product</p>
        <p id="intro-desc" className="mt-2.5 text-[15px] leading-[23px] text-ink-mute">
          A web version of Persona&rsquo;s onboarding: it texts you, calls you, and gets you set up.
        </p>
        <div className="mt-4 flex items-start gap-2.5 rounded-[16px] bg-alt px-3.5 py-3 text-[14px] leading-5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-[2px] shrink-0 text-ink-mute" aria-hidden>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0014 0M12 18v3" />
          </svg>
          <span>For the call, use Chrome or Edge and allow the mic.</span>
        </div>
        <h3 className="mt-5 text-[12.5px] leading-[18px] font-semibold tracking-[0.09em] uppercase text-ink-mute">3 things to try</h3>
        <ol className="mt-2.5 space-y-2.5">
          {TRY.map(([what, why], i) => (
            <li key={what} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-alt text-[12px] font-semibold flex items-center justify-center">{i + 1}</span>
              <div className="pt-[2px]">
                <div className="text-[15px] leading-5">{what}</div>
                <div className="text-[13px] leading-[18px] text-ink-mute">{why}</div>
              </div>
            </li>
          ))}
        </ol>
        <button
          ref={primaryRef}
          onClick={onClose}
          className="mt-6 w-full h-12 rounded-full bg-ink text-canvas text-[17px] font-medium hover:opacity-90 active:scale-[.99] transition-[background-color,transform] duration-150 ease-[var(--ease-press)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pblue"
        >
          Start texting
        </button>
      </div>
    </div>
  );
}
