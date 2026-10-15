"use client";
// bring your own keys: the demo runs on the visitor's own provider keys. they stay in this browser.
import { useEffect, useRef, useState } from "react";
import { useKeys, type KeyName, type Keys } from "./keys";

const FIELDS: { name: KeyName; label: string; what: string; href: string; where: string; placeholder: string }[] = [
  { name: "anthropic", label: "Anthropic", what: "the agent's brain (Claude). without it, scripted replies.", href: "https://console.anthropic.com/settings/keys", where: "console.anthropic.com", placeholder: "sk-ant-..." },
  { name: "cartesia", label: "Cartesia", what: "a natural voice on calls. without it, your browser's voice.", href: "https://play.cartesia.ai/keys", where: "play.cartesia.ai", placeholder: "sk_car_..." },
  { name: "browserbase", label: "Browserbase", what: "live web search and page reading. without it, no web.", href: "https://www.browserbase.com/settings", where: "browserbase.com", placeholder: "bb_live_..." },
  { name: "deepgram", label: "Deepgram (optional)", what: "voice notes, and sharper hearing on calls. without it, your browser listens.", href: "https://console.deepgram.com/", where: "console.deepgram.com", placeholder: "" },
];

export function KeyGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3L20 3M16 7l3 3M14 9l2 2" />
    </svg>
  );
}

// top bar pill: shows how many keys are set
export function KeysPill({ onClick }: { onClick: () => void }) {
  const [keys] = useKeys();
  const n = Object.keys(keys).length;
  return (
    <button
      onClick={onClick}
      aria-label={`Your API keys (${n} set)`}
      className="h-9 pl-3 pr-4 rounded-full border border-step-300 bg-canvas text-[14px] font-medium text-ink inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-alt active:scale-[.98] transition-[background-color,transform] duration-150 ease-[var(--ease-press)]"
    >
      <KeyGlyph />
      Keys{n ? ` · ${n}` : ""}
    </button>
  );
}

// no model key anywhere: say so plainly and offer the fix
export function KeyBanner({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="px-4 sm:px-6 pt-2 pb-3 sm:pt-0 flex justify-center font-sans">
      <div role="status" className="max-w-[560px] w-full flex items-center gap-3 rounded-[16px] bg-alt px-4 py-2.5 text-[14px] leading-5 text-ink">
        <span className="shrink-0 text-ink-mute">
          <KeyGlyph size={16} />
        </span>
        <span className="flex-1">
          Running on scripted replies. <span className="text-ink-mute">Add your own Anthropic key to talk to the real agent.</span>
        </span>
        <button onClick={onOpen} className="shrink-0 h-8 px-3.5 rounded-full bg-ink text-canvas text-[13.5px] font-medium hover:opacity-90 active:scale-[.98]">
          Add a key
        </button>
      </div>
    </div>
  );
}

export function KeysPanel({ onClose }: { onClose: () => void }) {
  const [keys, setKeys] = useKeys();
  const [draft, setDraft] = useState<Keys>(keys);
  const [show, setShow] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  const save = () => {
    setKeys(draft);
    onClose();
  };
  const clear = () => {
    setDraft({});
    setKeys({});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center font-sans text-ink" role="presentation">
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-[rgba(19,21,21,.38)] sk-fade" />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="keys-title"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="relative w-full sm:w-[460px] max-h-[92dvh] overflow-y-auto bg-canvas rounded-t-[28px] sm:rounded-[28px] px-6 sm:px-7 pt-2 sm:pt-6 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] sm:pb-7 shadow-[0_1px_2px_rgba(19,21,21,.03),0_24px_70px_-20px_rgba(19,21,21,.35)] sk-sheet-ios sm:[animation:sk-fade_250ms_ease-out]"
      >
        <div className="sm:hidden flex justify-center pb-3" aria-hidden>
          <span className="w-9 h-[5px] rounded-full bg-step-300" />
        </div>
        <div className="flex items-center justify-between">
          <h2 id="keys-title" className="text-[22px] leading-7 font-semibold tracking-[-0.4px]">
            Your API keys
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} className="w-11 h-11 -mr-2.5 rounded-full hover:bg-alt flex items-center justify-center text-ink-mute hover:text-ink transition-colors duration-150">
            <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-[14px] leading-[21px] text-ink-mute">
          This demo runs on your own keys. They stay in this browser (localStorage), are sent only with your own requests, and are never stored on the server. Every field is optional.
        </p>
        <div className="mt-4 space-y-4">
          {FIELDS.map((f, i) => (
            <label key={f.name} className="block">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-medium">{f.label}</span>
                <a href={f.href} target="_blank" rel="noopener noreferrer" title={f.where} className="shrink-0 text-[13px] text-ink-mute underline underline-offset-2 hover:text-ink">
                  get a key
                </a>
              </span>
              <span className="block text-[13px] leading-[18px] text-ink-mute">{f.what}</span>
              <input
                ref={i === 0 ? firstRef : undefined}
                type={show ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                value={draft[f.name] ?? ""}
                onChange={(e) => setDraft({ ...draft, [f.name]: e.target.value })}
                placeholder={f.placeholder || "paste key"}
                className="mt-1.5 w-full h-11 px-3.5 rounded-[12px] border border-step-300 bg-canvas text-[15px] font-mono placeholder:font-sans placeholder:text-ink-faint outline-none focus:border-ink"
              />
            </label>
          ))}
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-[13.5px] text-ink-mute select-none">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show keys
        </label>
        <div className="mt-5 flex gap-2.5">
          <button type="button" onClick={clear} className="h-12 px-5 rounded-full border border-step-300 text-[16px] font-medium hover:bg-alt active:scale-[.99]">
            Clear all
          </button>
          <button type="submit" className="flex-1 h-12 rounded-full bg-ink text-canvas text-[16px] font-medium hover:opacity-90 active:scale-[.99] transition-[background-color,transform] duration-150 ease-[var(--ease-press)]">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
