"use client";
// pieces every skin uses: icons, the persona avatar, voice notes, clocks, text helpers
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Msg } from "@/lib/types";

export const AGENT_NUMBER = "+1 (650) 555-0142";

export function PhoneIcon({ down, size = 22 }: { down?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden style={down ? { transform: "rotate(135deg)" } : undefined}>
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" />
    </svg>
  );
}

export function MicIcon({ off, size = 20, stroke = 2 }: { off?: boolean; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

// hold: two bars, like a pause
export function PauseIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
      <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
    </svg>
  );
}

// captions: a speech box with two lines of text
export function CcIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M7 10.5h6M15.5 10.5H17M7 14h3M12.5 14H17" />
    </svg>
  );
}

export function BubbleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
      <path d="M4 5h16v11H9l-5 4z" />
    </svg>
  );
}

export function GoogleG({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.2-8.5 2.2-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

// persona's logo (black mark on white), the saved contact's photo
export function PersonaLogo({ size }: { size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/persona-logo.png" alt="Persona" width={size} height={size} className="rounded-full bg-white object-cover shrink-0" style={{ width: size, height: size }} />
  );
}

export function PersonSilhouette({ size, color = "currentColor" }: { size: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <circle cx="12" cy="8.5" r="4.2" />
      <path d="M3.8 21c.6-4.4 4-6.6 8.2-6.6s7.6 2.2 8.2 6.6z" />
    </svg>
  );
}

export function RecTimer({ startedAt }: { startedAt: number }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(id);
  }, [startedAt]);
  return <span className="tabular-nums">{`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`}</span>;
}

// a voice note: play it back (this device only; the audio isn't stored), transcript below
export function VoiceNote({ url, seconds, knob = "bg-white/20", bar = "bg-white/60", ink = "text-white/75" }: { url?: string; seconds?: number; knob?: string; bar?: string; ink?: string }) {
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const toggle = () => {
    if (!url) return;
    if (!audio.current) {
      audio.current = new Audio(url);
      audio.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audio.current.pause();
      setPlaying(false);
    } else {
      void audio.current.play();
      setPlaying(true);
    }
  };
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <button onClick={toggle} disabled={!url} aria-label={playing ? "Pause voice note" : "Play voice note"} className={`w-8 h-8 rounded-full ${knob} disabled:opacity-40 flex items-center justify-center`}>
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            <rect x="2" y="1" width="3" height="10" />
            <rect x="7" y="1" width="3" height="10" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            <path d="M3 1.5v9l7-4.5z" />
          </svg>
        )}
      </button>
      <span className="flex items-end gap-[2px] h-5" aria-hidden>
        {[6, 12, 8, 16, 10, 14, 6, 12, 9, 15, 7, 11].map((h, i) => (
          <span key={i} className={`w-[3px] rounded-full ${bar}`} style={{ height: h }} />
        ))}
      </span>
      <span className={`text-[11px] ${ink} tabular-nums`}>{seconds ? `0:${String(seconds).padStart(2, "0")}` : "voice note"}</span>
    </div>
  );
}

// the bubble body: attachments, then the words
export function BubbleBody({ m, voice }: { m: Msg; voice?: { knob?: string; bar?: string; ink?: string } }) {
  return (
    <>
      {m.attachments?.map((a, i) =>
        a.kind === "audio" ? (
          <VoiceNote key={i} url={a.localUrl} seconds={a.seconds} {...voice} />
        ) : a.dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={a.dataUrl} alt={a.name} className="rounded-xl mb-1 max-h-48" />
        ) : (
          <div key={i} className="text-xs opacity-80 mb-1">📎 {a.name}</div>
        ),
      )}
      {linkify(m.text)}
    </>
  );
}

export function useClock(opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }) {
  const [t, setT] = useState("");
  const key = JSON.stringify(opts);
  useEffect(() => {
    const o = JSON.parse(key) as Intl.DateTimeFormatOptions;
    const tick = () => setT(new Date().toLocaleTimeString([], o).replace(/\s?[AP]M$/i, ""));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [key]);
  return t;
}

// seconds since a start time, ticking once a second
export function useElapsed(startedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

export const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
export const isToday = (ts: number) => new Date(ts).toDateString() === new Date().toDateString();

export function linkify(text: string) {
  return text.split(/(yourpersona\.com\/legal)/).map((part, i) =>
    part === "yourpersona.com/legal" ? (
      <a key={i} href="https://yourpersona.com/legal" target="_blank" rel="noreferrer" className="underline">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

// "Call ended (42s)" -> label + whether it was declined
export function callLog(text: string) {
  const ended = text.match(/^Call ended \((\d+)s\)/);
  const secs = ended ? Number(ended[1]) : 0;
  const declined = text === "Call declined";
  const dur = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return { ended: !!ended, declined, dur };
}

// the event rows every skin skips or turns into a call log
export function eventKind(text: string): "hidden" | "call" | "plain" {
  if (text === "Call started") return "hidden"; // the "Call ended" row carries the duration
  if (/^Call (ended|declined)/.test(text)) return "call";
  return "plain";
}

// a textarea that grows with its content, like a phone's message field. capped at maxPx (the
// composer: ~6 lines, then it scrolls internally); left uncapped for the draft card's edit fields.
export function useAutoGrow(value: string, maxPx?: number) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    const full = el.scrollHeight;
    el.style.height = `${maxPx ? Math.min(full, maxPx) : full}px`;
    el.style.overflowY = maxPx && full > maxPx ? "auto" : "hidden";
  }, [value, maxPx]);
  return ref;
}

// enter sends, like a phone; shift+enter makes a new line
export const onComposerKeyDown = (onSubmit: () => void) => (e: KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    onSubmit();
  }
};
