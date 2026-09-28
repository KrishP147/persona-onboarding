"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceStyle } from "@/lib/types";
import { turnEndDelay } from "./turnEnd";

// Voice layer. Speech in: Deepgram streaming (short-lived token from /api/voice/token), else
// browser Web Speech. Speech out: Cartesia via /api/voice/tts, else browser speechSynthesis.
// Either way the server contract is the same: text in, text + actions out.
//
// Turn-taking rules (see docs/journal/04-voice-and-edge-cases.md):
// - the user's turn ends after a pause whose length depends on whether they sound finished:
//   ~0.7s when complete, much longer when it sounds unfinished (see turnEnd.ts)
// - silence only counts when nobody is talking and nothing is pending; first reprompt at ~6s,
//   and much longer while the user is off doing a task like the gmail sign-in
// - the user can talk over the agent (barge-in); echoes of the agent's own words are ignored
// - one voice per style, picked once and remembered, so it never flips mid-call

type RecResult = { isFinal: boolean; 0: { transcript: string } };
type Rec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<RecResult> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

// People tolerate a lot more quiet on a call with someone who is there for them than a form does;
// quiet is fine: the only check-in comes after 20s (10s at the start of a call, in case they can't hear us).
const SILENCE_MS = 25000; // first silence window; later windows come from the server (policy.ts silence ladder)
// They kept talking right after a turn went out ("...so i'm just" / "curious."): one turn, not two.
const CONTINUE_MS = 1500;
const VOICE_KEY = "persona-voice-";

const MIC: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
// Dead mic: 4s with no signal at all. the call's own stream goes through noise suppression, which
// can output exact zeros in a quiet room, so zeros there only mean "check": a short raw capture
// (no processing) of the same mic decides. a live mic always has some noise on the raw side.
const DIGITAL_ZERO = 1e-6; // peak below this is digital silence (one 16-bit step is ~3e-5)
const DEAD_MS = 4000;
const PROBE_MS = 1200; // how long the raw check listens
const PROBE_OK_MS = 30000; // raw said live: don't check again for a while
const RAW: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
const TOAST_MS = 2500;

// Which input the OS calls default right now (chrome lists a "default" entry; others put it first).
const defaultInputKey = (list: MediaDeviceInfo[]) => {
  const d = list.find((x) => x.deviceId === "default") ?? list[0];
  return d ? `${d.deviceId}|${d.groupId}|${d.label}` : "";
};
const audioInputs = async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");

const VOICE_HINTS: Record<VoiceStyle, RegExp> = {
  feminine: /female|samantha|zira|aria|jenny|susan|victoria|karen|moira|tessa|libby|sonia|emma|ava/i,
  masculine: /\bmale|david|guy|daniel|mark|fred|ryan|thomas|george|andrew|brian/i,
  neutral: /google us english|natural/i,
};

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

// Pick once per style and remember it, so the same agent always sounds the same.
async function lockVoice(style: VoiceStyle): Promise<SpeechSynthesisVoice | undefined> {
  const voices = (await loadVoices()).filter((v) => v.lang.startsWith("en"));
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(VOICE_KEY + style);
  } catch {}
  const pick =
    voices.find((v) => v.voiceURI === remembered) ??
    voices.find((v) => VOICE_HINTS[style].test(v.name) && v.localService === false) ??
    voices.find((v) => VOICE_HINTS[style].test(v.name)) ??
    voices[0];
  try {
    if (pick) localStorage.setItem(VOICE_KEY + style, pick.voiceURI);
  } catch {}
  return pick;
}

