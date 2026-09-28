"use client";
// phone: a half-height sheet with one turn's card. ios grabber sheet or m3 bottom sheet, per skin.
import { useEffect, useRef, useState } from "react";
import type { Skin } from "../skins/types";
import { PIPELINE, type Turn } from "./frameworks";

export function WhySheet({ skin, turns, id, onNav, onClose }: { skin: Skin; turns: Turn[]; id: string; onNav: (id: string) => void; onClose: () => void }) {
  const i = turns.findIndex((t) => t.m.id === id);
  const t = turns[i];
  const [how, setHow] = useState(false);
  const headRef = useRef<HTMLHeadingElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const ios = skin.sheet === "ios";
  const c = skin.why;

  useEffect(() => {
    headRef.current?.focus({ preventScroll: true });
  }, []);

  const go = (d: number) => {
    const j = i + d;
    if (j >= 0 && j < turns.length) onNav(turns[j].m.id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!t) return null;
  const shell = ios
    ? { left: 8, right: 8, bottom: 8, borderRadius: 38, background: c.surface, boxShadow: "0 10px 40px rgba(0,0,0,.18), 0 0 0 .5px rgba(0,0,0,.06)", backdropFilter: "blur(30px) saturate(180%)", WebkitBackdropFilter: "blur(30px) saturate(180%)" }
    : { left: 0, right: 0, bottom: 0, borderRadius: "28px 28px 0 0", background: c.surface, boxShadow: "0 -4px 24px rgba(0,0,0,.18)" };
  const navBtn = "w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-30";
  return (
    <section
      role="region"
      aria-label="Why this reply"
      className={`absolute z-40 h-[50%] flex flex-col ${ios ? "sk-sheet-ios" : "sk-sheet-m3"}`}
      style={{ ...shell, color: c.ink }}
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const s = touch.current;
        touch.current = null;
        if (!s) return;
        const dx = e.changedTouches[0].clientX - s.x;
        const dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
        else if (dy > 70 && Math.abs(dy) > Math.abs(dx)) onClose();
      }}
    >
      {/* grabber: tap to close (swipe down works too) */}
      <button onClick={onClose} aria-label="Close" className="h-5 shrink-0 flex items-start justify-center pt-[6px]">
        <span className="rounded-full" style={ios ? { width: 36, height: 5, background: "rgba(60,60,67,.3)" } : { width: 32, height: 4, background: c.mute, opacity: 0.5 }} />
      </button>
      <div className="flex items-center gap-1 px-3">
        <button className={navBtn} onClick={() => go(-1)} disabled={i === 0} aria-label="Previous turn">
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M8 2 2 8l6 6" />
          </svg>
        </button>
        <h2 ref={headRef} tabIndex={-1} className="flex-1 text-center text-[15px] font-semibold outline-none" aria-live="polite">
          Turn {t.n} of {turns.length}
        </h2>
        <button className={navBtn} onClick={() => go(1)} disabled={i === turns.length - 1} aria-label="Next turn">
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m2 2 6 6-6 6" />
          </svg>
        </button>
        <button className={`${navBtn} ${ios ? "" : ""}`} onClick={onClose} aria-label="Close why" style={ios ? { background: "rgba(120,120,128,.12)" } : undefined}>
          <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-5 pt-1">
        <div className="flex items-center gap-2 text-[12px]">
          <span className="w-2 h-2 rounded-full" style={{ background: t.fw.color }} aria-hidden />
          <span className="font-semibold" style={{ color: t.fw.color }}>
            {t.fw.label}
          </span>
          {t.m.channel === "voice" && <span style={{ color: c.mute }}>· on the call</span>}
        </div>
        <div className="mt-1.5 text-[18px] leading-6 font-semibold tracking-[-0.2px]">{t.move.label}</div>
        <p className="mt-2 text-[14px] leading-5" style={{ color: c.mute }}>
          &ldquo;{t.m.text}&rdquo;
        </p>
        <p className="mt-3 text-[14px] leading-5">{t.fw.gist}</p>
        <p className="mt-2 text-[12.5px] leading-[18px] italic" style={{ color: c.mute }}>
          {t.move.source}
        </p>
        <p className="mt-2 text-[12px] leading-4" style={{ color: c.mute }}>
          traced: code picked this move; the model wrote the words.
        </p>
        <button onClick={() => setHow((v) => !v)} aria-expanded={how} aria-controls="sheet-how" className="mt-3 min-h-11 text-[14px] font-medium flex items-center gap-1" style={{ color: ios ? "#0088FF" : skin.id === "galaxy" ? "#3E91FF" : "#A8C7FA" }}>
          How it decides
          <svg width="10" height="10" viewBox="0 0 10 10" className={how ? "rotate-180" : ""} aria-hidden>
            <path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        {how && (
          <ol id="sheet-how" className="space-y-2 pb-2">
            {PIPELINE.map(([title, detail], k) => (
              <li key={title} className="flex gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full text-[11px] font-semibold flex items-center justify-center" style={{ background: c.line }}>
                  {k + 1}
                </span>
                <div>
                  <div className="text-[14px] leading-5">{title}</div>
                  <div className="text-[12px] leading-4" style={{ color: c.mute }}>
                    {detail}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
