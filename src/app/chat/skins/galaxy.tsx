"use client";
// samsung messages on one ui 8, light + dark. see docs/design/phone-ui-spec.md "fidelity pass / galaxy"
import type { CSSProperties, ReactNode } from "react";
import type { BubbleProps, CallProps, ComposerProps, HeaderProps, Pos, RichCardProps, Skin, UnknownProps } from "./types";
import { AGENT_NUMBER, BubbleBody, BubbleIcon, GoogleG, MicIcon, PauseIcon, PersonaLogo, PersonSilhouette, PhoneIcon, RecTimer, callLog, eventKind, time, useClock, useElapsed } from "./shared";

// colors are --sam-* vars on .sk-sam (globals.css), light + dark
const C = {
  bg: "var(--sam-bg)",
  sent: "var(--sam-sent)",
  sentInk: "var(--sam-sent-ink)",
  recv: "var(--sam-recv)",
  recvInk: "var(--sam-recv-ink)",
  card: "var(--sam-card)",
  ink: "var(--sam-ink)",
  mute: "var(--sam-mute)",
  icon: "var(--sam-icon)",
  accent: "var(--sam-accent)",
  red: "var(--sam-red)",
  green: "var(--sam-green)",
  line: "var(--sam-line)",
};

function corners(mine: boolean, pos: Pos): CSSProperties {
  const r = 22;
  const s = 6;
  const top = pos === "middle" || pos === "last" ? s : r;
  const bot = pos === "first" || pos === "middle" ? s : r;
  return mine ? { borderRadius: `${r}px ${top}px ${bot}px ${r}px` } : { borderRadius: `${top}px ${r}px ${r}px ${bot}px` };
}
const gapOf = (pos: Pos) => (pos === "single" || pos === "first" ? "pt-[14px]" : "pt-[3px]");

function StatusBar() {
  const t = useClock();
  return (
    <div className="sk-sam absolute inset-x-0 top-0 z-30 h-10 flex items-center px-[18px] text-[14px] font-medium text-[var(--sam-ink)] pointer-events-none" aria-hidden>
      <span className="pt-[2px]">{t}</span>
      <span className="flex-1" />
      <span className="flex items-center gap-[5px] pt-[2px]">
        <svg width="14" height="11" viewBox="0 0 14 11" fill="currentColor">
          <rect x="0" y="7" width="2.5" height="4" rx=".6" />
          <rect x="3.8" y="5" width="2.5" height="6" rx=".6" />
          <rect x="7.6" y="2.5" width="2.5" height="8.5" rx=".6" />
          <rect x="11.4" y="0" width="2.5" height="11" rx=".6" />
        </svg>
        <svg width="14" height="11" viewBox="0 0 24 18" fill="currentColor">
          <path d="M12 18l3.5-4.2a5.5 5.5 0 0 0-7 0zM4.2 9.9l2.3 2.7a8.5 8.5 0 0 1 11 0l2.3-2.7a12 12 0 0 0-15.6 0zM0 4.8l2.3 2.7a15 15 0 0 1 19.4 0L24 4.8a18.6 18.6 0 0 0-24 0z" />
        </svg>
        <span className="text-[12px] ml-0.5">87%</span>
        <svg width="10" height="15" viewBox="0 0 10 15" fill="none">
          <rect x=".6" y="1.6" width="8.8" height="12.8" rx="2" stroke="currentColor" strokeWidth="1.2" />
          <rect x="3" y="0" width="4" height="1.6" rx=".5" fill="currentColor" />
          <rect x="2.2" y="4.5" width="5.6" height="8.4" rx="1" fill="currentColor" />
        </svg>
      </span>
    </div>
  );
}

function UnknownAvatar({ size }: { size: number }) {
  return (
    <div className="rounded-full flex items-end justify-center overflow-hidden shrink-0" style={{ width: size, height: size, background: "var(--sam-unknown)" }} aria-hidden>
      <PersonSilhouette size={size * 0.74} color="var(--sam-unknown-ink)" />
    </div>
  );
}

