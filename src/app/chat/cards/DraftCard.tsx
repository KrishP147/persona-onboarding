"use client";
// the email draft as a confirm card: send only on a yes, with 5 seconds to take it back
import { useEffect, useRef, useState } from "react";
import type { Session } from "@/lib/types";
import type { Skin } from "../skins/types";
import type { Chat } from "../useChat";

const UNDO_MS = 5000;
export const SEND_TEXT = "yes, send it";

// the chat message that shows the live draft, when it can be sent from the card
export function draftMsgId(s: Session | null): string | null {
  const d = s?.draft;
  if (!s || !d || !d.to || s.slots.gmail.status !== "filled") return null;
  const m = s.transcript[d.shownAt - 1];
  return m && m.role === "agent" && /^to:/i.test(m.text) ? m.id : null;
}

type Stage = "ask" | "counting" | "sending" | "later";

export function DraftCard({ skin, chat }: { skin: Skin; chat: Chat }) {
  const d = chat.session?.draft;
  const T = skin.rich;
  const [stage, setStage] = useState<Stage>("ask");
  const [left, setLeft] = useState(UNDO_MS);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendRef = useRef(chat.send);
  useEffect(() => {
    sendRef.current = chat.send;
  });
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  // leaving mid-countdown cancels: nothing goes out without the full 5 seconds
  useEffect(() => stop, []);

  if (!d) return null;
  const sent = !!d.sent;

  const start = () => {
    const until = Date.now() + UNDO_MS;
    setLeft(UNDO_MS);
    setStage("counting");
    stop();
    timer.current = setInterval(() => {
      const ms = until - Date.now();
      if (ms > 0) return setLeft(ms);
      stop();
      setStage("sending");
      // a failed send lands back on the card (the text returns to the composer)
      void sendRef.current(SEND_TEXT).finally(() => setStage((st) => (st === "sending" ? "ask" : st)));
    }, 100);
  };
  const undo = () => {
    stop();
    setStage("ask");
  };

  const pill = "h-9 px-4 rounded-full text-[14px] font-medium active:scale-[.98] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2";
  const text = "h-9 px-3 rounded-full text-[14px] font-medium hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-1";
  const secs = Math.ceil(left / 1000);
  const collapsed = stage === "later" && !sent;

  return (
    <skin.RichCard title={sent ? "Email sent" : "Draft email"}>
      <div className="px-3.5 pt-1 pb-2 border-t text-[13px] leading-[18px]" style={{ borderColor: T.line }}>
        <div className="truncate">
          <span style={{ color: T.mute }}>To </span>
          <span style={{ color: T.ink }}>{d.to}</span>
        </div>
        <div className="truncate font-semibold" style={{ color: T.ink }}>
          {d.subject || "(no subject)"}
        </div>
      </div>
      {!collapsed && (
        <div className="px-3.5 pb-2.5">
          {/* padding outside the clamp, so the 6th line can't peek through it */}
          <div className="text-[14px] leading-5 whitespace-pre-line line-clamp-5" style={{ color: T.ink }} aria-label="Email body">
            {d.body.replace(/\n\s*\n/g, "\n")}
          </div>
        </div>
      )}
      <div className="px-3.5 pt-2 pb-3 border-t" style={{ borderColor: T.line }}>
        {sent ? (
          <div className="text-[13px] leading-[18px]" style={{ color: T.mute }}>
            sent from your gmail.
          </div>
        ) : stage === "counting" ? (
          <div aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] leading-5" style={{ color: T.ink }}>
                Sending in {secs}s
              </span>
              <button className={text} style={{ color: T.accent, outlineColor: T.accent }} onClick={undo}>
                Undo
              </button>
            </div>
            <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: T.track }} role="progressbar" aria-label="Time to undo" aria-valuemin={0} aria-valuemax={5} aria-valuenow={secs}>
              <div className="h-full rounded-full" style={{ width: `${(left / UNDO_MS) * 100}%`, background: T.accent, transition: "width 100ms linear" }} />
            </div>
          </div>
        ) : stage === "sending" ? (
          <div className="text-[14px] leading-5" style={{ color: T.mute }} aria-live="polite">
            Sending…
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {collapsed ? (
                <button className={`${text} -ml-3`} style={{ color: T.accent, outlineColor: T.accent }} onClick={() => setStage("ask")}>
                  Review
                </button>
              ) : (
                <>
                  <button className={pill} style={{ background: T.accent, color: T.onAccent, outlineColor: T.accent }} onClick={start}>
                    Send
                  </button>
                  <button className={text} style={{ color: T.accent, outlineColor: T.accent }} onClick={() => setStage("later")}>
                    Not yet
                  </button>
                </>
              )}
            </div>
            <div className="mt-1.5 text-[12px] leading-4" style={{ color: T.mute }}>
              {collapsed ? "not sent. it's here when you want it." : "nothing happens without your yes."}
            </div>
          </>
        )}
      </div>
    </skin.RichCard>
  );
}
