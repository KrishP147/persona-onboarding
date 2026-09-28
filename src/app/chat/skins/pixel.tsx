"use client";
// google messages on android 16, material 3 expressive, light + dark. colors are --gm-* vars on .sk-gm
// (globals.css): dark measured off the user's own pixel, light = gm3 baseline. see phone-ui-spec.md fidelity pass
import type { CSSProperties, ReactNode } from "react";
import type { BubbleProps, CallProps, ComposerProps, HeaderProps, Pos, RichCardProps, Skin, UnknownProps } from "./types";
import { AGENT_NUMBER, BubbleBody, BubbleIcon, GoogleG, MicIcon, PauseIcon, PersonaLogo, PersonSilhouette, PhoneIcon, RecTimer, callLog, eventKind, isToday, time, useClock, useElapsed } from "./shared";

const C = {
  app: "var(--gm-app)",
  surface: "var(--gm-surface)",
  ink: "var(--gm-ink)",
  sent: "var(--gm-sent)",
  sentInk: "var(--gm-sent-ink)",
  recv: "var(--gm-recv)",
  recvInk: "var(--gm-recv-ink)",
  primary: "var(--gm-primary)",
  onPrimary: "var(--gm-on-primary)",
  fab: "var(--gm-fab)",
  fabInk: "var(--gm-fab-ink)",
  mute: "var(--gm-mute)",
  high: "var(--gm-high)",
  error: "var(--gm-error)",
  green: "var(--gm-green)",
};

// m3 grouping: inner corners flatten to 4 inside a run
function corners(mine: boolean, pos: Pos): CSSProperties {
  const r = 20;
  const s = 4;
  const top = pos === "middle" || pos === "last" ? s : r;
  const bot = pos === "first" || pos === "middle" ? s : r;
  return mine
    ? { borderRadius: `${r}px ${top}px ${bot}px ${r}px` }
    : { borderRadius: `${top}px ${r}px ${r}px ${bot}px` };
}
// measured: 3 inside a run, 16 between runs
const gapOf = (pos: Pos) => (pos === "single" || pos === "first" ? "pt-4" : "pt-[3px]");

function StatusBar() {
  const t = useClock();
  return (
    <div className="sk-gm absolute inset-x-0 top-0 z-30 h-[44px] flex items-center px-4 text-[14px] font-medium text-[var(--gm-ink)] pointer-events-none" aria-hidden>
      <span className="pt-[2px] tracking-[0.1px]">{t}</span>
      <span className="flex-1" />
      <span className="flex items-center gap-[5px] pt-[2px]">
        <svg width="15" height="12" viewBox="0 0 24 18" fill="currentColor">
          <path d="M12 18l3.5-4.2a5.5 5.5 0 0 0-7 0zM4.2 9.9l2.3 2.7a8.5 8.5 0 0 1 11 0l2.3-2.7a12 12 0 0 0-15.6 0zM0 4.8l2.3 2.7a15 15 0 0 1 19.4 0L24 4.8a18.6 18.6 0 0 0-24 0z" />
        </svg>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M12 0v12H0z" />
        </svg>
        <svg width="9" height="15" viewBox="0 0 9 15" fill="currentColor">
          <rect x="2.5" y="0" width="4" height="2" rx=".6" />
          <rect x="0" y="1.5" width="9" height="13.5" rx="2" />
        </svg>
      </span>
    </div>
  );
}

function UnknownAvatar({ size }: { size: number }) {
  return (
    <div className="rounded-full flex items-center justify-center shrink-0" style={{ width: size, height: size, background: "var(--gm-unknown)", color: "var(--gm-unknown-ink)" }} aria-hidden>
      <PersonSilhouette size={size * 0.56} />
    </div>
  );
}

const iconBtn = "w-12 h-12 rounded-full flex items-center justify-center text-[var(--gm-ink)] hover:bg-[var(--gm-hover)] disabled:opacity-40";

function Header({ name, saved, onCall, callDisabled, onMenu }: HeaderProps) {
  return (
    <header className="flex items-center h-16 pl-1 pr-1 pt-[var(--sb)] box-content" style={{ background: C.app }}>
      <span className={iconBtn} aria-hidden>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" />
        </svg>
      </span>
      {saved ? <PersonaLogo size={40} /> : <UnknownAvatar size={40} />}
      <div className="flex-1 min-w-0 pl-4 text-[22px] leading-7 text-[var(--gm-ink)] truncate">{name}</div>
      <button aria-label="Call" disabled={callDisabled} onClick={onCall} className={iconBtn}>
        <PhoneIcon size={24} />
      </button>
      <button aria-label="Menu" onClick={onMenu} className={`${iconBtn} sm:hidden`}>
        <MoreVert />
      </button>
      <span className={`${iconBtn} hidden sm:flex`} aria-hidden>
        <MoreVert />
      </span>
    </header>
  );
}
function MoreVert() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function DateStamp({ ts }: { ts: number; first: boolean }) {
  const d = new Date(ts);
  const day = isToday(ts) ? "Today" : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return <div className="text-center text-[12px] leading-4 font-medium pt-4 pb-1" style={{ color: C.mute }}>{`${day} • ${time(ts)}`}</div>;
}