async function fetchClip(sessionId: string, text: string, style: VoiceStyle, signal: AbortSignal): Promise<string | null> {
  try {
    const r = await fetch("/api/voice/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, text, style }), signal });
    if (!r.ok) return null;
    return URL.createObjectURL(await r.blob());
  } catch {
    return null;
  }
}

function speakBrowser(text: string, voice: SpeechSynthesisVoice | undefined, onStart: () => void) {
  return new Promise<void>((resolve) => {
    if (!window.speechSynthesis) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.onstart = onStart;
    if (voice) u.voice = voice;
    u.rate = 1.03;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

// first word of a short "stop" said over the agent ("stop talking", "hold on", "shh", "enough")
const STOP_WORDS = /^(wait|stop|hold|hang|sorry|no|nope|hey|actually|um|excuse|sh+|shush|enough|quiet|pause)$/i;
// a reply that's only a backchannel ("mm", "ok"): after they cut the agent off, saying it adds nothing
const TINY_REPLY = /^(m+|mhm+|hm+|uh[- ]?huh|ok(ay)?|sure|yeah|yep|got it)$/i;
const tinyReply = (t: string) => {
  const w = t.toLowerCase().replace(/[^a-z' -]/g, "").trim();
  return w.length <= 3 || TINY_REPLY.test(w);
};

const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);

// Speakers without headphones feed the agent's voice back into the mic.
// How alike two words are (0..1), so a mis-heard echo ("market" for "marka") still matches.
function similar(a: string, b: string) {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) < 3) return 0;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length);
}

// mic watchdog state: one per call
type Watch = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode | null;
  timer: ReturnType<typeof setInterval>;
  offDevices: () => void;
  lastEnergy: number;
  mutedSince: number | null; // track.muted since when
  probe: { stream: MediaStream | null; source: MediaStreamAudioSourceNode | null; analyser: AnalyserNode; started: number; heard: boolean; gone: boolean } | null;
  probeOkUntil: number;
  defaultKey: string;
};

// raw check: same mic, no echo cancelling / noise suppression / gain, read by its own analyser
function startProbe(w: Watch, deviceId?: string) {
  const p: NonNullable<Watch["probe"]> = { stream: null, source: null, analyser: w.ctx.createAnalyser(), started: Date.now(), heard: false, gone: false };
  p.analyser.fftSize = 2048;
  w.probe = p;
  navigator.mediaDevices
    .getUserMedia({ audio: deviceId ? { ...RAW, deviceId: { exact: deviceId } } : RAW })
    .then((s) => {
      if (w.probe !== p) return s.getTracks().forEach((t) => t.stop());
      p.stream = s;
      p.source = w.ctx.createMediaStreamSource(s);
      p.source.connect(p.analyser);
      p.started = Date.now();
    })
    .catch(() => {
      p.gone = true;
    });
}

// ios (every browser there is webkit, ipads report as macs with touch)
function noSecondCapture() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function endProbe(w: Watch) {
  const p = w.probe;
  w.probe = null;
  if (!p) return;
  try {
    p.source?.disconnect();
  } catch {}
  p.stream?.getTracks().forEach((t) => t.stop());
}

export type CallStatus = "idle" | "ringing" | "connecting" | "active" | "ended";

// Split a reply into sentences so the first one can start playing while the rest synthesize.
function sentences(text: string) {
  const parts = text.match(/[^.!?]+[.!?]+["')]*\s*|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    // Glue very short fragments ("okay.") onto the next so prosody stays natural.
    if (out.length && out[out.length - 1].length < 25) out[out.length - 1] += " " + p;
    else out.push(p);
  }
  return out;
}

// span: when the heard audio happened (wall clock ms), from deepgram's timestamps.
type Heard = (finals: string, interim: string, speechFinal?: boolean, span?: [number, number]) => void;

// pause: mic off (mute, hold). the recorder stops and nothing is sent; the socket stays open.
type Deepgram = { stop: () => void; pause: (on: boolean) => void };

// Deepgram live transcription straight from the browser. Resolves to stop, or null if it can't
// start (no token, blocked socket): the caller falls back to Web Speech. A new mic mid-call gets
// a fresh session: one socket carries one recording (one container header, one clock).
async function startDeepgram(sessionId: string, stream: MediaStream, onHeard: Heard, onDrop: () => void, onSpeechStart: () => void): Promise<Deepgram | null> {
  try {
    const r = await fetch(`/api/voice/token?s=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { token: string; keyterms?: unknown };
    const token = j.token;
    // Words to listen harder for (names, jargon); the route may not send any.
    const keyterms = Array.isArray(j.keyterms) ? j.keyterms.filter((k): k is string => typeof k === "string" && !!k.trim()) : [];
    const lang = (navigator.language || "en").toLowerCase().startsWith("en") ? "en" : "multi";
    const q = new URLSearchParams({ model: "nova-3", language: lang, interim_results: "true", smart_format: "true", endpointing: "400", utterance_end_ms: "1000", vad_events: "true" });
    for (const k of keyterms) q.append("keyterm", k);
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${q}`, ["bearer", token]);
    const opened = await new Promise<boolean>((resolve) => {
      ws.onopen = () => resolve(true);
      ws.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 4000);
    });
    if (!opened) {
      ws.close();
      return null;
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    let paused = false;
    let pausedAt = 0;
    let pausedMs = 0; // deepgram's clock doesn't run while nothing is sent
    rec.ondataavailable = (e) => {
      if (!paused && e.data.size && ws.readyState === WebSocket.OPEN) ws.send(e.data);
    };
    rec.start(250);
    const streamStart = Date.now(); // deepgram's timestamps count from here
    const keepAlive = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "KeepAlive" })), 8000);
    let stopped = false;
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "SpeechStarted") return onSpeechStart();
        if (m.type !== "Results") return;
        const t = String(m.channel?.alternatives?.[0]?.transcript ?? "");
        if (!t.trim()) return;
        const st = Number(m.start ?? 0);
        const t0 = streamStart + pausedMs;
        const span: [number, number] = [t0 + st * 1000, t0 + (st + Number(m.duration ?? 0)) * 1000];
        if (m.is_final) onHeard(t, "", !!m.speech_final, span);
        else onHeard("", t, false, span);
      } catch {}
    };
    ws.onclose = () => {
      clearInterval(keepAlive);
      if (stopped) return;
      try {
        rec.stop();
      } catch {}
      onDrop();
    };
    const stop = () => {
      stopped = true;
      clearInterval(keepAlive);
      try {
        rec.stop();
      } catch {}
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "CloseStream" }));
        ws.close();
      } catch {}
    };
    const pause = (on: boolean) => {
      if (on === paused || stopped) return;
      paused = on;
      try {
        if (on) {
          pausedAt = Date.now();
          if (rec.state === "recording") rec.pause();
        } else {
          pausedMs += Date.now() - pausedAt;
          if (rec.state === "paused") rec.resume();
        }
      } catch {}
    };
    return { stop, pause };
  } catch {
    return null;
  }
}

