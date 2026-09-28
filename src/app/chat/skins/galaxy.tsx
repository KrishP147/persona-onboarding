"use client";
// samsung messages on one ui 8, light. values from docs/design/phone-ui-spec.md A3
import type { CSSProperties, ReactNode } from "react";
import type { BubbleProps, CallProps, ComposerProps, HeaderProps, Pos, RichCardProps, Skin } from "./types";
import { AGENT_NUMBER, BubbleBody, BubbleIcon, GoogleG, MicIcon, PersonaLogo, PersonSilhouette, PhoneIcon, RecTimer, callLog, eventKind, time, useClock, useElapsed } from "./shared";

const C = {
  app: "#F6F6F8",
  sent: "#D2E3FC",
  recv: "#FFFFFF",
  ink: "#111111",
  mute: "#7B7B7B",
  accent: "#3E91FF",
  red: "#F14B4B",
  green: "#2FB65A",
};

function corners(mine: boolean, pos: Pos): CSSProperties {
  const r = 22;
  const s = 6;
  const top = pos === "middle" || pos === "last" ? s : r;
  const bot = pos === "first" || pos === "middle" ? s : r;
  return mine ? { borderRadius: `${r}px ${top}px ${bot}px ${r}px` } : { borderRadius: `${top}px ${r}px ${r}px ${bot}px` };
}
const gapOf = (pos: Pos) => (pos === "single" || pos === "first" ? "pt-[14px]" : "pt-[3px]");
const float: CSSProperties = { background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.08), 0 4px 14px rgba(0,0,0,.05)" };

function StatusBar() {
  const t = useClock();
  return (
    <div className="absolute inset-x-0 top-0 z-30 h-10 flex items-center px-[18px] text-[14px] font-medium pointer-events-none" style={{ color: C.ink }} aria-hidden>
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
    <div className="rounded-full flex items-end justify-center overflow-hidden shrink-0" style={{ width: size, height: size, background: "#E3E8F0" }} aria-hidden>
      <PersonSilhouette size={size * 0.74} color="#A3ACBA" />
    </div>
  );
}