// 2026 read receipt: a small circle off the last sent bubble's bottom-right corner
function ReceiptDot({ state }: { state: NonNullable<BubbleProps["receipt"]> }) {
  return (
    <span className="absolute -right-1 -bottom-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: C.surface }} aria-label={state}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        {state === "seen" ? (
          <>
            <circle cx="8" cy="8" r="7" style={{ fill: C.primary }} />
            <path d="M4.8 8.2 7 10.4l4.3-4.6" fill="none" style={{ stroke: C.onPrimary }} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <>
            <circle cx="8" cy="8" r="6.3" fill="none" style={{ stroke: C.mute }} strokeWidth="1.3" />
            {state === "delivered" && <path d="M4.8 8.2 7 10.4l4.3-4.6" fill="none" style={{ stroke: C.mute }} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
          </>
        )}
      </svg>
    </span>
  );
}

function Bubble({ m, mine, pos, reaction, receipt, highlight }: BubbleProps) {
  return (
    <div data-role={m.role} className={`${gapOf(pos)} flex ${mine ? "justify-end" : "justify-start"} ${reaction ? "pb-3" : ""}`}>
      <div
        className="relative max-w-[82%] px-4 py-[9px] text-[16px] leading-6 whitespace-pre-wrap break-words"
        style={{ ...corners(mine, pos), background: mine ? C.sent : C.recv, color: mine ? C.sentInk : C.recvInk, outline: highlight ? `2px solid ${highlight}` : "2px solid transparent", outlineOffset: 2 }}
      >
        {m.channel === "voice" && (
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-70 mb-0.5">
            <PhoneIcon size={10} /> on call
          </span>
        )}
        <BubbleBody m={m} />
        {reaction && (
          <span className="absolute -bottom-[16px] right-3 h-6 px-1.5 rounded-full flex items-center text-[14px]" style={{ background: C.high, boxShadow: `0 0 0 2px ${C.surface}` }} aria-label="reaction">
            {reaction}
          </span>
        )}
        {receipt && <ReceiptDot state={receipt} />}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="pt-4">
      <div className="w-14 h-[42px] rounded-[20px] flex items-center justify-center gap-[5px]" style={{ background: C.recv }} role="status" aria-label="typing">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-[6px] h-[6px] rounded-full sk-bounce" style={{ background: C.mute, animationDelay: `${i * 160}ms` }} />
        ))}
      </div>
    </div>
  );
}

function Composer({ draft, setDraft, onSubmit, onAttach, canSend, recording, transcribing, onMic, hint }: ComposerProps) {
  return (
    <form
      className="flex items-center gap-2 px-3 pt-2 pb-[calc(var(--sb-bottom)+8px)]"
      style={{ background: C.surface }}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex-1 min-w-0 h-[52px] rounded-full flex items-center pl-1.5 pr-3" style={{ background: C.recv }}>
        <button type="button" aria-label="Attach" onClick={onAttach} className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--gm-mute)] hover:bg-[var(--gm-hover)]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v8M8 12h8" strokeLinecap="round" />
          </svg>
        </button>
        {recording ? (
          <span className="flex-1 pl-2 flex items-center gap-2 text-[16px] text-[var(--gm-error)]">
            <span className="w-2 h-2 rounded-full bg-[var(--gm-error)] sk-pulse" />
            <RecTimer startedAt={recording.startedAt} />
          </span>
        ) : (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={hint ?? "RCS message"}
            aria-label="Message"
            className="flex-1 min-w-0 bg-transparent outline-none pl-2 text-[16px] text-[var(--gm-ink)] placeholder:text-[var(--gm-mute)]"
          />
        )}
        <span className="flex items-center gap-4 text-[var(--gm-mute)] pl-2" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" />
            <circle cx="9" cy="10" r="1" fill="currentColor" />
            <circle cx="15" cy="10" r="1" fill="currentColor" />
            <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" strokeLinecap="round" />
          </svg>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
            <path d="m6.5 17 4-5 3 3.5 2-2.5 2.5 4" />
          </svg>
        </span>
      </div>
      {canSend && !recording ? (
        <button type="submit" aria-label="Send" className="w-[52px] h-[52px] shrink-0 rounded-full flex items-center justify-center sk-pop" style={{ background: C.primary, color: C.onPrimary }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M3 20.5 21 12 3 3.5l.01 6.6L15 12 3.01 13.9z" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          aria-label={recording ? "Stop and send voice note" : "Record a voice note"}
          onClick={onMic}
          disabled={transcribing}
          className="w-[52px] h-[52px] shrink-0 rounded-full flex items-center justify-center disabled:opacity-60"
          style={recording ? { background: "var(--gm-rec)", color: "var(--gm-rec-ink)" } : { background: C.fab, color: C.fabInk }}
        >
          {recording ? (
            <span className="w-3 h-3 rounded-[3px] bg-current" aria-hidden />
          ) : transcribing ? (
            <span className="w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />
          ) : (
            // voice-note waveform glyph, like the real app
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="3" y="10" width="2" height="4" rx="1" />
              <rect x="7" y="7" width="2" height="10" rx="1" />
              <rect x="11" y="3" width="2" height="18" rx="1" />
              <rect x="15" y="7" width="2" height="10" rx="1" />
              <rect x="19" y="10" width="2" height="4" rx="1" />
            </svg>
          )}
        </button>
      )}
    </form>
  );
}