// one ui app bar: flat on the thread ground. back chevron, avatar, bold name with the chevron that
// opens the contact menu, call, overflow. no floating pills (those belong to the list screen)
function Header({ name, saved, onCall, callDisabled, onMenu }: HeaderProps) {
  const btn = "w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40 hover:bg-[var(--sam-hover)]";
  return (
    <div className="absolute inset-x-0 top-0 z-20" style={{ background: C.bg }}>
      <header className="relative flex items-center gap-1 pl-1.5 pr-2 h-16 mt-[var(--sb)]" style={{ color: C.icon }}>
        <span className={`${btn} hidden sm:flex`} aria-hidden>
          <svg width="10" height="18" viewBox="0 0 10 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.5 1.5 1.5 9l7 7.5" />
          </svg>
        </span>
        <button aria-label="Menu" onClick={onMenu} className={`${btn} sm:hidden`}>
          <svg width="18" height="14" viewBox="0 0 18 14" fill="currentColor" aria-hidden>
            <rect y="0" width="18" height="2" rx="1" />
            <rect y="6" width="18" height="2" rx="1" />
            <rect y="12" width="18" height="2" rx="1" />
          </svg>
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2.5 pl-1">
          {saved ? <span className="rounded-full shadow-[0_0_0_1px_var(--sam-line)] shrink-0"><PersonaLogo size={34} /></span> : <UnknownAvatar size={34} />}
          <div className={`min-w-0 truncate ${saved ? "text-[19px]" : "text-[17px]"} leading-6 font-bold`} style={{ color: C.ink }}>
            {name}
          </div>
          <svg width="11" height="7" viewBox="0 0 11 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
            <path d="M1 1.2 5.5 5.7 10 1.2" />
          </svg>
        </div>
        <button aria-label="Call" disabled={callDisabled} onClick={onCall} className={btn}>
          <PhoneIcon size={21} />
        </button>
        <span className={btn} aria-hidden>
          <svg width="4" height="18" viewBox="0 0 4 18" fill="currentColor">
            <circle cx="2" cy="2" r="1.8" />
            <circle cx="2" cy="9" r="1.8" />
            <circle cx="2" cy="16" r="1.8" />
          </svg>
        </span>
      </header>
    </div>
  );
}

// samsung dates the thread, not each burst: times sit beside the bubbles instead
function DateStamp({ ts, first }: { ts: number; first: boolean }) {
  if (!first) return null;
  const d = new Date(ts).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  return <div className="text-center text-[12px] leading-4 pt-4 pb-2" style={{ color: C.mute }}>{d}</div>;
}

const RECEIPT_WORD = { sent: "Sent", delivered: "Delivered", seen: "Read" } as const;

function Bubble({ m, mine, pos, reaction, receipt, highlight, showTime }: BubbleProps) {
  const side = (showTime || receipt) && (
    <span className={`self-end shrink-0 text-[11px] leading-[14px] pb-[2px] flex flex-col ${mine ? "items-end" : "items-start"}`} style={{ color: C.mute }}>
      {receipt && (
        <span aria-label={receipt}>
          {RECEIPT_WORD[receipt]}
        </span>
      )}
      {showTime && <span>{time(m.ts)}</span>}
    </span>
  );
  return (
    <div data-role={m.role} className={`${gapOf(pos)} flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"} ${reaction ? "pb-4" : ""}`}>
      {mine && side}
      <div
        className="relative max-w-[72%] px-[14px] py-[10px] text-[16px] leading-[22px] whitespace-pre-wrap break-words"
        style={{ ...corners(mine, pos), background: mine ? C.sent : C.recv, color: mine ? C.sentInk : C.recvInk, outline: highlight ? `2px solid ${highlight}` : "2px solid transparent", outlineOffset: 2 }}
      >
        <BubbleBody m={m} voice={mine ? { knob: "bg-[var(--sam-knob)]", bar: "bg-white/70", ink: "text-white/80" } : { knob: "bg-[var(--sam-knob-recv)]", bar: "bg-[var(--sam-mute)]", ink: "text-[var(--sam-mute)]" }} />
        {reaction && (
          <span className="absolute -bottom-[18px] right-2 h-[22px] px-1.5 rounded-full flex items-center text-[13px] bg-[var(--sam-chip)] border border-[var(--sam-chip-rim)]" aria-label="reaction">
            {reaction}
          </span>
        )}
      </div>
      {!mine && side}
    </div>
  );
}

