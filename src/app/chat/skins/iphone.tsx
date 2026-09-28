"use client";
// imessage on ios 26 (liquid glass), light + dark. colors are --ios-* vars on .sk-ios (globals.css),
// values + sources in docs/design/phone-ui-spec.md A1 and its fidelity pass
import type { CSSProperties, ReactNode } from "react";
import type { BubbleProps, CallProps, ComposerProps, HeaderProps, Pos, RichCardProps, Skin, UnknownProps } from "./types";
import { AGENT_NUMBER, BubbleBody, BubbleIcon, GoogleG, MicIcon, PauseIcon, PersonaLogo, PersonSilhouette, PhoneIcon, RecTimer, callLog, eventKind, isToday, time, useClock, useElapsed } from "./shared";

const BLUE = "var(--ios-blue)";
const RECV = "var(--ios-recv)";
const GRAY = "var(--ios-gray)";
const RED = "var(--ios-red)";
const GREEN = "var(--ios-green)";
const INK = "var(--ios-ink)";

const glass: CSSProperties = {
  background: "var(--ios-glass)",
  backdropFilter: "blur(20px) saturate(180%)",
  WebkitBackdropFilter: "blur(20px) saturate(180%)",
  border: ".5px solid var(--ios-glass-rim)",
  boxShadow: "var(--ios-glass-shadow)",
};

const hasTail = (p: Pos) => p === "single" || p === "last";

// the imessage tail: hooks out of the bottom corner. it paints behind the bubble's content
// (z -1 inside an isolated bubble), so it can never cover a glyph whatever the run position.
// a clipped box, not an svg, so a sent tail can share the bubble's fixed screen gradient
const TAIL_R = "path('M0 0H12V7C12 12.5 13.5 15.6 18 18C13.4 18.6 9.2 17.6 6.2 15.4C4.6 17 2.6 18 0 18Z')";
const TAIL_L = "path('M18 0H6V7C6 12.5 4.5 15.6 0 18C4.6 18.6 8.8 17.6 11.8 15.4C13.4 17 15.4 18 18 18Z')";
function Tail({ mine, color = RECV }: { mine: boolean; color?: string }) {
  return (
    <span
      aria-hidden
      className={`absolute bottom-0 -z-10 pointer-events-none w-[18px] h-[18px] ${mine ? "sk-ios-sent" : ""}`}
      style={mine ? { right: -6, clipPath: TAIL_R } : { left: -6, clipPath: TAIL_L, background: color }}
    />
  );
}

function StatusBar() {
  const t = useClock();
  return (
    <div className="absolute inset-x-0 top-0 z-30 h-[54px] flex items-center pointer-events-none" style={{ color: INK }} aria-hidden>
      <span className="w-[132px] text-center text-[17px] font-semibold tracking-[-0.4px] pt-[3px]">{t}</span>
      <span className="flex-1" />
      <span className="w-[132px] flex items-center justify-center gap-[6px] pt-[3px]">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="10" y="3" width="3" height="9" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 24 18" fill="currentColor">
          <path d="M12 18l3.5-4.2a5.5 5.5 0 0 0-7 0zM4.2 9.9l2.3 2.7a8.5 8.5 0 0 1 11 0l2.3-2.7a12 12 0 0 0-15.6 0zM0 4.8l2.3 2.7a15 15 0 0 1 19.4 0L24 4.8a18.6 18.6 0 0 0-24 0z" />
        </svg>
        <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
          <rect x=".5" y=".5" width="23" height="12" rx="4" stroke="currentColor" opacity=".35" />
          <rect x="2" y="2" width="18" height="9" rx="2.5" fill="currentColor" />
          <path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2z" fill="currentColor" opacity=".4" />
        </svg>
      </span>
    </div>
  );
}

function UnknownAvatar({ size }: { size: number }) {
  return (
    <div className="rounded-full flex items-end justify-center overflow-hidden shrink-0" style={{ width: size, height: size, background: "var(--ios-avatar)" }} aria-hidden>
      <PersonSilhouette size={size * 0.78} color="#fff" />
    </div>
  );
}