function EventRow({ text }: { text: string }) {
  const k = eventKind(text);
  if (k === "hidden") return null;
  if (k === "plain") return <div className="text-center text-[12px] leading-4 py-2" style={{ color: C.mute }}>{text}</div>;
  const c = callLog(text);
  return (
    <div className="flex justify-center items-center gap-2 py-3 text-[12px] leading-4" style={{ color: C.mute }}>
      <span style={{ color: c.declined ? C.error : C.green }}>
        <PhoneIcon size={16} down={c.declined} />
      </span>
      {c.declined ? "Declined call" : `Voice call${c.ended ? ` · ${c.dur}` : ""}`}
    </div>
  );
}

function Card({ pos, children, footer, onClick, disabled, href }: { pos: Pos; children: ReactNode; footer: ReactNode; onClick?: () => void; disabled?: boolean; href?: string }) {
  const cls = "block w-[82%] overflow-hidden text-left hover:brightness-[.97] dark:hover:brightness-110";
  const style = { ...corners(false, pos), background: C.recv };
  const body = (
    <>
      {children}
      <div className="px-4 py-3">{footer}</div>
    </>
  );
  return (
    <div data-role="agent" className={`${gapOf(pos)} flex justify-start`}>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className={cls} style={style}>
          {body}
        </a>
      ) : (
        <button onClick={onClick} disabled={disabled} className={`${cls} disabled:cursor-default`} style={style}>
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
          <div className="text-[14px] leading-5 font-medium" style={{ color: C.recvInk }}>{connected ? "Google connected ✓" : "Connect your Google account"}</div>
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
          <div className="text-[14px] leading-5 font-medium" style={{ color: C.recvInk }}>Terms, SMS Terms and Privacy Policy</div>
          <div className="text-[12px] leading-4" style={{ color: C.mute }}>{url.split("/")[0]}</div>
        </>
      }
    >
      <div className="h-20 bg-gradient-to-br from-[#e9ece8] to-[#c9d0c6] flex items-center gap-2 px-4 text-[#1f2420]">
        <PersonaLogo size={28} /> <span className="font-medium">Persona</span>
      </div>
    </Card>
  );
}