function Typing() {
  return (
    <div className="pt-[14px]">
      <div className="w-14 h-9 rounded-[22px] flex items-center justify-center gap-[5px]" style={{ background: C.recv }} role="status" aria-label="typing">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-[6px] h-[6px] rounded-full sk-wave" style={{ background: C.mute, animationDelay: `${i * 140}ms` }} />
        ))}
      </div>
    </div>
  );
}

function Composer({ draft, setDraft, onSubmit, onAttach, canSend, recording, transcribing, onMic, hint }: ComposerProps) {
  return (
    <form
      className="flex items-center gap-2 px-2 pt-2 pb-[calc(var(--sb-bottom)+8px)]"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <button type="button" aria-label="Attach" onClick={onAttach} className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center hover:bg-[var(--sam-hover)]" style={{ color: C.icon }}>
        <svg width="22" height="22" viewBox="0 0 22 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M11 3v16M3 11h16" />
        </svg>
      </button>
      <div className="flex-1 min-w-0 h-11 rounded-full bg-[var(--sam-field)] flex items-center pl-4 pr-1.5">
        {recording ? (
          <span className="flex-1 flex items-center gap-2 text-[16px]" style={{ color: C.red }}>
            <span className="w-2 h-2 rounded-full sk-pulse" style={{ background: C.red }} />
            <RecTimer startedAt={recording.startedAt} />
          </span>
        ) : (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={hint ?? "Enter message"}
            aria-label="Message"
            className="flex-1 min-w-0 bg-transparent outline-none text-[16px] placeholder:text-[var(--sam-placeholder)]"
            style={{ color: C.ink }}
          />
        )}
        <span className="w-9 h-9 flex items-center justify-center" style={{ color: C.icon }} aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" />
            <circle cx="9" cy="10" r="1" fill="currentColor" />
            <circle cx="15" cy="10" r="1" fill="currentColor" />
            <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" strokeLinecap="round" />
          </svg>
        </span>
        <button
          type="button"
          aria-label={recording ? "Stop and send voice note" : "Record a voice note"}
          onClick={onMic}
          disabled={transcribing}
          className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-60"
          style={recording ? { background: C.red, color: "#fff" } : { color: C.icon }}
        >
          {recording ? (
            <span className="w-2.5 h-2.5 rounded-[2px] bg-white" aria-hidden />
          ) : transcribing ? (
            <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />
          ) : (
            <MicIcon size={21} stroke={1.8} />
          )}
        </button>
      </div>
      <button type="submit" aria-label="Send" disabled={!canSend} className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-white transition-colors" style={{ background: canSend ? C.sent : "var(--sam-send-off)" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M3 20.5 21 12 3 3.5l.01 6.6L15 12 3.01 13.9z" />
        </svg>
      </button>
    </form>
  );
}

function EventRow({ text }: { text: string }) {
  const k = eventKind(text);
  if (k === "hidden") return null;
  if (k === "plain") return <div className="text-center text-[12px] leading-4 py-2" style={{ color: C.mute }}>{text}</div>;
  const c = callLog(text);
  return (
    <div className="flex justify-center py-3">
      <div className="flex items-center gap-2 text-[12px] leading-4 bg-[var(--sam-card)] rounded-full px-3 py-1.5" style={{ color: C.mute }}>
        <span style={{ color: c.declined ? C.red : C.green }}>
          <PhoneIcon size={14} down={c.declined} />
        </span>
        {c.declined ? "Declined call" : `Voice call${c.ended ? ` · ${c.dur}` : ""}`}
      </div>
    </div>
  );
}

