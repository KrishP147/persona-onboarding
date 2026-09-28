"use client";
// the email draft as a card: collapsed by default (to, subject, a one-line snippet), expand for the
// full body, edit any of it in place, send with a 5s undo, or discard.
import { useEffect, useRef, useState } from "react";
import type { Session } from "@/lib/types";
import type { Pos, Skin } from "../skins/types";
import type { Chat } from "../useChat";
import { useAutoGrow } from "../skins/shared";

const UNDO_MS = 5000;
export const SEND_TEXT = "yes, send it";

// the chat message that shows the live draft: renders as a card even before gmail is connected
// or with no "to" yet (the card itself gates sending on those, not this).
export function draftMsgId(s: Session | null): string | null {
  const d = s?.draft;
  if (!s || !d) return null;
  const m = s.transcript[d.shownAt - 1];
  return m && m.role === "agent" && /^to:/i.test(m.text) ? m.id : null;
}

type SendStage = "idle" | "counting" | "sending";

const snippetOf = (body: string) => body.replace(/\s+/g, " ").trim();

export function DraftCard({ skin, chat, pos }: { skin: Skin; chat: Chat; pos?: Pos }) {
  const d = chat.session?.draft;
  const gmailOn = chat.session?.slots.gmail.status === "filled";
  const T = skin.rich;
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [eTo, setETo] = useState("");
  const [eSubject, setESubject] = useState("");
  const [eBody, setEBody] = useState("");
  const [stage, setStage] = useState<SendStage>("idle");
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

  const toRef = useAutoGrow(eTo);
  const subjectRef = useAutoGrow(eSubject);
  const bodyRef = useAutoGrow(eBody);

  if (!d) return null;
  const sent = !!d.sent;

  const startEdit = () => {
    setETo(d.to);
    setESubject(d.subject);
    setEBody(d.body);
    setEditing(true);
  };
  const save = () => {
    chat.saveDraftEdit(eTo, eSubject, eBody);
    setEditing(false);
  };

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
      void sendRef.current(SEND_TEXT).finally(() => setStage((st) => (st === "sending" ? "idle" : st)));
    }, 100);
  };
  const undo = () => {
    stop();
    setStage("idle");
  };

  const pill = "h-9 px-4 rounded-full text-[14px] font-medium active:scale-[.98] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 disabled:active:scale-100";
  const text = "h-9 px-3 rounded-full text-[14px] font-medium hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-1";
  const field = "block w-full resize-none bg-transparent outline-none text-[14px] leading-5 border-b pb-1";
  const secs = Math.ceil(left / 1000);
  // who it's going to, then gmail: send only makes sense once both are true
  const sendHint = !d.to ? "who's it to?" : !gmailOn ? "connect gmail to send" : null;

  return (
    <skin.RichCard title={sent ? "Email sent" : "Draft email"} pos={pos}>
      <div className="px-3.5 pt-1 pb-2 border-t text-[13px] leading-[18px]" style={{ borderColor: T.line }}>
        <div className="truncate">
          <span style={{ color: T.mute }}>To </span>
          <span style={{ color: d.to ? T.ink : T.mute }}>{d.to || "not set yet"}</span>
        </div>
        <div className="truncate font-semibold" style={{ color: T.ink }}>
          {d.subject || "(no subject)"}
        </div>
      </div>
      <div className="px-3.5 pb-2.5">
        {editing ? (
          <div className="space-y-2">
            <label className="block text-[11px] uppercase tracking-wide" style={{ color: T.mute }}>
              To
              <textarea ref={toRef} rows={1} value={eTo} onChange={(e) => setETo(e.target.value)} className={field} style={{ color: T.ink, borderColor: T.line }} />
            </label>
            <label className="block text-[11px] uppercase tracking-wide" style={{ color: T.mute }}>
              Subject
              <textarea ref={subjectRef} rows={1} value={eSubject} onChange={(e) => setESubject(e.target.value)} className={field} style={{ color: T.ink, borderColor: T.line }} />
            </label>
            <label className="block text-[11px] uppercase tracking-wide" style={{ color: T.mute }}>
              Body
              <textarea ref={bodyRef} rows={3} value={eBody} onChange={(e) => setEBody(e.target.value)} className={field} style={{ color: T.ink, borderColor: "transparent" }} />
            </label>
          </div>
        ) : (
          <>
            {expanded ? (
              <div className="text-[14px] leading-5 whitespace-pre-line" style={{ color: T.ink }} aria-label="Email body">
                {d.body.replace(/\n\s*\n/g, "\n")}
              </div>
            ) : (
              <div className="truncate text-[14px] leading-5" style={{ color: T.mute }} aria-label="Email preview">
                {snippetOf(d.body) || "(empty)"}
              </div>
            )}
            {!sent && (
              <button className={`${text} -ml-3 mt-0.5`} style={{ color: T.accent, outlineColor: T.accent }} onClick={() => setExpanded((v) => !v)}>
                {expanded ? "Collapse" : "Show full email"}
              </button>
            )}
          </>
        )}
      </div>
      <div className="px-3.5 pt-2 pb-3 border-t" style={{ borderColor: T.line }}>
        {sent ? (
          <div className="text-[13px] leading-[18px]" style={{ color: T.mute }}>
            sent from your gmail.
          </div>
        ) : editing ? (
          <div className="flex items-center gap-2">
            <button className={pill} style={{ background: T.accent, color: T.onAccent, outlineColor: T.accent }} onClick={save}>
              Save
            </button>
            <button className={text} style={{ color: T.mute, outlineColor: T.mute }} onClick={() => setEditing(false)}>
              Cancel
            </button>
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
            <div className="flex items-center gap-2 flex-wrap">
              <button className={pill} style={{ background: T.accent, color: T.onAccent, outlineColor: T.accent }} onClick={start} disabled={!!sendHint}>
                Send
              </button>
              <button className={text} style={{ color: T.accent, outlineColor: T.accent }} onClick={() => setExpanded(false)}>
                Not yet
              </button>
              <button className={text} style={{ color: T.accent, outlineColor: T.accent }} onClick={startEdit}>
                Edit
              </button>
              <button className={text} style={{ color: T.danger, outlineColor: T.danger }} onClick={chat.discardDraft}>
                Discard
              </button>
            </div>
            <div className="mt-1.5 text-[12px] leading-4" style={{ color: T.mute }}>
              {sendHint ?? "nothing happens without your yes."}
            </div>
          </>
        )}
      </div>
    </skin.RichCard>
  );
}
