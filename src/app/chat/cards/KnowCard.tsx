"use client";
// "what i know about you": shown once setup ends, in the phone's own card style. edit or forget any of it.
import { useEffect, useState } from "react";
import type { Msg } from "@/lib/types";
import type { Pos, Skin } from "../skins/types";
import type { Chat } from "../useChat";

type Key = "agentName" | "userName" | "helpNeed" | "gmail";
type Forgettable = Exclude<Key, "agentName">;

const ROWS: { key: Key; label: string; edit?: string; noun: string }[] = [
  {
    key: "agentName",
    label: "My name",
    edit: "actually, call you ",
    noun: "my name",
  },
  {
    key: "userName",
    label: "Your name",
    edit: "actually, call me ",
    noun: "your name",
  },
  {
    key: "helpNeed",
    label: "What you need",
    edit: "what i really need help with is ",
    noun: "what you need",
  },
  { key: "gmail", label: "Gmail", noun: "your gmail" },
];

// prefill the composer and put the cursor at the end, nothing is sent
function prefill(chat: Chat, text: string) {
  chat.setDraft(text);
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLInputElement>(".phone-screen input[aria-label='Message']");
    if (!el) return;
    el.focus();
    el.setSelectionRange(text.length, text.length);
  });
}

function valueOf(chat: Chat, key: Key): string | null {
  const s = chat.session;
  if (!s) return null;
  const slot = s.slots[key];
  if (key === "gmail") return slot.status === "filled" ? (s.gmailEmail ?? slot.value ?? "connected") : null;
  if (key === "agentName" && !slot.value && s.agentNameDefaulted) return "Persona";
  return slot.status === "filled" || slot.value ? slot.value : null;
}

export function KnowCard({ skin, chat, setupMs, pos }: { skin: Skin; chat: Chat; setupMs?: number | null; pos?: Pos }) {
  const [confirm, setConfirm] = useState<Forgettable | null>(null);
  const T = skin.rich;
  const alerts = (chat.session?.alerts ?? []).slice(0, 3);
  const btn = "min-h-9 px-2 -mx-0.5 text-[14px] font-medium rounded-md hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-1";

  return (
    <skin.RichCard title="What I know about you" pos={pos}>
      <ul>
        {ROWS.map((r) => {
          const v = valueOf(chat, r.key);
          const asking = confirm === r.key;
          return (
            <li key={r.key} className="px-3.5 py-2 border-t" style={{ borderColor: T.line }}>
              <div className="flex flex-wrap items-start gap-x-2">
                <div className={`flex-1 min-w-0 ${r.key === "gmail" ? "min-w-fit max-w-full" : ""}`}>
                  <div className="text-[12px] leading-4" style={{ color: T.mute }}>
                    {r.label}
                  </div>
                  <div className={`text-[15px] leading-5 ${r.key === "gmail" ? "truncate" : "break-words"}`} title={r.key === "gmail" && v ? v : undefined} style={{ color: v ? T.ink : T.mute }}>
                    {v ?? "not shared"}
                  </div>
                </div>
                {!asking && (
                  <div className="ml-auto flex items-center gap-2 shrink-0 -mr-1">
                    <button
                      className={btn}
                      style={{ color: T.accent, outlineColor: T.accent }}
                      aria-label={`Edit ${r.noun}`}
                      onClick={() => (r.key === "gmail" ? chat.connectGmail() : prefill(chat, r.edit!))}
                    >
                      {r.key === "gmail" ? (v ? "Reconnect" : "Connect") : "Edit"}
                    </button>
                    {r.key !== "agentName" && v && (
                      <button className={btn} style={{ color: T.danger, outlineColor: T.danger }} aria-label={`Forget ${r.noun}`} onClick={() => setConfirm(r.key as Forgettable)}>
                        Forget
                      </button>
                    )}
                  </div>
                )}
              </div>
              {asking && (
                <div role="group" aria-label={`Forget ${r.noun}?`} className="mt-1 flex items-center gap-2">
                  <span className="flex-1 text-[14px] leading-5" style={{ color: T.ink }}>
                    forget {r.noun}?
                  </span>
                  <button
                    autoFocus
                    className={`${btn} font-semibold`}
                    style={{ color: T.danger, outlineColor: T.danger }}
                    onClick={() => {
                      setConfirm(null);
                      chat.forgetSlot(r.key as Forgettable);
                    }}
                  >
                    yes
                  </button>
                  <button className={btn} style={{ color: T.accent, outlineColor: T.accent }} onClick={() => setConfirm(null)}>
                    cancel
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {alerts.length > 0 && (
        <div className="px-3.5 py-2.5 border-t" style={{ borderColor: T.line }}>
          <div className="text-[12px] leading-4" style={{ color: T.mute }}>
            {alerts.length === 1 ? "First thing I'd do" : `${alerts.length} things I'd do first`}
          </div>
          <ol className="mt-1 space-y-1.5">
            {alerts.map((a) => (
              <li key={a.id} className="text-[14px] leading-5">
                <span className="font-semibold" style={{ color: T.ink }}>
                  {a.from}
                </span>
                <span style={{ color: T.ink }}> · {a.subject}</span>
                <div className="text-[13px] leading-[18px]" style={{ color: T.mute }}>
                  {a.reason}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="px-3.5 pt-2 pb-3 border-t text-[12px] leading-4 flex justify-between gap-2" style={{ borderColor: T.line, color: T.mute }}>
        <span>yours to delete. gone means gone.</span>
        {setupMs != null && <span className="shrink-0 tabular-nums">setup {clock(setupMs)}</span>}
      </div>
    </skin.RichCard>
  );
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const anchorKey = (sid: string) => `persona-grad-anchor:${sid}`;
function readAnchor(sid: string | undefined) {
  if (!sid) return null;
  try {
    return localStorage.getItem(anchorKey(sid));
  } catch {
    return null;
  }
}

// where the card sits: after the turn that ended setup (seen live), else pinned at the end.
// at: thread index to render after, -1 for the end, null when not graduated.
// setupMs: first text from them to setup ending, when the turn that ended it is known.
export function useGradSlot(chat: Chat, thread: Msg[]): { at: number | null; setupMs: number | null } {
  const phase = chat.session?.phase;
  const sid = chat.session?.id;
  const [prev, setPrev] = useState(phase);
  const [live, setLive] = useState<string | null>(null);
  if (phase !== prev) {
    setPrev(phase);
    // a live switch to graduated: anchor on the text that did it
    if (phase === "graduated" && prev && prev !== "graduated") setLive([...thread].reverse().find((m) => m.role === "user")?.id ?? null);
  }
  useEffect(() => {
    if (!live || !sid) return;
    try {
      localStorage.setItem(anchorKey(sid), live);
    } catch {}
  }, [live, sid]);
  if (phase !== "graduated") return { at: null, setupMs: null };
  const anchor = live ?? readAnchor(sid);
  const i = anchor ? thread.findIndex((m) => m.id === anchor) : -1;
  if (i < 0) return { at: -1, setupMs: null };
  // after that turn's replies, before their next text
  let j = i;
  while (j + 1 < thread.length && thread[j + 1].role !== "user") j++;
  const start = thread.find((m) => m.role === "user")?.ts;
  const end = (thread[i + 1] ?? thread[i]).ts;
  return { at: j === thread.length - 1 ? -1 : j, setupMs: start != null && end >= start ? end - start : null };
}