function Header({ name, saved, onCall, callDisabled, onMenu }: HeaderProps) {
  return (
    <div className="absolute inset-x-0 top-0 z-20 pointer-events-none">
      {/* scroll-edge effect: content fades + blurs under the controls, no hard bar */}
      <div
        className="absolute inset-x-0 top-0 h-[calc(var(--sb)+116px)]"
        style={{
          background: "linear-gradient(rgb(var(--ios-edge)) calc(100% - 34px), rgba(var(--ios-edge),0))",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          maskImage: "linear-gradient(#000 calc(100% - 34px), transparent)",
          WebkitMaskImage: "linear-gradient(#000 calc(100% - 34px), transparent)",
        }}
      />
      <header className="relative flex items-start justify-between px-4 pt-[calc(var(--sb)+6px)]">
        <span className="hidden sm:flex w-11 h-11 rounded-full items-center justify-center" style={{ ...glass, color: INK }} aria-hidden>
          <svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 2 2 10l8 8" />
          </svg>
        </span>
        <button aria-label="Menu" onClick={onMenu} className="sm:hidden pointer-events-auto w-11 h-11 rounded-full flex items-center justify-center" style={{ ...glass, color: INK }}>
          <svg width="18" height="14" viewBox="0 0 18 14" fill="currentColor" aria-hidden>
            <rect y="0" width="18" height="2" rx="1" />
            <rect y="6" width="18" height="2" rx="1" />
            <rect y="12" width="18" height="2" rx="1" />
          </svg>
        </button>
        <div className="flex flex-col items-center -mt-[2px]">
          {saved ? <PersonaLogo size={50} /> : <UnknownAvatar size={50} />}
          <div className="-mt-[6px] h-[28px] px-[12px] rounded-full flex items-center gap-[4px] text-[15px] font-semibold tracking-[-0.2px] max-w-[220px]" style={{ ...glass, color: INK }}>
            <span className="truncate">{name}</span>
            <svg width="7" height="11" viewBox="0 0 6 10" fill="none" stroke={GRAY} strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M1 1l4 4-4 4" />
            </svg>
          </div>
        </div>
        <button aria-label="Call" disabled={callDisabled} onClick={onCall} className="pointer-events-auto w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-40" style={{ ...glass, color: INK }}>
          <PhoneIcon size={19} />
        </button>
      </header>
    </div>
  );
}

function DateStamp({ ts, first }: { ts: number; first: boolean }) {
  const d = new Date(ts);
  const day = isToday(ts) ? "Today" : d.toLocaleDateString([], { weekday: "long" });
  return (
    <div className="text-center text-[11px] leading-[13px] pt-[14px] pb-[8px]" style={{ color: GRAY }}>
      {first && <div className="font-semibold">iMessage</div>}
      <div>
        <span className="font-semibold">{day}</span> {time(ts)}
      </div>
    </div>
  );
}