function Card({ pos, children, footer, onClick, disabled, href }: { pos: Pos; children: ReactNode; footer: ReactNode; onClick?: () => void; disabled?: boolean; href?: string }) {
  const cls = "block w-[72%] overflow-hidden rounded-[20px] bg-[var(--sam-card)] text-left";
  const body = (
    <>
      {children}
      <div className="px-4 py-3">{footer}</div>
    </>
  );
  return (
    <div data-role="agent" className={`${gapOf(pos)} flex justify-start`}>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className={cls}>
          {body}
        </a>
      ) : (
        <button onClick={onClick} disabled={disabled} className={`${cls} disabled:cursor-default`}>
          {body}
        </button>
      )}
    </div>
  );
}

function GmailCard({ connected, onConnect, pos }: { connected: boolean; onConnect: () => void; pos: Pos }) {
  return (
    <Card
      pos={pos}
      onClick={onConnect}
      disabled={connected}
      footer={
        <>
          <div className="text-[14px] leading-5 font-semibold" style={{ color: C.ink }}>{connected ? "Google connected ✓" : "Connect your Google account"}</div>
          <div className="text-[12px] leading-4" style={{ color: C.mute }}>app.yourpersona.com</div>
        </>
      }
    >
      <div className="relative h-36 bg-gradient-to-b from-[#c9d3d6] via-[#dfe3df] to-[#b7bfb4] text-[#1f2420] px-4 pt-3">
        <div className="text-[11px] font-semibold tracking-wide opacity-70">Persona</div>
        <div className="font-serif text-xl leading-snug mt-3">One tap to a quieter life</div>
        <div className="absolute bottom-3 left-4 flex items-center gap-1.5 bg-white rounded-full px-3 py-1 text-xs font-medium shadow-sm">
          <GoogleG /> Connect with Google
        </div>
      </div>
    </Card>
  );
}

function LinkPreview({ url, pos }: { url: string; pos: Pos }) {
  return (
    <Card
      pos={pos}
      href={`https://${url}`}
      footer={
        <>
          <div className="text-[14px] leading-5 font-semibold" style={{ color: C.ink }}>Terms, SMS Terms and Privacy Policy</div>
          <div className="text-[12px] leading-4" style={{ color: C.mute }}>{url}</div>
        </>
      }
    >
      <div className="h-20 bg-gradient-to-br from-[#eef0ee] to-[#d3d9d0] flex items-center gap-2 px-4 text-[#1f2420]">
        <PersonaLogo size={28} /> <span className="font-semibold">Persona</span>
      </div>
    </Card>
  );
}