function ContactCard({ name, saved, onSave, pos }: { name: string; saved: boolean; onSave: () => void; pos: Pos }) {
  return (
    <div data-role="agent" className={`${gapOf(pos)} flex justify-start`}>
      <div className="flex items-center gap-3 pl-3 pr-2 py-3" style={{ ...corners(false, pos), background: C.recv, color: C.recvInk }}>
        <div className="w-10 h-10 rounded-full bg-[#ee675c] flex items-center justify-center text-[18px] text-white shrink-0">{name.charAt(0).toUpperCase()}</div>
        <div className="min-w-0">
          <div className="text-[16px] truncate">{name}</div>
          <div className="text-[12px]" style={{ color: C.mute }}>{AGENT_NUMBER}</div>
        </div>
        <button onClick={onSave} disabled={saved} className="ml-2 h-10 px-4 rounded-full text-[14px] font-medium hover:bg-[var(--gm-hover)] disabled:hover:bg-transparent" style={{ color: saved ? C.green : C.primary }}>
          {saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}

// rich card: an m3 received bubble with a title row
function RichCard({ title, children, pos = "single" }: RichCardProps) {
  return (
    <div data-role="agent" className={`${gapOf(pos)} flex justify-start`}>
      <section aria-label={title} className="w-[86%] overflow-hidden" style={{ ...corners(false, pos), background: C.recv, color: C.recvInk }}>
        <div className="px-4 pt-3 pb-1 text-[12px] leading-4 font-medium tracking-[0.1px]" style={{ color: C.mute }}>
          {title}
        </div>
        {children}
      </section>
    </div>
  );
}

function Media({ src }: { src: string }) {
  return (
    <div data-role="agent" className="pt-4 flex justify-start">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="animated reaction" className="rounded-[20px] max-w-[60%] max-h-48 object-cover" style={{ background: C.recv }} loading="lazy" />
    </div>
  );
}

function Banner({ tone, children }: { tone: "info" | "error"; children: ReactNode }) {
  return (
    <div className="mx-3 mb-1 rounded-2xl px-4 py-2.5 text-[13px] leading-[18px]" style={tone === "error" ? { background: "var(--gm-err-bg)", color: "var(--gm-err-ink)" } : { background: C.high, color: C.recvInk }}>
      {children}
    </div>
  );
}

// google messages: unknown-sender card over the composer. its real row is add contact / report spam;
// only add contact does something here, so the other slot dismisses
function UnknownNotice({ onAdd, onDismiss }: UnknownProps) {
  return (
    <div className="mx-1 mt-4 mb-1 rounded-[20px] px-4 pt-3 pb-2" style={{ background: C.high, color: C.recvInk }} role="region" aria-label="Unknown sender">
      <div className="text-[14px] leading-5 font-medium">Not in your contacts</div>
      <div className="text-[12.5px] leading-[18px]" style={{ color: C.mute }}>
        Add them to see their name when they text or call.
      </div>
      <div className="mt-1.5 flex justify-end gap-1">
        <button type="button" onClick={onDismiss} className="h-10 px-4 rounded-full text-[14px] font-medium hover:bg-[var(--gm-hover)]" style={{ color: C.primary }}>
          Dismiss
        </button>
        <button type="button" onClick={onAdd} className="h-10 px-4 rounded-full text-[14px] font-medium" style={{ background: C.primary, color: C.onPrimary }}>
          Add contact
        </button>
      </div>
    </div>
  );
}

// m3 expressive "cookie": a 9-lobe scallop that turns slowly behind the photo
function Cookie({ size, color }: { size: number; color: string }) {
  const n = 9;
  const pts: string[] = [];
  for (let i = 0; i <= 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    const r = 50 * (0.92 + 0.08 * Math.cos(n * a));
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="absolute inset-0 sk-spin" aria-hidden>
      <polygon points={pts.join(" ")} style={{ fill: color }} />
    </svg>
  );
}

// pixel phone (m3 expressive): status/timer line, big name, "Mobile", then the photo; controls sit
// in a rounded-top panel. follows the page theme like the real phone app
function CallScreen(p: CallProps) {
  const timer = useElapsed(p.startedAt);
  const holdTimer = useElapsed(p.heldAt ?? null);
  const state = p.held ? "" : p.muted ? "muted" : p.speaking ? "speaking" : p.listening ? "listening" : "";
  const oval = "w-20 h-16 rounded-full flex items-center justify-center transition-[border-radius] active:rounded-[20px]";
  return (
    <div
      className="sk-gm relative h-full w-full flex flex-col items-center text-[var(--gm-ink)] bg-[var(--gm-call-bg)]"
      style={{ fontFamily: "var(--font-android)" }}
      role={p.status === "ringing" ? "alertdialog" : undefined}
      aria-label={p.status === "ringing" ? `Incoming call from ${p.name}` : "Call"}
    >
      <div className="pt-[calc(var(--sb)+56px)] text-center px-6">
        <div className="h-6 flex items-center justify-center gap-2 text-[16px] tracking-[0.5px]" style={{ color: C.mute }} role="status">
          {p.status === "active" && <PhoneIcon size={18} />}
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
        <div className="mt-2 text-[40px] leading-[48px]">{p.name}</div>
        <div className="text-[16px] mt-1" style={{ color: C.mute }}>
          {p.saved ? `Mobile ${AGENT_NUMBER}` : "Mobile"}
        </div>
        <div className="relative mx-auto mt-8 w-[136px] h-[136px] flex items-center justify-center">
          <Cookie size={136} color={p.speaking ? "var(--gm-cookie-live)" : "var(--gm-cookie)"} />
          <div className="relative">{p.saved ? <PersonaLogo size={108} /> : <UnknownAvatar size={108} />}</div>
        </div>
      </div>
      {p.status === "active" && !p.held && (
        <div className="mt-5 px-8 space-y-3 text-[15px] leading-[21px] text-center">
          {p.said && (
            <div data-caption="agent" className="text-[var(--gm-ink)]">
              {p.said}
            </div>
          )}
          {p.heard && <div className="italic" style={{ color: C.mute }}>you: {p.heard}</div>}
        </div>
      )}
      <div className="flex-1" />
      {p.status === "ringing" ? (
        <div className="w-full flex justify-between px-12 pb-[calc(var(--sb-bottom)+64px)]">
          <div className="flex flex-col items-center gap-2">
            <button onClick={p.onDecline} aria-label="Decline" className="w-[84px] h-[68px] rounded-full flex items-center justify-center" style={{ background: "var(--gm-end)", color: "var(--gm-end-ink)" }}>
              <PhoneIcon size={26} down />
            </button>
            <span className="text-[16px] font-medium" aria-hidden>Decline</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button onClick={p.onAccept} aria-label="Accept" className="w-[84px] h-[68px] rounded-full flex items-center justify-center" style={{ background: "var(--gm-answer)", color: "var(--gm-answer-ink)" }}>
              <PhoneIcon size={26} />
            </button>
            <span className="text-[16px] font-medium" aria-hidden>Answer</span>
          </div>
        </div>
      ) : (
        <div className="w-full flex flex-col items-center gap-8 pt-8 rounded-t-[28px] bg-[var(--gm-call-panel)] pb-[calc(var(--sb-bottom)+40px)]">
          <div className="flex gap-4">
            {p.onHide && p.status === "active" && (
              <div className="lg:hidden flex flex-col items-center gap-2">
                <button onClick={p.onHide} aria-label={p.unread ? `Messages, ${p.unread} new` : "Messages"} className={`relative ${oval}`} style={{ background: "var(--gm-call-btn)" }}>
                  <BubbleIcon size={24} />
                  {!!p.unread && <span className="absolute -top-1 right-1 min-w-5 h-5 px-1 rounded-full text-[11px] font-medium flex items-center justify-center" style={{ background: C.primary, color: C.onPrimary }}>{p.unread}</span>}
                </button>
                <span className="text-[14px]" style={{ color: C.mute }} aria-hidden>Messages</span>
              </div>
            )}
            {p.onMute && p.status === "active" && (
              <div className="flex flex-col items-center gap-2">
                <button onClick={p.onMute} aria-pressed={!!p.muted} aria-label={p.muted ? "Unmute" : "Mute"} className={oval} style={p.muted ? { background: "var(--gm-call-on)", color: "var(--gm-call-on-ink)", borderRadius: 20 } : { background: "var(--gm-call-btn)" }}>
                  <MicIcon off={p.muted} size={24} />
                </button>
                <span className="text-[14px]" style={{ color: C.mute }} aria-hidden>{p.muted ? "Unmute" : "Mute"}</span>
              </div>
            )}
            {p.onHold && p.status === "active" && (
              <div className="flex flex-col items-center gap-2">
                <button onClick={p.onHold} aria-pressed={!!p.held} aria-label={p.held ? "Unhold" : "Hold"} className={oval} style={p.held ? { background: "var(--gm-call-on)", color: "var(--gm-call-on-ink)", borderRadius: 20 } : { background: "var(--gm-call-btn)" }}>
                  <PauseIcon size={24} />
                </button>
                <span className="text-[14px]" style={{ color: C.mute }} aria-hidden>{p.held ? "Unhold" : "Hold"}</span>
              </div>
            )}
          </div>
          <button onClick={p.onHangup} disabled={p.status === "ended"} className="w-[168px] h-16 rounded-full flex items-center justify-center" style={{ background: "var(--gm-end)", color: "var(--gm-end-ink)" }} aria-label="Hang up">
            <PhoneIcon size={28} down />
          </button>
        </div>
      )}
    </div>
  );
}

export const pixel: Skin = {
  id: "pixel",
  label: "Pixel",
  screen: {
    className: "sk-gm bg-[var(--gm-app)] text-[var(--gm-ink)]",
    style: { fontFamily: "var(--font-android)", ["--sb-frame" as string]: "44px", ["--sb-bottom-frame" as string]: "24px" } as CSSProperties,
  },
  threadClass: "px-2 pb-3 rounded-t-[20px] bg-[var(--gm-surface)]",
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
  rich: { ink: C.recvInk, mute: C.mute, accent: C.primary, onAccent: C.onPrimary, line: "var(--gm-line)", danger: C.error, track: "var(--gm-track)" },
};