export function useVoiceCall(opts: {
  onUtterance: (text: string, interrupted: boolean, heardBefore?: string) => Promise<void>;
  onSilence: () => void;
  onEnded: (reason: "user_hangup" | "agent_ended" | "error") => void;
  onMicDenied: () => void;
  voice: VoiceStyle;
  sessionId: string | null;
}) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [caption, setCaption] = useState(""); // the sentence being spoken right now, set when audio starts
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  // hold: mic off and the agent quiet, nothing sent anywhere, nothing times out
  const [held, setHeld] = useState(false);
  const [heldAt, setHeldAt] = useState<number | null>(null);
  const heldRef = useRef(false);
  const heldEndRef = useRef<{ final: boolean } | null>(null); // a hangup that came in on hold, decided on unhold
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // the beat after "bye"
  const micOff = () => mutedRef.current || heldRef.current;
  const lastFillerRef = useRef("");

  const recRef = useRef<Rec | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | undefined>(undefined);
  const activeRef = useRef(false);
  const waitingRef = useRef(false); // server is thinking
  const speakingTextRef = useRef(""); // what the agent is saying right now
  // What it said last and when it stopped: transcripts of its own voice arrive a beat late on speakers.
  const lastSpokenRef = useRef<{ text: string; endedAt: number }>({ text: "", endedAt: 0 });
  const prevSpokenRef = useRef(""); // the line before that (echo can lag a whole turn)
  // When each spoken sentence actually played, to tell its echo from the person by timing.
  const playbackRef = useRef<{ start: number; end: number | null; text: string }[]>([]);
  const queueRef = useRef(0); // utterances queued or playing
  const bufferRef = useRef(""); // finalized user speech not yet sent
  const interruptedRef = useRef(false);
  const quietReplyRef = useRef(0); // turn whose reply answers a cut-off (0: none): don't speak a bare "mm"
  const turnSeqRef = useRef(0);
  const lastSentRef = useRef<{ text: string; at: number } | null>(null); // the last turn sent, and when
  const continueRef = useRef(""); // a sent turn they're still finishing: resent with the rest
  const cutHeardRef = useRef(""); // what they actually heard of the line they cut off
  const pendingEndRef = useRef(false);
  const usingDeepgramRef = useRef(false);
  const finalEndRef = useRef(false); // this hangup can't be talked out of (e.g. we can't reach the model)
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fillerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patienceRef = useRef<number | null>(null); // one-shot longer silence window
  const streamRef = useRef<MediaStream | null>(null);
  const stopDeepgramRef = useRef<(() => void) | null>(null);
  const pauseDeepgramRef = useRef<((on: boolean) => void) | null>(null); // the live session's pause
  const openDeepgramRef = useRef<((s: MediaStream) => Promise<(Deepgram & { dropped: boolean }) | null>) | null>(null); // a fresh session on a new mic
  const webSpeechRef = useRef<(() => boolean) | null>(null); // fallback when that fails
  const styleRef = useRef<VoiceStyle>("neutral"); // locked when the call connects
  const cloudTtsRef = useRef(true); // flips off for the rest of the call after a failure
  const genRef = useRef(0); // bumps on barge-in/hangup so queued audio is dropped
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const audioRef = useRef<{ el: HTMLAudioElement; done: () => void } | null>(null);
  const abortersRef = useRef(new Set<AbortController>()); // in-flight speech fetches, cancelled on barge-in or hangup
  const attemptRef = useRef(0); // bumps on hangup so a call still connecting gives up
  const connectingRef = useRef(false);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });
  // Mic health: a dead-mic watchdog, input switching, and following the OS default mid-call.
  const [micTroubleRaw, setMicTrouble] = useState(false);
  const [micToast, setMicToast] = useState<string | null>(null);
  const [inputId, setInputId] = useState<string | null>(null);
  const watchRef = useRef<Watch | null>(null);
  const silentRef = useRef(false); // no signal for DEAD_MS, raw check agreed
  const trackTroubleRef = useRef(false); // the track ended, or stayed muted for DEAD_MS
  const pickedRef = useRef<string | undefined>(undefined); // an input they chose; undefined follows the OS default
  const swapSeqRef = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = (t: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
    if (t.current) clearTimeout(t.current);
    t.current = null;
  };

  // Stop whatever is playing and drop anything queued.
  const stopAudio = () => {
    genRef.current += 1;
    for (const a of abortersRef.current) a.abort();
    abortersRef.current.clear();
    const a = audioRef.current;
    audioRef.current = null;
    if (a) {
      a.el.pause();
      a.done();
    }
    window.speechSynthesis?.cancel();
  };

  // Resolves true if the clip played; false if the browser blocked it (the caller falls back).
  const playUrl = (url: string, onStart: () => void) =>
    new Promise<boolean>((resolve) => {
      const el = new Audio(url);
      el.onplaying = onStart;
      const finish = (played: boolean) => {
        URL.revokeObjectURL(url);
        if (audioRef.current?.el === el) audioRef.current = null;
        resolve(played);
      };
      audioRef.current = { el, done: () => finish(true) };
      el.onended = () => finish(true);
      el.onerror = () => finish(false);
      el.play().catch(() => finish(false));
    });

  const flushRef = useRef<() => void>(() => {}); // flushTurn, set once it exists below
  const armSilence = useCallback(function arm() {
    clear(silenceTimer);
    if (micOff()) return; // unmute / unhold arms it again
    const wait = patienceRef.current ?? SILENCE_MS;
    silenceTimer.current = setTimeout(() => {
      patienceRef.current = null;
      if (!activeRef.current || micOff()) return;
      const idle = !waitingRef.current && queueRef.current === 0 && !bufferRef.current;
      if (idle) return optsRef.current.onSilence();
      // Not idle when it fired: this used to drop the ladder for good (a call sat silent for 4 minutes after one
      // check-in). Speech stuck in the buffer (a turn that never went out) goes now; otherwise look again later.
      if (bufferRef.current.trim() && !waitingRef.current && queueRef.current === 0) flushRef.current();
      else arm();
    }, wait);
  }, []);

  // The user is doing something (e.g. signing in to google): don't nag them while they do.
  const patience = useCallback(
    (ms: number) => {
      patienceRef.current = ms;
      if (silenceTimer.current) armSilence();
    },
    [armSilence],
  );

  const startRec = useCallback(() => {
    if (!activeRef.current || micOff()) return; // mic off: the fallback recognizer stays stopped
    try {
      recRef.current?.start();
    } catch {
      /* already running */
    }
    setListening(true);
  }, []);

  const syncTrouble = () => setMicTrouble(silentRef.current || trackTroubleRef.current);


  const stopMicWatch = useCallback(() => {
    swapSeqRef.current += 1; // a swap still in flight gives up
    const w = watchRef.current;
    watchRef.current = null;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = null;
    silentRef.current = false;
    trackTroubleRef.current = false;
    pickedRef.current = undefined;
    setMicTrouble(false);
    setMicToast(null);
    setInputId(null);
    if (!w) return;
    clearInterval(w.timer);
    w.offDevices();
    endProbe(w);
    try {
      w.source?.disconnect();
      w.analyser.disconnect();
    } catch {}
    void w.ctx.close().catch(() => {});
  }, []);

  // Point the analyser at this stream, and start the silence window over.
  const wireStream = useCallback((stream: MediaStream) => {
    const w = watchRef.current;
    if (!w) return;
    const track = stream.getAudioTracks()[0];
    endProbe(w);
    w.probeOkUntil = 0;
    w.mutedSince = null;
    try {
      w.source?.disconnect();
    } catch {}
    w.source = null;
    try {
      w.source = w.ctx.createMediaStreamSource(stream);
      w.source.connect(w.analyser);
    } catch {}
    w.lastEnergy = Date.now();
    silentRef.current = false;
    trackTroubleRef.current = !!track && track.readyState === "ended";
    setInputId(track?.getSettings().deviceId ?? null);
    syncTrouble();
  }, []);

  // New input mid-call (picked, or the OS moved): get it, rewire everything that listens, drop the old one.
  const swapInput = useCallback(
    async (deviceId?: string) => {
      if (!activeRef.current || !watchRef.current) return;
      const seq = ++swapSeqRef.current;
      let next: MediaStream;
      try {
        next = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { ...MIC, deviceId: { exact: deviceId } } : MIC });
      } catch {
        if (seq === swapSeqRef.current) setMicToast("couldn't switch mic");
        return;
      }
      if (seq !== swapSeqRef.current || !activeRef.current || !watchRef.current) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }
      pickedRef.current = deviceId && deviceId !== "default" ? deviceId : undefined;
      const track = next.getAudioTracks()[0];
      next.getAudioTracks().forEach((t) => (t.enabled = !micOff()));
      const old = streamRef.current;
      streamRef.current = next;
      wireStream(next);
      // Deepgram: open a fresh session on the new stream, then retire the old one.
      const open = openDeepgramRef.current;
      if (open && stopDeepgramRef.current) {
        const dg = await open(next);
        const oldStop = stopDeepgramRef.current;
        // Stale (a newer mic took over, or hung up) or the live socket dropped to Web Speech meanwhile.
        if (!activeRef.current || streamRef.current !== next || !oldStop) dg?.stop();
        else {
          oldStop(); // stopped on purpose: no drop fallback
          const live = dg && !dg.dropped ? dg : null;
          stopDeepgramRef.current = live?.stop ?? null;
          pauseDeepgramRef.current = live?.pause ?? null;
          live?.pause(micOff());
          if (!live) webSpeechRef.current?.();
        }
      }
      if (old !== next) old?.getTracks().forEach((t) => t.stop());
      if (seq !== swapSeqRef.current) return;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setMicToast(`switched to ${track?.label || "a new mic"}`);
      toastTimer.current = setTimeout(() => setMicToast(null), TOAST_MS);
    },
    [wireStream],
  );

  // One AudioContext per call: an analyser on the mic, checked every ~100ms, plus devicechange.
  const startMicWatch = useCallback(
    (stream: MediaStream) => {
      stopMicWatch();
      let ctx: AudioContext;
      try {
        ctx = new AudioContext();
      } catch {
        return; // no web audio: no watchdog, the call still works
      }
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      const buf = new Float32Array(analyser.fftSize);
      const peak = (a: AnalyserNode) => {
        a.getFloatTimeDomainData(buf);
        let m = 0;
        for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
        return m;
      };
      const timer = setInterval(() => {
        const w = watchRef.current;
        if (!w) return;
        const now = Date.now();
        // Can't measure (context suspended) or not meant to hear anything (muted, on hold): don't blame the mic.
        if (w.ctx.state !== "running" || micOff() || !w.source) {
          if (w.ctx.state === "suspended") void w.ctx.resume().catch(() => {});
          w.lastEnergy = now;
          w.mutedSince = null;
          endProbe(w);
          return;
        }
        // the track: ended counts at once, muted only if it stays muted
        const track = streamRef.current?.getAudioTracks()[0];
        if (track?.muted) w.mutedSince ??= now;
        else w.mutedSince = null;
        const trackBad = !!track && (track.readyState === "ended" || (w.mutedSince !== null && now - w.mutedSince >= DEAD_MS));
        if (trackBad !== trackTroubleRef.current) {
          trackTroubleRef.current = trackBad;
          syncTrouble();
        }
        // the signal: any sample off zero is a live mic, however quiet
        if (peak(w.analyser) >= DIGITAL_ZERO) {
          w.lastEnergy = now;
          endProbe(w);
          if (silentRef.current) {
            silentRef.current = false;
            syncTrouble();
          }
          return;
        }
        if (silentRef.current || now - w.lastEnergy < DEAD_MS) return;
        if (now < w.probeOkUntil) {
          w.lastEnergy = now; // raw said live recently: zeros here are just noise suppression
          return;
        }
        // zeros for 4s: ask the raw mic before blaming it. not on ios: a second capture there can
        // mute or end the call's own track, so only the ended/muted checks count on iphones.
        if (!w.probe && noSecondCapture()) {
          w.probeOkUntil = now + PROBE_OK_MS;
          w.lastEnergy = now;
          return;
        }
        if (!w.probe) return startProbe(w, track?.getSettings().deviceId);
        const p = w.probe;
        if (p.gone) {
          endProbe(w);
          w.probeOkUntil = now + PROBE_OK_MS; // couldn't check: don't nag
          w.lastEnergy = now;
          return;
        }
        if (!p.source) return; // still opening
        if (peak(p.analyser) >= DIGITAL_ZERO) p.heard = true;
        if (now - p.started < PROBE_MS && !p.heard) return;
        endProbe(w);
        if (p.heard) {
          w.probeOkUntil = now + PROBE_OK_MS;
          w.lastEnergy = now;
        } else {
          silentRef.current = true;
          syncTrouble();
        }
      }, 100);
      // Unplugged, or the OS default moved: follow it without dropping the call.
      const onDevices = async () => {
        const w = watchRef.current;
        if (!w || !activeRef.current) return;
        let list: MediaDeviceInfo[];
        try {
          list = await audioInputs();
        } catch {
          return;
        }
        if (watchRef.current !== w) return;
        const cur = streamRef.current?.getAudioTracks()[0];
        const curId = cur?.getSettings().deviceId;
        const gone = !cur || cur.readyState === "ended" || (!!curId && curId !== "default" && !list.some((d) => d.deviceId === curId));
        const key = defaultInputKey(list);
        const moved = !pickedRef.current && !!w.defaultKey && key !== w.defaultKey;
        w.defaultKey = key;
        if (gone || moved) void swapInput();
      };
      const md = navigator.mediaDevices;
      md.addEventListener("devicechange", onDevices);
      watchRef.current = {
        ctx,
        analyser,
        source: null,
        timer,
        offDevices: () => md.removeEventListener("devicechange", onDevices),
        lastEnergy: Date.now(),
        mutedSince: null,
        probe: null,
        probeOkUntil: 0,
        defaultKey: "",
      };
      void audioInputs()
        .then((list) => {
          if (watchRef.current?.ctx === ctx) watchRef.current.defaultKey = defaultInputKey(list);
        })
        .catch(() => {});
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      wireStream(stream);
    },
    [stopMicWatch, swapInput, wireStream],
  );

  useEffect(() => stopMicWatch, [stopMicWatch]);

  const teardown = useCallback(() => {
    mutedRef.current = false;
    setMuted(false);
    heldRef.current = false;
    heldEndRef.current = null;
    setHeld(false);
    setHeldAt(null);
    activeRef.current = false;
    [silenceTimer, turnTimer, fillerTimer, endTimer].forEach(clear);
    try {
      recRef.current?.abort();
    } catch {}
    recRef.current = null;
    stopDeepgramRef.current?.();
    stopDeepgramRef.current = null;
    pauseDeepgramRef.current = null;
    openDeepgramRef.current = null;
    webSpeechRef.current = null;
    stopMicWatch();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    stopAudio();
    queueRef.current = 0;
    bufferRef.current = "";
    pendingEndRef.current = false;
    waitingRef.current = false;
    patienceRef.current = null;
    interruptedRef.current = false;
    quietReplyRef.current = 0;
    lastSentRef.current = null;
    continueRef.current = "";
    setListening(false);
    setSpeaking(false);
    setHeard("");
    setCaption("");
  }, [stopMicWatch]);

  const hangUp = useCallback(
    (reason: "user_hangup" | "agent_ended" | "error" = "user_hangup") => {
      attemptRef.current += 1; // a call still connecting gives up
      if (!activeRef.current) {
        if (connectingRef.current) {
          connectingRef.current = false;
          teardown();
          setStatus("idle");
        }
        return;
      }
      teardown();
      setStatus("ended");
      optsRef.current.onEnded(reason);
      setTimeout(() => setStatus("idle"), 1500);
    },
    [teardown],
  );

  const speak = useCallback(
    // Resolves once this line has finished playing (or was cut off), so the chat can wait for it.
    (text: string, isFiller = false): Promise<void> => {
      if (!activeRef.current || !text.trim()) return Promise.resolve();
      if (heldRef.current) return Promise.resolve(); // on hold: a late reply stays in the thread, unspoken
      if (!isFiller && quietReplyRef.current !== 0 && tinyReply(text)) return Promise.resolve();
      if (!isFiller) clear(fillerTimer);
      clear(silenceTimer);
      queueRef.current += 1;
      const gen = genRef.current;
      const parts = sentences(text);
      // Start synthesizing every sentence now; play them in order.
      const ctrl = new AbortController();
      abortersRef.current.add(ctrl);
      const clips = parts.map((p) => (cloudTtsRef.current && optsRef.current.sessionId ? fetchClip(optsRef.current.sessionId, p, styleRef.current, ctrl.signal) : Promise.resolve(null)));
      const done = () => {
        queueRef.current = Math.max(0, queueRef.current - 1);
        if (queueRef.current > 0) return;
        prevSpokenRef.current = lastSpokenRef.current.text;
        lastSpokenRef.current = { text: speakingTextRef.current, endedAt: Date.now() };
        speakingTextRef.current = "";
        setSpeaking(false);
        if (pendingEndRef.current) {
          pendingEndRef.current = false;
          endTimer.current = setTimeout(() => hangUp("agent_ended"), 400); // a beat after "bye", like a person
        } else if (!waitingRef.current) armSilence();
      };
      let finished = () => {};
      const spoken = new Promise<void>((res) => (finished = res));
      chainRef.current = chainRef.current
        .then(async () => {
          for (let i = 0; i < parts.length; i++) {
            if (gen !== genRef.current || !activeRef.current) return;
            speakingTextRef.current = text;
            setSpeaking(true);
            const url = await clips[i];
            if (gen !== genRef.current || !activeRef.current) return;
            const show = () => {
              setCaption(parts[i]);
              playbackRef.current = [...playbackRef.current.slice(-6), { start: Date.now(), end: null, text: parts[i] }];
            };
            const played = url ? await playUrl(url, show) : false;
            if (!played && gen === genRef.current && activeRef.current) {
              if (!url) cloudTtsRef.current = false;
              await speakBrowser(parts[i], voiceRef.current, show);
            }
            const last = playbackRef.current[playbackRef.current.length - 1];
            if (last && last.end === null) last.end = Date.now();
          }
        })
        .catch(() => {})
        .finally(() => {
          abortersRef.current.delete(ctrl);
          if (gen === genRef.current) done();
          finished();
        });
      return spoken;
    },
    [armSilence, hangUp],
  );

  const endAfterSpeaking = useCallback(
    (final = false) => {
      finalEndRef.current = final;
      // never hang up on someone who put us on hold: decide when they're back
      if (heldRef.current) {
        heldEndRef.current = { final: final || !!heldEndRef.current?.final };
        return;
      }
      if (queueRef.current > 0 || window.speechSynthesis?.speaking) pendingEndRef.current = true;
      else hangUp("agent_ended");
    },
    [hangUp],
  );

  // User finished a turn: send it, with a spoken filler if the reply is slow.
  const flushTurn = useCallback(() => {
    const own = bufferRef.current.trim();
    bufferRef.current = "";
    // the rest of a sentence already sent goes out whole, as a turn that talks over the first half's reply
    const prev = own ? continueRef.current : "";
    continueRef.current = "";
    const text = prev ? `${prev} ${own}` : own;
    if (text) setHeard(text); // keep their full sentence on screen until they speak again
    if (!text || !activeRef.current) return;
    lastSentRef.current = { text, at: Date.now() };
    const interrupted = interruptedRef.current || !!prev;
    const heardBefore = interrupted ? cutHeardRef.current : undefined;
    cutHeardRef.current = "";
    interruptedRef.current = false;
    const turn = ++turnSeqRef.current;
    quietReplyRef.current = interrupted ? turn : 0;
    // "stop" / "shh" over the agent: no thinking-out-loud filler either
    const hushed = interrupted && words(text).length <= 2 && STOP_WORDS.test(words(text)[0] ?? "");
    waitingRef.current = true;
    clear(silenceTimer);
    // Thinking out loud, like a person: a short "hmm" if the reply takes over ~1s, and "let me think
    // that through" if it's still coming at ~3s (clark & fox tree 2002: uh/um mark short vs long
    // delays; shiwa et al. 2008: fillers soften slow replies). Never on fast replies, never stacked twice.
    // Which pause fits depends on what they said: nobody says "let me think" to "i'm zach". A simple answer
    // (a name, a yes, a few words) gets silence, and only a plain "one sec." if the reply is really slow; a real
    // question or request can get a "hmm", then "let me think about that" once it's clearly taking a while.
    clear(fillerTimer);
    const stillWaiting = () => waitingRef.current && queueRef.current === 0 && !micOff() && activeRef.current && !hushed;
    const thinking = needsThought(text);
    fillerTimer.current = setTimeout(() => {
      if (!stillWaiting()) return;
      if (thinking && Math.random() < 0.35) void speak(pickFiller(SHORT_FILLERS, lastFillerRef), true);
      fillerTimer.current = setTimeout(() => {
        if (stillWaiting()) void speak(pickFiller(thinking ? LONG_FILLERS : HOLD_FILLERS, lastFillerRef), true);
      }, thinking ? 2000 : 2600);
    }, 1100);
    optsRef.current.onUtterance(text, interrupted, heardBefore).finally(() => {
      waitingRef.current = false;
      if (quietReplyRef.current === turn) quietReplyRef.current = 0;
      clear(fillerTimer);
      if (queueRef.current === 0) armSilence();
    });
  }, [armSilence, speak]);
  useEffect(() => {
    flushRef.current = flushTurn;
  }, [flushTurn]);

  // Mic off or on: the track goes silent, the deepgram recorder pauses (nothing is sent), and the
  // fallback recognizer stops; back on, all of it resumes.
  const applyMic = useCallback(() => {
    const off = micOff();
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !off));
    pauseDeepgramRef.current?.(off);
    if (!off) return startRec();
    try {
      recRef.current?.abort();
    } catch {}
    setListening(false);
  }, [startRec]);

  // Mute: mic off, call live. The agent keeps talking if it was, nothing reaches stt, silence doesn't
  // count (no check-ins), the mic watchdog rests. Unmute starts the silence window over. The agent is never told.
  const toggleMute = useCallback(() => {
    const m = !mutedRef.current;
    mutedRef.current = m;
    setMuted(m);
    applyMic();
    if (m) {
      clear(turnTimer);
      clear(silenceTimer);
      if (bufferRef.current.trim()) flushTurn(); // what they said before muting still counts
    } else if (activeRef.current && queueRef.current === 0 && !waitingRef.current) armSilence();
  }, [applyMic, armSilence, flushTurn]);

  // Hold: the agent stops mid-word, the mic goes off, nothing reaches stt or the server, and nothing
  // times out (silence, fillers, the watchdog, a pending hangup). Client only: the server never hears of it.
  // Unhold: one short line, spoken here, then it listens with a fresh silence window.
  const toggleHold = useCallback(() => {
    if (!activeRef.current) return;
    const h = !heldRef.current;
    heldRef.current = h;
    setHeld(h);
    setHeldAt(h ? Date.now() : null);
    applyMic();
    if (h) {
      [silenceTimer, turnTimer, fillerTimer].forEach(clear);
      if (endTimer.current || pendingEndRef.current) heldEndRef.current = { final: finalEndRef.current };
      clear(endTimer);
      pendingEndRef.current = false;
      stopAudio();
      queueRef.current = 0;
      speakingTextRef.current = "";
      bufferRef.current = ""; // half a sentence before hold isn't a turn
      continueRef.current = "";
      lastSentRef.current = null;
      setSpeaking(false);
      setCaption("");
      setHeard("");
      return;
    }
    const end = heldEndRef.current;
    heldEndRef.current = null;
    // a hangup we can't talk out of still happens; an ordinary goodbye is dropped: they came back to talk
    if (end?.final) return hangUp("agent_ended");
    void speak(BACK_LINE, true);
  }, [applyMic, hangUp, speak]);

  const accept = useCallback(async () => {
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    const attempt = ++attemptRef.current;
    const cancelled = () => attemptRef.current !== attempt;
    connectingRef.current = true;
    setStatus("connecting");
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: MIC });
    } catch {
      connectingRef.current = false;
      setStatus("idle");
      optsRef.current.onMicDenied();
      return false;
    }
    if (cancelled()) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return false;
    }
    styleRef.current = optsRef.current.voice;
    cloudTtsRef.current = true;
    genRef.current += 1;
    if (window.speechSynthesis) voiceRef.current = await lockVoice(styleRef.current);

    const onHeard: Heard = (finals, interim, speechFinal, span) => {
      if (micOff()) return; // muted or on hold: nothing they say reaches the agent
      const latest = (finals || interim).trim();
      if (!latest) return;
      // A final goodbye is already on its way: let it finish; nothing said now changes the ending.
      if (finalEndRef.current && pendingEndRef.current) return;
      // Half duplex, like a speakerphone: anything heard while we were talking (by deepgram's own
      // timestamps, or by arrival time without them) is our voice coming back through the mic,
      // unless it's clearly them cutting in: 3+ words we didn't just say, or a lone "wait"/"stop".
      // Ignored audio never shows up as "you".
      const now = Date.now();
      // still finishing the sentence that just went out (reply in flight or barely started)
      const sent = lastSentRef.current;
      const continues = !!sent && (span ? span[0] : now) - sent.at < CONTINUE_MS && (waitingRef.current || queueRef.current > 0);
      const recent = lastSpokenRef.current;
      const overlapping = span ? playbackRef.current.filter((p) => span[0] < (p.end ?? now) + 300 && span[1] > p.start) : [];
      const duringUs = queueRef.current > 0 || overlapping.length > 0 || (!span && now - recent.endedAt < 1200);
      if (duringUs) {
        const said = words([speakingTextRef.current, recent.text, prevSpokenRef.current, ...overlapping.map((p) => p.text)].join(" "));
        const heardWords = words(latest);
        const novel = heardWords.filter((w) => !said.some((x) => similar(w, x) >= 0.6));
        const cutsIn = novel.length >= 3 && novel.length / heardWords.length >= 0.5;
        const saysStop = heardWords.length <= 2 && STOP_WORDS.test(heardWords[0] ?? "") && !said.some((x) => similar(heardWords[0], x) >= 0.8);
        const goesOn = continues && novel.length === heardWords.length; // none of it is our echo
        if (!cutsIn && !saysStop && !goesOn) return;
      }
      // Real speech over the agent: stop talking and listen (barge-in).
      if (queueRef.current > 0) {
        // Only the sentences that started playing were heard; the agent shouldn't assume the rest.
        const cut = speakingTextRef.current;
        cutHeardRef.current = playbackRef.current.filter((p) => cut.includes(p.text)).map((p) => p.text).join(" ");
        stopAudio();
        queueRef.current = 0;
        pendingEndRef.current = false;
        speakingTextRef.current = "";
        setSpeaking(false);
        interruptedRef.current = true;
      }
      if (continues && sent && !continueRef.current) {
        continueRef.current = sent.text;
        lastSentRef.current = null;
        clear(fillerTimer); // no "hmm" over them while they finish
      }
      clear(silenceTimer);
      if (finals.trim()) bufferRef.current += ` ${finals.trim()}`;
      setHeard((bufferRef.current + " " + interim).trim());
      // End of turn = a pause, not the first final result. Long prompts stay whole,
      // and the pause we wait for depends on whether they sound finished.
      clear(turnTimer);
      patienceRef.current = null; // they're back
      const fire = (tries: number) => {
        // With deepgram, never send a draft transcript: its final version (same words, maybe more)
        // is on the way, and sending both repeated the sentence. Wait a little for it instead.
        if (usingDeepgramRef.current && interim.trim() && !finals.trim() && tries < 4) {
          turnTimer.current = setTimeout(() => fire(tries + 1), 350);
          return;
        }
        if (interim.trim() && !finals.trim()) bufferRef.current += ` ${interim.trim()}`;
        flushTurn();
      };
      turnTimer.current = setTimeout(() => fire(0), turnEndDelay(`${bufferRef.current} ${interim}`, speechFinal, usingDeepgramRef.current));
    };

    // Prefer Deepgram; fall back to the browser recognizer if it can't start or drops mid-call.
    const startWebSpeech = () => {
      if (!Ctor) return false;
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = navigator.language || "en-US";
      rec.onresult = (e) => {
        let interim = "";
        let finals = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) finals += t;
          else interim += t;
        }
        onHeard(finals, interim);
      };
      rec.onend = () => {
        // Chrome ends recognition on its own every so often; keep the line open.
        if (activeRef.current && recRef.current === rec) setTimeout(startRec, 150);
        else setListening(false);
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          const wasLive = activeRef.current;
          teardown();
          setStatus("idle");
          // Mid-call: the server must hear the call ended, or it thinks we're still on the line.
          if (wasLive) optsRef.current.onEnded("error");
          else optsRef.current.onMicDenied();
        }
        // "no-speech", "network", "aborted": onend restarts; silence is handled by our own timer.
      };
      recRef.current = rec;
      startRec();
      return true;
    };
    const stream = streamRef.current;
    const sid = optsRef.current.sessionId;
    activeRef.current = true;
    // The moment they start talking over it, drop its volume; the first real word stops it.
    const onSpeechStart = () => {
      const a = audioRef.current;
      if (!a || queueRef.current === 0) return;
      // Speech detected while it's talking is often its own voice; ducking is cheap, stopping waits for words.
      a.el.volume = 0.3;
      setTimeout(() => {
        if (audioRef.current?.el === a.el) a.el.volume = 1; // just a noise: back to normal
      }, 1500);
    };
    // One Deepgram session per mic stream. Only the live one's drop falls back to Web Speech;
    // a session that drops before it goes live is marked so the caller skips it.
    const openDeepgram = async (s: MediaStream) => {
      if (!sid) return null;
      const box: Deepgram & { dropped: boolean } = { stop: () => {}, pause: () => {}, dropped: false };
      const dg = await startDeepgram(sid, s, onHeard, () => {
        box.dropped = true;
        if (stopDeepgramRef.current !== box.stop) return;
        stopDeepgramRef.current = null; // socket gone; a later mic swap leaves Web Speech on its own mic
        pauseDeepgramRef.current = null;
        if (activeRef.current) startWebSpeech();
      }, onSpeechStart);
      if (!dg) return null;
      box.stop = dg.stop;
      box.pause = dg.pause;
      return box.dropped ? null : box;
    };
    const dg = stream ? await openDeepgram(stream) : null;
    if (cancelled()) {
      // Hung up while we were connecting: close everything we opened.
      dg?.stop();
      connectingRef.current = false;
      return false;
    }
    connectingRef.current = false;
    usingDeepgramRef.current = !!dg;
    if (dg) {
      stopDeepgramRef.current = dg.stop;
      pauseDeepgramRef.current = dg.pause;
      dg.pause(micOff());
      openDeepgramRef.current = openDeepgram;
      webSpeechRef.current = startWebSpeech;
    }
    else if (!startWebSpeech()) {
      teardown();
      setStatus("idle");
      optsRef.current.onMicDenied();
      return false;
    }
    if (stream) startMicWatch(stream);
    waitingRef.current = true; // the agent greets first
    setStartedAt(Date.now());
    setStatus("active");
    setListening(true);
    return true;
  }, [flushTurn, startMicWatch, startRec, teardown]);

  // Greeting arrived (or failed): release the "waiting" hold.
  const greeted = useCallback(() => {
    waitingRef.current = false;
    if (queueRef.current === 0) armSilence();
  }, [armSilence]);

  // Tab closed or navigated mid-call: the server still learns about the hangup.
  useEffect(() => {
    const onHide = () => {
      if (activeRef.current) optsRef.current.onEnded("user_hangup");
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  // muted or on hold is on purpose: never nag about a mic they switched off themselves
  const micTrouble = micTroubleRaw && !muted && !held && status === "active";
  return { status, setStatus, speaking, listening, heard, caption, startedAt, accept, hangUp, speak, endAfterSpeaking, greeted, patience, muted, toggleMute, held, heldAt, toggleHold, micTrouble, micToast, inputId, swapInput };
}

const BACK_LINE = "i'm back, go ahead.";
const SHORT_FILLERS = ["hmm.", "hmm, okay."];
const LONG_FILLERS = ["let me think about that for a second.", "good question, give me a second."];
// a slow reply to something simple: just hold, no pretend thinking
const HOLD_FILLERS = ["one sec.", "hold on."];
// a question, or a request with some meat to it (not "i'm zach", "yeah", "sure")
function needsThought(t: string) {
  const w = t.trim().split(/\s+/).length;
  return /\?\s*$/.test(t.trim()) || (w >= 6 && /\b(how|why|what|which|should|could|can you|help|find|plan|compare|explain|figure)\b/i.test(t));
}
function pickFiller(list: string[], last: { current: string }) {
  const options = list.filter((f) => f !== last.current);
  const f = options[Math.floor(Math.random() * options.length)] ?? list[0];
  last.current = f;
  return f;
}