function ContactCard({ name, saved, onSave, pos }: { name: string; saved: boolean; onSave: () => void; pos: Pos }) {
  return (
    <div data-role="agent" className={`${gapOf(pos)} flex justify-start`}>
      <div className="w-[72%] bg-[var(--sam-card)] rounded-[20px] overflow-hidden" style={{ color: C.ink }}>
        <div className="flex items-center gap-3 px-3 py-3">
          <div className="w-10 h-10 rounded-full bg-[#F8B26A] flex items-center justify-center text-[17px] font-semibold text-white shrink-0">{name.charAt(0).toUpperCase()}</div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold truncate">{name}</div>
            <div className="text-[12px]" style={{ color: C.mute }}>{AGENT_NUMBER}</div>
          </div>
        </div>
        <button onClick={onSave} disabled={saved} className="w-full border-t border-[var(--sam-line)] py-2.5 text-[14px] font-semibold" style={{ color: saved ? C.green : C.accent }}>
          {saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}

// rich card: one ui white card with a title row
function RichCard({ title, children, pos = "single" }: RichCardProps) {
  return (
    <div data-role="agent" className={`${gapOf(pos)} flex justify-start`}>
      <section aria-label={title} className="w-[84%] bg-[var(--sam-card)] rounded-[20px] overflow-hidden" style={{ color: C.ink }}>
        <div className="px-4 pt-3 pb-1 text-[12px] leading-4 font-semibold" style={{ color: C.mute }}>
          {title}
        </div>
        {children}
      </section>
    </div>
  );
}

function Media({ src }: { src: string }) {
  return (
    <div data-role="agent" className="pt-[14px] flex justify-start">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="animated reaction" className="rounded-[18px] max-w-[60%] max-h-48 object-cover bg-[var(--sam-card)]" loading="lazy" />
    </div>
  );
}

function Banner({ tone, children }: { tone: "info" | "error"; children: ReactNode }) {
  return (
    <div className="mx-3 mb-1 rounded-2xl px-4 py-2.5 text-[13px] leading-[18px]" style={tone === "error" ? { background: "var(--sam-err-bg)", color: "var(--sam-err-ink)" } : { background: C.card, color: "var(--sam-info-ink)" }}>
      {children}
    </div>
  );
}

// samsung messages: the unknown-number bar is "add to contacts | block". block has no meaning here,
// so the bar keeps add to contacts and a close
function UnknownNotice({ onAdd, onDismiss }: UnknownProps) {
  return (
    <div className="mx-1 mt-4 mb-1 rounded-[20px] flex items-stretch overflow-hidden" style={{ background: C.card }} role="region" aria-label="Unknown sender">
      <button type="button" onClick={onAdd} className="flex-1 h-12 text-[15px] font-semibold" style={{ color: C.accent }}>
        Add to contacts
      </button>
      <span className="w-px my-3" style={{ background: C.line }} aria-hidden />
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="w-14 h-12 flex items-center justify-center" style={{ color: C.mute }}>
        <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" />
        </svg>
      </button>
    </div>
  );
}

// samsung phone, one ui 8: small status line, huge bold name, "Mobile <number>" over the call
// background; controls are icon + label (no circles) in a rounded dark panel with the red end
// circle inside it. dark in both themes, like the call background
function CallScreen(p: CallProps) {
  const timer = useElapsed(p.startedAt);
  const holdTimer = useElapsed(p.heldAt ?? null);
  const state = p.held ? "" : p.muted ? "muted" : p.speaking ? "speaking" : p.listening ? "listening" : "";
  const tile = "w-[76px] h-14 rounded-[18px] flex items-center justify-center transition-colors";
  return (
    <div
      className="sk-sam relative h-full w-full flex flex-col items-center text-white"
      style={{ background: "var(--sam-call-bg)", fontFamily: "var(--font-samsung)" }}
      role={p.status === "ringing" ? "alertdialog" : undefined}
      aria-label={p.status === "ringing" ? `Incoming call from ${p.name}` : "Call"}
    >
      <div className="pt-[calc(var(--sb)+44px)] text-center px-6 w-full">
        <div className="h-6 flex items-center justify-center gap-2 text-[16px] text-white/90" role="status">
          {p.status !== "ended" && <PhoneIcon size={17} />}
          {p.status === "ringing" && "Incoming call"}
          {p.status === "connecting" && "Calling…"}
          {p.status === "active" && (
            <span>
              <span className="tabular-nums">{p.held ? `on hold · ${holdTimer}` : timer}</span>
              {state && ` · ${state}`}
            </span>
          )}
          {p.status === "ended" && "Call ended"}
        </div>
        <div className="mt-12 text-[40px] leading-[46px] font-bold tracking-[-0.5px]">{p.name}</div>
        <div className="text-[17px] mt-1.5 text-white/85">{p.saved ? `Mobile ${AGENT_NUMBER}` : "Mobile"}</div>
        {p.saved && (
          <div className={`mx-auto mt-8 w-[88px] h-[88px] rounded-full transition-shadow ${p.speaking ? "shadow-[0_0_0_8px_rgba(255,255,255,.14)]" : ""}`}>
            <PersonaLogo size={88} />
          </div>
        )}
      </div>
      {p.status === "active" && !p.held && (
        <div className="mt-6 px-8 space-y-3 text-[15px] leading-[21px] text-center">
          {p.said && (
            <div data-caption="agent" className="text-white/90">
              {p.said}
            </div>
          )}
          {p.heard && <div className="text-white/60 italic">you: {p.heard}</div>}
        </div>
      )}
      <div className="flex-1" />
      {p.status === "ringing" ? (
        // one ui: green answer on the left, red decline on the right
        <div className="w-full flex justify-between px-12 pb-[calc(var(--sb-bottom)+72px)]">
          <div className="flex flex-col items-center gap-2">
            <button onClick={p.onAccept} aria-label="Accept" className="w-[72px] h-[72px] rounded-full flex items-center justify-center" style={{ background: "var(--sam-answer)" }}>
              <PhoneIcon size={30} />
            </button>
            <span className="text-[14px] text-white/85" aria-hidden>Answer</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button onClick={p.onDecline} aria-label="Decline" className="w-[72px] h-[72px] rounded-full flex items-center justify-center" style={{ background: "var(--sam-end)" }}>
              <PhoneIcon size={30} down />
            </button>
            <span className="text-[14px] text-white/85" aria-hidden>Decline</span>
          </div>
        </div>
      ) : (
        <div className="w-[calc(100%-32px)] mb-[calc(var(--sb-bottom)+20px)] rounded-[28px] flex flex-col items-center gap-7 pt-7 pb-6" style={{ background: "var(--sam-call-panel)" }}>
          <div className="flex gap-6">
            {p.onHide && p.status === "active" && (
              <div className="lg:hidden flex flex-col items-center gap-1">
                <button onClick={p.onHide} aria-label={p.unread ? `Messages, ${p.unread} new` : "Messages"} className={`relative ${tile}`}>
                  <BubbleIcon size={25} />
                  {!!p.unread && <span className="absolute top-0 right-2 min-w-5 h-5 px-1 rounded-full text-[11px] font-semibold flex items-center justify-center" style={{ background: "var(--sam-end)" }}>{p.unread}</span>}
                </button>
                <span className="text-[13px] text-white/90" aria-hidden>Messages</span>
              </div>
            )}
            {p.onMute && p.status === "active" && (
              <div className="flex flex-col items-center gap-1">
                <button onClick={p.onMute} aria-pressed={!!p.muted} aria-label={p.muted ? "Unmute" : "Mute"} className={`${tile} ${p.muted ? "bg-white text-black" : ""}`}>
                  <MicIcon off={p.muted} size={25} stroke={1.7} />
                </button>
                <span className="text-[13px] text-white/90" aria-hidden>{p.muted ? "Unmute" : "Mute"}</span>
              </div>
            )}
            {p.onHold && p.status === "active" && (
              <div className="flex flex-col items-center gap-1">
                <button onClick={p.onHold} aria-pressed={!!p.held} aria-label={p.held ? "Unhold" : "Hold"} className={`${tile} ${p.held ? "bg-white text-black" : ""}`}>
                  <PauseIcon size={22} />
                </button>
                <span className="text-[13px] text-white/90" aria-hidden>{p.held ? "Unhold" : "Hold"}</span>
              </div>
            )}
          </div>
          <button onClick={p.onHangup} disabled={p.status === "ended"} className="w-[72px] h-[72px] rounded-full flex items-center justify-center" style={{ background: "var(--sam-end)" }} aria-label="Hang up">
            <PhoneIcon size={30} down />
          </button>
        </div>
      )}
    </div>
  );
}

export const galaxy: Skin = {
  id: "galaxy",
  label: "Galaxy",
  screen: {
    className: "sk-sam bg-[var(--sam-bg)] text-[var(--sam-ink)]",
    style: { fontFamily: "var(--font-samsung)", ["--sb-frame" as string]: "40px", ["--sb-bottom-frame" as string]: "20px" } as CSSProperties,
  },
  threadClass: "px-3 pt-[calc(var(--sb)+72px)] pb-2",
  sheet: "m3",
  StatusBar,
  Header,
  DateStamp,
  Bubble,
  Typing,
  Composer,
  EventRow,
  GmailCard,
  LinkPreview,
  ContactCard,
  Media,
  UnknownAvatar,
  Banner,
  UnknownNotice,
  CallScreen,
  RichCard,
  rich: { ink: C.ink, mute: C.mute, accent: C.accent, onAccent: "#fff", line: C.line, danger: C.red, track: C.line },
};