function Header({ name, saved, onCall, callDisabled, onMenu }: HeaderProps) {
  const btn = "w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-40";
  return (
    <div className="absolute inset-x-0 top-0 z-20 pointer-events-none">
      <div className="absolute inset-x-0 top-0 h-[calc(var(--sb)+84px)]" style={{ background: `linear-gradient(${C.app} 62%, rgba(246,246,248,0))` }} />
      <header className="relative flex items-center gap-2 px-3 h-16 mt-[var(--sb)]" style={{ color: C.ink }}>
        <span className={`${btn} hidden sm:flex`} style={float} aria-hidden>
          <svg width="10" height="18" viewBox="0 0 10 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.5 1.5 1.5 9l7 7.5" />
          </svg>
        </span>
        <button aria-label="Menu" onClick={onMenu} className={`${btn} sm:hidden pointer-events-auto`} style={float}>
          <svg width="18" height="14" viewBox="0 0 18 14" fill="currentColor" aria-hidden>
            <rect y="0" width="18" height="2" rx="1" />
            <rect y="6" width="18" height="2" rx="1" />
            <rect y="12" width="18" height="2" rx="1" />
          </svg>
        </button>
        {/* one ui 8.5: avatar + name float in their own pill */}
        <div className="flex-1 min-w-0 flex">
          <div className="min-w-0 max-w-full flex items-center gap-2.5 h-12 pl-1.5 pr-4 rounded-full" style={float}>
            {saved ? <PersonaLogo size={36} /> : <UnknownAvatar size={36} />}
            <div className="min-w-0">
              <div className={`${saved ? "text-[17px]" : "text-[15px]"} leading-[21px] font-semibold truncate`}>{name}</div>
              {saved && <div className="text-[12px] leading-4 truncate" style={{ color: C.mute }}>{AGENT_NUMBER}</div>}
            </div>
          </div>
        </div>
        <button aria-label="Call" disabled={callDisabled} onClick={onCall} className={`${btn} pointer-events-auto`} style={float}>
          <PhoneIcon size={20} />
        </button>
        <span className={btn} style={float} aria-hidden>
          <svg width="4" height="18" viewBox="0 0 4 18" fill="currentColor">
            <circle cx="2" cy="2" r="2" />
            <circle cx="2" cy="9" r="2" />
            <circle cx="2" cy="16" r="2" />
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
  return <div className="text-center text-[12px] leading-4 font-semibold pt-4 pb-1" style={{ color: C.mute }}>{d}</div>;
}

const RECEIPT_WORD = { sent: "Sent", delivered: "Delivered", seen: "Read" } as const;

function Bubble({ m, mine, pos, reaction, receipt, highlight, showTime }: BubbleProps) {
  const side = (showTime || receipt) && (
    <span className={`self-end shrink-0 text-[11px] leading-[14px] pb-[2px] flex flex-col ${mine ? "items-end" : "items-start"}`} style={{ color: C.mute }}>
      {receipt && (
        <span aria-label={receipt} style={{ color: receipt === "seen" ? C.accent : C.mute }}>
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
        style={{ ...corners(mine, pos), background: mine ? C.sent : C.recv, color: C.ink, outline: highlight ? `2px solid ${highlight}` : "2px solid transparent", outlineOffset: 2 }}
      >
        <BubbleBody m={m} voice={{ knob: "bg-black/10", bar: "bg-black/35", ink: "text-black/55" }} />
        {reaction && (
          <span className="absolute -bottom-[18px] right-2 h-[22px] px-1.5 rounded-full flex items-center text-[13px] bg-white border border-[#E3E3E3]" aria-label="reaction">
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
          <span key={i} className="w-[6px] h-[6px] rounded-full sk-wave" style={{ background: "#A0A0A5", animationDelay: `${i * 140}ms` }} />
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
      <button type="button" aria-label="Attach" onClick={onAttach} className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center hover:bg-black/5" style={{ color: "#5F6368" }}>
        <svg width="22" height="22" viewBox="0 0 22 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M11 3v16M3 11h16" />
        </svg>
      </button>
      <div className="flex-1 min-w-0 h-11 rounded-full bg-white flex items-center pl-4 pr-1.5" style={{ boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}>
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
            className="flex-1 min-w-0 bg-transparent outline-none text-[16px] placeholder:text-[#9A9A9F]"
            style={{ color: C.ink }}
          />
        )}
        <span className="w-9 h-9 flex items-center justify-center" style={{ color: "#5F6368" }} aria-hidden>
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
          style={recording ? { background: C.red, color: "#fff" } : { color: "#5F6368" }}
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
      <button type="submit" aria-label="Send" disabled={!canSend} className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-white transition-colors" style={{ background: canSend ? C.accent : "#C9CCD1" }}>
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
      <div className="flex items-center gap-2 text-[12px] leading-4 bg-white rounded-full px-3 py-1.5" style={{ color: C.mute }}>
        <span style={{ color: c.declined ? C.red : C.green }}>
          <PhoneIcon size={14} down={c.declined} />
        </span>
        {c.declined ? "Declined call" : `Voice call${c.ended ? ` · ${c.dur}` : ""}`}
      </div>
    </div>
  );
}

function Card({ pos, children, footer, onClick, disabled, href }: { pos: Pos; children: ReactNode; footer: ReactNode; onClick?: () => void; disabled?: boolean; href?: string }) {
  const cls = "block w-[72%] overflow-hidden rounded-[18px] bg-white text-left";
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
      <div className="w-[72%] bg-white rounded-[18px] overflow-hidden" style={{ color: C.ink }}>
        <div className="flex items-center gap-3 px-3 py-3">
          <div className="w-10 h-10 rounded-full bg-[#F8B26A] flex items-center justify-center text-[17px] font-semibold text-white shrink-0">{name.charAt(0).toUpperCase()}</div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold truncate">{name}</div>
            <div className="text-[12px]" style={{ color: C.mute }}>{AGENT_NUMBER}</div>
          </div>
        </div>
        <button onClick={onSave} disabled={saved} className="w-full border-t border-[#EDEDF0] py-2.5 text-[14px] font-semibold" style={{ color: saved ? C.green : C.accent }}>
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
      <section aria-label={title} className="w-[84%] bg-white rounded-[18px] overflow-hidden" style={{ color: C.ink }}>
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
      <img src={src} alt="animated reaction" className="rounded-[18px] max-w-[60%] max-h-48 object-cover bg-white" loading="lazy" />
    </div>
  );
}

function Banner({ tone, children }: { tone: "info" | "error"; children: ReactNode }) {
  return (
    <div className="mx-3 mb-1 rounded-2xl px-4 py-2.5 text-[13px] leading-[18px]" style={tone === "error" ? { background: "#FDECEC", color: "#B3261E" } : { background: "#fff", color: "#3C3C43" }}>
      {children}
    </div>
  );
}

function CallScreen(p: CallProps) {
  const timer = useElapsed(p.startedAt);
  const state = p.muted ? "muted" : p.speaking ? "speaking" : p.listening ? "listening" : "";
  const small = "w-14 h-14 rounded-full flex items-center justify-center";
  return (
    <div
      className="relative h-full w-full flex flex-col items-center text-white"
      style={{ background: "linear-gradient(170deg, #4b5a6b 0%, #26303b 55%, #161b21 100%)", fontFamily: "var(--font-samsung)" }}
      role={p.status === "ringing" ? "alertdialog" : undefined}
      aria-label={p.status === "ringing" ? `Incoming call from ${p.name}` : "Call"}
    >
      <div className="pt-[calc(var(--sb)+96px)] text-center px-6">
        <div className={`mx-auto w-[96px] h-[96px] rounded-full mb-5 transition-shadow ${p.speaking ? "shadow-[0_0_0_8px_rgba(255,255,255,.14)]" : ""}`}>
          {p.saved ? <PersonaLogo size={96} /> : <UnknownAvatar size={96} />}
        </div>
        <div className="text-[32px] leading-[38px] font-semibold">{p.name}</div>
        <div className="text-[16px] mt-1 text-white/65" role="status">
          {p.status === "ringing" && (p.saved ? AGENT_NUMBER : "Mobile · United States")}
          {p.status === "connecting" && "Calling…"}
          {p.status === "active" && (
            <>
              <span className="tabular-nums">{timer}</span>
              {state && ` · ${state}`}
            </>
          )}
          {p.status === "ended" && "Call ended"}
        </div>
      </div>
      {p.status === "active" && (
        <div className="mt-6 px-8 space-y-3 text-[15px] leading-[21px] text-center">
          {p.said && (
            <div data-caption="agent" className="text-white/90">
              {p.said}
            </div>
          )}
          {p.heard && <div className="text-white/55 italic">you: {p.heard}</div>}
        </div>
      )}
      <div className="flex-1" />
      {p.status === "ringing" ? (
        // one ui: green answer on the left, red decline on the right
        <div className="w-full flex justify-between px-12 pb-[calc(var(--sb-bottom)+72px)]">
          <button onClick={p.onAccept} aria-label="Accept" className="w-[72px] h-[72px] rounded-full flex items-center justify-center" style={{ background: C.green }}>
            <PhoneIcon size={30} />
          </button>
          <button onClick={p.onDecline} aria-label="Decline" className="w-[72px] h-[72px] rounded-full flex items-center justify-center" style={{ background: C.red }}>
            <PhoneIcon size={30} down />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-8 pb-[calc(var(--sb-bottom)+48px)]">
          <div className="flex gap-10">
            {p.onHide && p.status === "active" && (
              <div className="lg:hidden flex flex-col items-center gap-1.5">
                <button onClick={p.onHide} aria-label={p.unread ? `Messages, ${p.unread} new` : "Messages"} className={`relative ${small} bg-white/12`}>
                  <BubbleIcon size={22} />
                  {!!p.unread && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-[11px] font-semibold flex items-center justify-center" style={{ background: C.accent }}>{p.unread}</span>}
                </button>
                <span className="text-[12px] text-white/80" aria-hidden>Messages</span>
              </div>
            )}
            {p.onMute && p.status === "active" && (
              <div className="flex flex-col items-center gap-1.5">
                <button onClick={p.onMute} aria-pressed={!!p.muted} aria-label={p.muted ? "Unmute" : "Mute"} className={`${small} ${p.muted ? "bg-white text-black" : "bg-white/12"}`}>
                  <MicIcon off={p.muted} size={22} />
                </button>
                <span className="text-[12px] text-white/80" aria-hidden>{p.muted ? "Unmute" : "Mute"}</span>
              </div>
            )}
          </div>
          <button onClick={p.onHangup} disabled={p.status === "ended"} className="w-[72px] h-[72px] rounded-full flex items-center justify-center" style={{ background: C.red }} aria-label="Hang up">
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
    className: "",
    style: { background: C.app, color: C.ink, fontFamily: "var(--font-samsung)", ["--sb-frame" as string]: "40px", ["--sb-bottom-frame" as string]: "20px" } as CSSProperties,
  },
  threadClass: "px-3 pt-[calc(var(--sb)+72px)] pb-2",
  sheet: "m3",
  why: { ink: C.ink, mute: C.mute, surface: "#FFFFFF", line: "rgba(0,0,0,.08)" },
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
  CallScreen,
  RichCard,
  rich: { ink: C.ink, mute: C.mute, accent: C.accent, onAccent: "#fff", line: "#EDEDF0", danger: C.red, track: "#EDEDF0" },
};