function Bubble({ m, mine, pos, reaction, receipt, receiptAt, highlight }: BubbleProps) {
  // measured: 3-4 between bubbles of one run, ~10 when the sender changes
  const gap = pos === "single" || pos === "first" ? "pt-[10px]" : "pt-[3px]";
  return (
    <div data-role={m.role} className={`${gap} flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <div
        className={`relative isolate max-w-[70%] rounded-[18px] px-3 py-[7px] text-[17px] leading-[22px] tracking-[-0.4px] whitespace-pre-wrap break-words transition-[outline-color] duration-150 ${mine ? "sk-ios-sent" : ""}`}
        style={{ ...(mine ? { color: "var(--ios-sent-ink)" } : { background: RECV, color: "var(--ios-recv-ink)" }), outline: highlight ? `2px solid ${highlight}` : "2px solid transparent", outlineOffset: 2 }}
      >
        <BubbleBody m={m} voice={mine ? undefined : { knob: "bg-[var(--ios-fill)]", bar: "bg-[var(--ios-fill-ink)]", ink: "text-[var(--ios-fill-ink)]" }} />
        {hasTail(pos) && <Tail mine={mine} />}
        {reaction && (
          // their tapback on your bubble: grey badge, top outer corner, with the little two-dot tail
          <span className={`absolute -top-[16px] ${mine ? "-left-[14px]" : "-right-[14px]"} w-[30px] h-[30px] rounded-full flex items-center justify-center text-[15px] border-2`} style={{ background: RECV, borderColor: "var(--ios-bg)" }} aria-label="reaction">
            {reaction}
            <span className="absolute -bottom-[3px] right-[2px] w-[7px] h-[7px] rounded-full border-2" style={{ background: RECV, borderColor: "var(--ios-bg)" }} />
          </span>
        )}
      </div>
      {receipt && (
        <div className="pr-[4px] pt-[2px] text-[11px] leading-[13px]" style={{ color: GRAY }} aria-label={receipt}>
          {receipt === "delivered" && <span className="font-semibold">Delivered</span>}
          {receipt === "seen" && (
            <>
              <span className="font-semibold">Read</span> {time(receiptAt ?? m.ts)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Typing() {
  return (
    <div className="pt-[10px] pl-[4px]">
      <div className="relative w-[58px] h-[36px] rounded-[18px] flex items-center justify-center gap-[4px]" style={{ background: RECV }} role="status" aria-label="typing">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-2 h-2 rounded-full sk-pulse" style={{ background: GRAY, animationDelay: `${i * 150}ms` }} />
        ))}
        {/* thought-bubble tail */}
        <span className="absolute -bottom-[2px] -left-[2px] w-2 h-2 rounded-full" style={{ background: RECV }} />
        <span className="absolute -bottom-[7px] -left-[7px] w-1 h-1 rounded-full" style={{ background: RECV }} />
      </div>
    </div>
  );
}

function Composer({ draft, setDraft, onSubmit, onAttach, canSend, recording, transcribing, onMic, hint }: ComposerProps) {
  return (
    <form
      className="relative z-10 flex items-end gap-2 px-3 pt-2 pb-[calc(var(--sb-bottom)+8px)]"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <button type="button" aria-label="Attach" onClick={onAttach} className="w-[38px] h-[38px] shrink-0 rounded-full flex items-center justify-center" style={{ ...glass, color: INK }}>
        <svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M8 1.5v13M1.5 8h13" />
        </svg>
      </button>
      <div className="flex-1 min-w-0 min-h-[38px] rounded-[19px] flex items-center pl-[14px] pr-[5px]" style={{ ...glass, background: "var(--ios-field)", border: ".5px solid var(--ios-field-rim)" }}>
        {recording ? (
          <span className="flex-1 flex items-center gap-2 text-[17px] tracking-[-0.4px]" style={{ color: RED }}>
            <span className="w-2 h-2 rounded-full sk-pulse" style={{ background: RED }} />
            <RecTimer startedAt={recording.startedAt} />
          </span>
        ) : (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={hint ?? "iMessage"}
            aria-label="Message"
            className="flex-1 min-w-0 bg-transparent outline-none text-[17px] leading-[22px] tracking-[-0.4px] py-[7px] text-[var(--ios-ink)] placeholder:text-[var(--ios-placeholder)]"
          />
        )}
        {canSend && !recording ? (
          <button type="submit" aria-label="Send" className="w-[28px] h-[28px] my-[4px] rounded-full flex items-center justify-center text-white" style={{ background: BLUE }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7 12.5V1.8M2.2 6.4 7 1.6l4.8 4.8" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            aria-label={recording ? "Stop and send voice note" : "Record a voice note"}
            onClick={onMic}
            disabled={transcribing}
            className="w-[28px] h-[28px] my-[4px] rounded-full flex items-center justify-center disabled:opacity-60"
            style={recording ? { background: RED, color: "#fff" } : { color: GRAY }}
          >
            {recording ? (
              <span className="w-[10px] h-[10px] rounded-[2px] bg-white" aria-hidden />
            ) : transcribing ? (
              <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />
            ) : (
              <MicIcon size={19} stroke={1.8} />
            )}
          </button>
        )}
      </div>
    </form>
  );
}

function EventRow({ text }: { text: string }) {
  const k = eventKind(text);
  if (k === "hidden") return null;
  if (k === "plain") return <div className="text-center text-[11px] leading-[13px] py-2" style={{ color: GRAY }}>{text}</div>;
  const c = callLog(text);
  return (
    <div className="flex justify-center items-center gap-1.5 py-2 text-[11px] leading-[13px]" style={{ color: GRAY }}>
      <span style={{ color: c.declined ? RED : GRAY }}>
        <PhoneIcon size={12} down={c.declined} />
      </span>
      <span className="font-semibold">{c.declined ? "Declined Call" : "Voice Call"}</span>
      {c.ended && <span>· {c.dur}</span>}
    </div>
  );
}

// link-preview shaped card: image on top, grey footer, tail on the last one
function Card({ pos, children, footer, onClick, disabled, href }: { pos: Pos; children: ReactNode; footer: ReactNode; onClick?: () => void; disabled?: boolean; href?: string }) {
  const body = (
    <>
      <div className="overflow-hidden rounded-t-[18px]">{children}</div>
      <div className="relative z-[1] px-3 py-[9px] rounded-b-[18px] text-left" style={{ background: RECV }}>
        {footer}
      </div>
    </>
  );
  const cls = "relative isolate block w-[264px] rounded-[18px] text-[var(--ios-recv-ink)]";
  return (
    <div data-role="agent" className={`${pos === "single" || pos === "first" ? "pt-[9px]" : "pt-[2px]"} flex justify-start`}>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className={cls}>
          {body}
          {hasTail(pos) && <Tail mine={false} color={RECV} />}
        </a>
      ) : (
        <button onClick={onClick} disabled={disabled} className={`${cls} disabled:cursor-default`}>
          {body}
          {hasTail(pos) && <Tail mine={false} color={RECV} />}
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
          <div className="text-[15px] leading-[20px] font-semibold tracking-[-0.2px]">{connected ? "Google connected ✓" : "Connect your Google account"}</div>
          <div className="text-[13px] leading-[18px]" style={{ color: GRAY }}>app.yourpersona.com</div>
        </>
      }
    >
      <div className="relative h-[138px] bg-gradient-to-b from-[#c9d3d6] via-[#dfe3df] to-[#b7bfb4] text-[#1f2420] px-4 pt-3 text-left">
        <div className="text-[11px] font-semibold tracking-wide opacity-70">Persona</div>
        <div className="font-serif text-[21px] leading-snug mt-2">One tap to a quieter life</div>
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
          <div className="text-[15px] leading-[20px] font-semibold tracking-[-0.2px]">Terms, SMS Terms and Privacy Policy</div>
          <div className="text-[13px] leading-[18px]" style={{ color: GRAY }}>{url.split("/")[0]}</div>
        </>
      }
    >
      <div className="h-[110px] bg-gradient-to-br from-[#f2f3f1] to-[#d7dcd4] flex items-center justify-center gap-2 text-[#1f2420]">
        <PersonaLogo size={34} /> <span className="font-semibold text-[17px]">Persona</span>
      </div>
    </Card>
  );
}

function ContactCard({ name, saved, onSave, pos }: { name: string; saved: boolean; onSave: () => void; pos: Pos }) {
  return (
    <div data-role="agent" className={`${pos === "single" || pos === "first" ? "pt-[9px]" : "pt-[2px]"} flex justify-start`}>
      <div className="relative isolate w-[264px] rounded-[18px] text-[var(--ios-recv-ink)]" style={{ background: RECV }}>
        <div className="flex items-center gap-3 px-3 py-[10px]">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[17px] font-semibold shrink-0" style={{ background: "var(--ios-avatar)" }}>
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold truncate tracking-[-0.2px]">{name}</div>
            <div className="text-[13px]" style={{ color: GRAY }}>{AGENT_NUMBER}</div>
          </div>
          <svg width="7" height="12" viewBox="0 0 7 12" fill="none" stroke="var(--ios-gray3)" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M1 1l5 5-5 5" />
          </svg>
        </div>
        <button onClick={onSave} disabled={saved} className="w-full border-t border-[var(--ios-sep)] py-[9px] text-[15px] font-semibold disabled:font-normal" style={{ color: saved ? GRAY : BLUE }}>
          {saved ? "Saved ✓" : "Save"}
        </button>
        {hasTail(pos) && <Tail mine={false} color={RECV} />}
      </div>
    </div>
  );
}

// rich card: a grey received bubble with a title row, like a business chat card
function RichCard({ title, children, pos = "single" }: RichCardProps) {
  return (
    <div data-role="agent" className={`${pos === "single" || pos === "first" ? "pt-[9px]" : "pt-[2px]"} flex justify-start`}>
      <section aria-label={title} className="relative isolate w-[300px] max-w-[88%] rounded-[18px] text-[var(--ios-recv-ink)]" style={{ background: RECV }}>
        <div className="px-3 pt-[10px] pb-1.5 text-[13px] leading-[18px] font-semibold tracking-[-0.08px]" style={{ color: GRAY }}>
          {title}
        </div>
        {children}
        {hasTail(pos) && <Tail mine={false} color={RECV} />}
      </section>
    </div>
  );
}

function Media({ src }: { src: string }) {
  return (
    <div data-role="agent" className="pt-[9px] flex justify-start">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="animated reaction" className="rounded-[18px] max-w-[60%] max-h-48 object-cover" style={{ background: RECV }} loading="lazy" />
    </div>
  );
}

function Banner({ tone, children }: { tone: "info" | "error"; children: ReactNode }) {
  return (
    <div className="mx-4 mb-1 rounded-[14px] px-3 py-2 text-[13px] leading-[18px] text-center" style={tone === "error" ? { background: "var(--ios-err-bg)", color: "var(--ios-err-ink)" } : { background: "var(--ios-info-bg)", color: "var(--ios-info-ink)" }}>
      {children}
    </div>
  );
}

// ios: gray line + one blue action. report junk is gone (it did nothing here); dismiss hides the line
function UnknownNotice({ onDismiss }: UnknownProps) {
  return (
    <div className="text-center text-[13px] leading-[18px] pt-5 pb-1" style={{ color: GRAY }}>
      This sender is not in your contacts.
      <br />
      <button type="button" onClick={onDismiss} className="min-h-8 px-2" style={{ color: BLUE }}>
        Dismiss
      </button>
    </div>
  );
}

function CallScreen(p: CallProps) {
  const timer = useElapsed(p.startedAt);
  const holdTimer = useElapsed(p.heldAt ?? null);
  const state = p.held ? "" : p.muted ? "muted" : p.speaking ? "speaking" : p.listening ? "listening" : "";
  // ios 26 phone: 77pt glass circles with a light rim, 15pt labels (apple press, hold assist)
  const circle = "w-[76px] h-[76px] rounded-full flex items-center justify-center";
  const glassDark: CSSProperties = { background: "var(--ios-call-glass)", backdropFilter: "blur(20px) saturate(160%)", WebkitBackdropFilter: "blur(20px) saturate(160%)", border: "1px solid var(--ios-call-rim)" };
  // active: the timer sits above the name (ios 26); ringing + ended keep the caption below
  const above = p.status === "active" || p.status === "connecting";
  const status = (
    <div className={`text-[17px] leading-[22px] text-white/70 ${above ? "mb-1" : "mt-1"}`} role="status">
      {p.status === "ringing" && (p.saved ? "mobile" : "Unknown Caller")}
      {p.status === "connecting" && "calling…"}
      {p.status === "active" && (
        <>
          <span className="tabular-nums">{p.held ? `on hold · ${holdTimer}` : timer}</span>
          {state && <span className="text-white/50"> · {state}</span>}
        </>
      )}
      {p.status === "ended" && "Call Ended"}
    </div>
  );
  return (
    <div
      className="sk-ios relative h-full w-full text-white flex flex-col items-center"
      style={{ background: p.saved ? "var(--ios-call-poster)" : "var(--ios-call-bg)", fontFamily: "var(--font-ios)" }}
      role={p.status === "ringing" ? "alertdialog" : undefined}
      aria-label={p.status === "ringing" ? `Incoming call from ${p.name}` : "Call"}
    >
      <div className="pt-[calc(var(--sb)+56px)] text-center px-6">
        <div className={`mx-auto w-[84px] h-[84px] rounded-full mb-4 transition-shadow ${p.speaking ? "shadow-[0_0_0_8px_rgba(255,255,255,.14)]" : ""}`}>
          {p.saved ? <PersonaLogo size={84} /> : <UnknownAvatar size={84} />}
        </div>
        {above && status}
        <div className="text-[34px] leading-[41px] font-semibold tracking-[0.4px]">{p.name}</div>
        {!above && status}
      </div>
      {p.status === "active" && !p.held && (
        <div className="mt-8 px-8 space-y-3 text-[16px] leading-[21px] text-center max-w-full">
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
        <div className="w-full grid grid-cols-2 pb-[calc(var(--sb-bottom)+64px)]">
          {[
            { label: "Decline", onClick: p.onDecline, bg: RED, down: true },
            { label: "Accept", onClick: p.onAccept, bg: GREEN, down: false },
          ].map((b) => (
            <div key={b.label} className="flex flex-col items-center gap-2">
              <button onClick={b.onClick} aria-label={b.label} className={circle} style={{ background: b.bg }}>
                <PhoneIcon size={30} down={b.down} />
              </button>
              <span className="text-[15px] leading-[20px]" aria-hidden>{b.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-7 pb-[calc(var(--sb-bottom)+48px)]">
          <div className="flex gap-[40px]">
            {p.onHide && p.status === "active" && (
              <div className="lg:hidden flex flex-col items-center gap-2">
                <button onClick={p.onHide} aria-label={p.unread ? `Messages, ${p.unread} new` : "Messages"} className={`relative ${circle}`} style={glassDark}>
                  <BubbleIcon size={26} />
                  {!!p.unread && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-[12px] font-semibold flex items-center justify-center" style={{ background: GREEN }}>{p.unread}</span>}
                </button>
                <span className="text-[15px] leading-[20px]" aria-hidden>Messages</span>
              </div>
            )}
            {p.onMute && p.status === "active" && (
              <div className="flex flex-col items-center gap-2">
                <button onClick={p.onMute} aria-pressed={!!p.muted} aria-label={p.muted ? "Unmute" : "Mute"} className={`${circle} ${p.muted ? "bg-white text-black" : ""}`} style={p.muted ? undefined : glassDark}>
                  <MicIcon off={p.muted} size={26} />
                </button>
                <span className="text-[15px] leading-[20px]" aria-hidden>{p.muted ? "Unmute" : "Mute"}</span>
              </div>
            )}
            {p.onHold && p.status === "active" && (
              <div className="flex flex-col items-center gap-1.5">
                <button onClick={p.onHold} aria-pressed={!!p.held} aria-label={p.held ? "Unhold" : "Hold"} className={`${circle} ${p.held ? "bg-white text-black" : ""}`} style={p.held ? undefined : glassDark}>
                  <PauseIcon size={26} />
                </button>
                <span className="text-[12px]" aria-hidden>{p.held ? "Unhold" : "Hold"}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-center gap-2">
            <button onClick={p.onHangup} disabled={p.status === "ended"} className={circle} style={{ background: RED }} aria-label="Hang up">
              <PhoneIcon size={30} down />
            </button>
            <span className="text-[15px] leading-[20px]" aria-hidden>End</span>
          </div>
        </div>
      )}
    </div>
  );
}

export const iphone: Skin = {
  id: "iphone",
  label: "iPhone",
  screen: {
    className: "sk-ios bg-[var(--ios-bg)] text-[var(--ios-ink)]",
    style: { fontFamily: "var(--font-ios)", ["--sb-frame" as string]: "54px", ["--sb-bottom-frame" as string]: "34px" } as CSSProperties,
  },
  threadClass: "px-4 pt-[calc(var(--sb)+76px)] pb-2 bg-[var(--ios-bg)]",
  sheet: "ios",
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
  rich: { ink: "var(--ios-recv-ink)", mute: GRAY, accent: BLUE, onAccent: "#fff", line: "var(--ios-sep)", danger: RED, track: "var(--ios-fill)" },
};
