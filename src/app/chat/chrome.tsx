"use client";
// page chrome around the phone, in persona's own design language (docs/design/persona-site.md)
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { SKIN_IDS, type SkinId } from "./skins/types";
import { MapGlyph } from "./why/ReasoningMap";
import { Mark } from "@/components/landing/svgs";
import { ThemeToggle } from "@/components/ThemeToggle";

const LABEL: Record<SkinId, string> = { iphone: "iPhone", pixel: "Pixel", galaxy: "Galaxy" };

// tight: the top bar below md keeps just the mark (the name stays for screen readers)
export function Wordmark({ tight = false }: { tight?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 text-ink" aria-label="Persona home">
      {/* the mark in currentColor, so it flips with the theme */}
      <Mark className="w-[22px] h-[22px]" />
      <span className={`text-[20px] font-semibold tracking-[-0.2px] ${tight ? "max-md:sr-only" : ""}`}>Persona</span>
    </Link>
  );
}

// tiny phone outlines: notch island, centered hole, and a slimmer hole
function Glyph({ id }: { id: SkinId }) {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden>
      <rect x=".75" y=".75" width="8.5" height="14.5" rx={id === "iphone" ? 2.6 : id === "pixel" ? 2.2 : 1.8} stroke="currentColor" strokeWidth="1.3" />
      {id === "iphone" ? <rect x="3.4" y="2.3" width="3.2" height="1.1" rx=".55" fill="currentColor" /> : <circle cx="5" cy="2.8" r={id === "pixel" ? 0.8 : 0.65} fill="currentColor" />}
    </svg>
  );
}

export function PhonePicker({ value, onChange, size = "md" }: { value: SkinId | null; onChange: (id: SkinId) => void; size?: "md" | "lg" }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  return (
    <div role="radiogroup" aria-label="Phone" className={`inline-flex p-1 rounded-full bg-alt ${size === "lg" ? "w-full" : ""}`}>
      {SKIN_IDS.map((id, i) => {
        const on = value === id;
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[id] = el;
            }}
            role="radio"
            aria-checked={on}
            tabIndex={on || (!value && i === 0) ? 0 : -1}
            onClick={() => onChange(id)}
            onKeyDown={(e) => {
              const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
              if (!d) return;
              e.preventDefault();
              const next = SKIN_IDS[(i + d + SKIN_IDS.length) % SKIN_IDS.length];
              onChange(next);
              refs.current[next]?.focus();
            }}
            className={`flex items-center justify-center gap-1.5 rounded-full font-medium transition-[background-color,color,box-shadow] duration-150 ease-[var(--ease-press)] ${size === "lg" ? "flex-1 h-10 text-[15px]" : "h-8 px-3.5 text-[14px]"} ${on ? "bg-canvas dark:bg-step-300 text-ink shadow-[0_1px_2px_rgba(0,0,0,.08),0_2px_8px_-2px_rgba(0,0,0,.08)]" : "text-ink-mute hover:text-ink"}`}
          >
            <Glyph id={id} />
            {LABEL[id]}
          </button>
        );
      })}
    </div>
  );
}

export function Pill({ children, onClick, pressed }: { children: ReactNode; onClick: () => void; pressed?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={pressed}
      className="h-9 px-4 rounded-full border border-step-300 bg-canvas text-[14px] font-medium text-ink hover:bg-alt active:scale-[.98] transition-[background-color,transform] duration-150 ease-[var(--ease-press)]"
    >
      {children}
    </button>
  );
}

export function TopBar({ skin, setSkin, pill, onRestart, mock }: { skin: SkinId | null; setSkin: (id: SkinId) => void; pill: ReactNode; onRestart: () => void; mock: boolean }) {
  return (
    <nav aria-label="Page" className="hidden sm:grid grid-cols-[1fr_auto_1fr] items-center h-16 px-6">
      <div className="flex items-center gap-3">
        <Wordmark tight />
        {mock && <span className="hidden lg:inline whitespace-nowrap text-[12.5px] text-ink-mute bg-alt rounded-full px-2.5 py-0.5">mock mode</span>}
      </div>
      <PhonePicker value={skin} onChange={setSkin} />
      <div className="flex justify-end items-center gap-2">
        {/* sm..lg: no margin beside the phone, so the reasoning pill lives here */}
        <span data-rz-pill className="lg:hidden">
          {pill}
        </span>
        <Pill onClick={onRestart}>Restart</Pill>
        <ThemeToggle />
      </div>
    </nav>
  );
}

// phones: the menu is a bottom sheet with the phone picker, the reasoning switch and restart
export function MenuSheet({ skin, setSkin, canReason, onReasoning, onRestart, onClose, mock }: { skin: SkinId | null; setSkin: (id: SkinId) => void; canReason: boolean; onReasoning: () => void; onRestart: () => void; onClose: () => void; mock: boolean }) {
  const headRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sm:hidden fixed inset-0 z-40 font-sans" role="dialog" aria-modal="true" aria-labelledby="menu-title">
      <button aria-label="Close menu" onClick={onClose} className="absolute inset-0 bg-black/30 sk-fade" />
      <div className="absolute inset-x-2 bottom-2 max-h-[88dvh] overflow-y-auto rounded-[32px] bg-canvas text-ink px-5 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] shadow-[0_24px_70px_-20px_rgba(19,21,21,.35)] sk-sheet-ios">
        <div className="flex justify-center pb-2" aria-hidden>
          <span className="w-9 h-[5px] rounded-full bg-step-300" />
        </div>
        <div className="flex items-center justify-between mb-4">
          <Wordmark />
          <button aria-label="Close menu" onClick={onClose} className="w-11 h-11 -mr-2 rounded-full hover:bg-alt flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" />
            </svg>
          </button>
        </div>
        <h2 id="menu-title" ref={headRef} tabIndex={-1} className="text-[12.5px] font-semibold tracking-[0.09em] uppercase text-ink-mute mb-2 outline-none">
          Phone
        </h2>
        <PhonePicker value={skin} onChange={setSkin} size="lg" />
        {/* reasoning lives outside the thread: this opens the map sheet on the latest turn */}
        <button onClick={onReasoning} disabled={!canReason} className="mt-5 w-full min-h-11 flex items-center justify-between gap-4 text-left disabled:opacity-50">
          <span className="flex items-center gap-3">
            <MapGlyph />
            <span>
              <span className="block text-[15px] font-medium">Examine reasoning</span>
              <span className="block text-[13px] text-ink-mute">{canReason ? "why it said what it said, turn by turn" : "shows up once it has replied"}{mock ? " · mock mode" : ""}</span>
            </span>
          </span>
          <span aria-hidden className="text-ink-mute">›</span>
        </button>
        <div className="mt-5 flex items-center justify-between">
          <span className="text-[15px] font-medium">Appearance</span>
          <ThemeToggle />
        </div>
        <button onClick={onRestart} className="mt-6 w-full h-12 rounded-full bg-ink text-canvas text-[16px] font-medium active:scale-[.99]">
          Restart conversation
        </button>
      </div>
    </div>
  );
}
