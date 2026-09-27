"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceStyle } from "@/lib/types";

// Voice layer. Speech in: Deepgram streaming (short-lived token from /api/voice/token), else
// browser Web Speech. Speech out: Cartesia via /api/voice/tts, else browser speechSynthesis.
// Either way the server contract is the same: text in, text + actions out.
//
// Turn-taking rules (see docs/journal/04-voice-and-edge-cases.md):
// - the user's turn ends after a pause whose length depends on whether they sound finished:
//   ~0.7s when complete, longer mid-phrase or while spelling things out (humans gap ~0-200ms,
//   and gaps past ~600-700ms start to read as hesitation: Stivers et al. 2009, Kendrick & Torreira 2015)
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

const SILENCE_MS = 6000;
const TURN_END_COMPLETE_MS = 350;
const TURN_END_MIDPHRASE_MS = 850;
const TURN_END_SPELLING_MS = 1400;
const TRAILING = /\b(and|but|or|so|because|the|a|an|my|is|are|to|of|with|for|um+|uh+|like|then|if|at|dot)$/i;
const SPELLING = /(\d\s*){3,}$|@|\bdot\b|\bat\b\s*$|\bemail is\b|\bnumber is\b|\baddress is\b/i;

// How long to wait before deciding the user is done talking.
function turnEndDelay(text: string, speechFinal = false) {
  const t = text.trim();
  if (SPELLING.test(t)) return TURN_END_SPELLING_MS;
  if (TRAILING.test(t) || /,$/.test(t)) return TURN_END_MIDPHRASE_MS;
  // Deepgram already heard the pause: answer almost right away, like a person would.
  return speechFinal ? 0 : TURN_END_COMPLETE_MS; // deepgram already heard the pause: answer now
}
const VOICE_KEY = "persona-voice-";

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

const STOP_WORDS = /^(wait|stop|hold|hang|sorry|no|nope|hey|actually|um|excuse)$/i;

const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);

// Speakers without headphones feed the agent's voice back into the mic.
function looksLikeEcho(heard: string, speaking: string) {
  const h = words(heard);
  if (h.length === 0) return true;
  const said = new Set(words(speaking));
  const overlap = h.filter((w) => said.has(w)).length / h.length;
  return overlap >= 0.6;
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

type Heard = (finals: string, interim: string, speechFinal?: boolean) => void;

// Deepgram live transcription straight from the browser. Resolves to a stop function, or null
// if it can't start (no token, blocked socket): the caller falls back to Web Speech.
async function startDeepgram(sessionId: string, stream: MediaStream, onHeard: Heard, onDrop: () => void, onSpeechStart: () => void): Promise<(() => void) | null> {
  try {
    const r = await fetch(`/api/voice/token?s=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    if (!r.ok) return null;
    const { token } = (await r.json()) as { token: string };
    const lang = (navigator.language || "en").toLowerCase().startsWith("en") ? "en" : "multi";
    const q = new URLSearchParams({ model: "nova-3", language: lang, interim_results: "true", smart_format: "true", endpointing: "250", utterance_end_ms: "1000", vad_events: "true" });
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
    rec.ondataavailable = (e) => {
      if (e.data.size && ws.readyState === WebSocket.OPEN) ws.send(e.data);
    };
    rec.start(250);
    const keepAlive = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "KeepAlive" })), 8000);
    let stopped = false;
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "SpeechStarted") return onSpeechStart();
        if (m.type !== "Results") return;
        const t = String(m.channel?.alternatives?.[0]?.transcript ?? "");
        if (!t.trim()) return;
        if (m.is_final) onHeard(t, "", !!m.speech_final);
        else onHeard("", t);
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
    return () => {
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
  } catch {
    return null;
  }
}

export function useVoiceCall(opts: {
  onUtterance: (text: string, interrupted: boolean) => Promise<void>;
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

  const recRef = useRef<Rec | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | undefined>(undefined);
  const activeRef = useRef(false);
  const waitingRef = useRef(false); // server is thinking
  const speakingTextRef = useRef(""); // what the agent is saying right now
  const queueRef = useRef(0); // utterances queued or playing
  const bufferRef = useRef(""); // finalized user speech not yet sent
  const interruptedRef = useRef(false);
  const pendingEndRef = useRef(false);
  const finalEndRef = useRef(false); // this hangup can't be talked out of (e.g. we can't reach the model)
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fillerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patienceRef = useRef<number | null>(null); // one-shot longer silence window
  const streamRef = useRef<MediaStream | null>(null);
  const stopDeepgramRef = useRef<(() => void) | null>(null);
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

  const armSilence = useCallback(() => {
    clear(silenceTimer);
    const wait = patienceRef.current ?? SILENCE_MS;
    silenceTimer.current = setTimeout(() => {
      patienceRef.current = null;
      const idle = activeRef.current && !waitingRef.current && queueRef.current === 0 && !bufferRef.current;
      if (idle) optsRef.current.onSilence();
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
    if (!activeRef.current) return;
    try {
      recRef.current?.start();
    } catch {
      /* already running */
    }
    setListening(true);
  }, []);

  const teardown = useCallback(() => {
    activeRef.current = false;
    [silenceTimer, turnTimer, fillerTimer].forEach(clear);
    try {
      recRef.current?.abort();
    } catch {}
    recRef.current = null;
    stopDeepgramRef.current?.();
    stopDeepgramRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    stopAudio();
    queueRef.current = 0;
    bufferRef.current = "";
    pendingEndRef.current = false;
    waitingRef.current = false;
    patienceRef.current = null;
    interruptedRef.current = false;
    setListening(false);
    setSpeaking(false);
    setHeard("");
    setCaption("");
  }, []);

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
    (text: string, isFiller = false) => {
      if (!activeRef.current || !text.trim()) return;
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
        speakingTextRef.current = "";
        setSpeaking(false);
        if (pendingEndRef.current) {
          pendingEndRef.current = false;
          setTimeout(() => hangUp("agent_ended"), 400); // a beat after "bye", like a person
        } else if (!waitingRef.current) armSilence();
      };
      chainRef.current = chainRef.current
        .then(async () => {
          for (let i = 0; i < parts.length; i++) {
            if (gen !== genRef.current || !activeRef.current) return;
            speakingTextRef.current = text;
            setSpeaking(true);
            const url = await clips[i];
            if (gen !== genRef.current || !activeRef.current) return;
            const show = () => setCaption(parts[i]);
            const played = url ? await playUrl(url, show) : false;
            if (!played && gen === genRef.current && activeRef.current) {
              if (!url) cloudTtsRef.current = false;
              await speakBrowser(parts[i], voiceRef.current, show);
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          abortersRef.current.delete(ctrl);
          if (gen === genRef.current) done();
        });
    },
    [armSilence, hangUp],
  );

  const endAfterSpeaking = useCallback(
    (final = false) => {
      finalEndRef.current = final;
      if (queueRef.current > 0 || window.speechSynthesis?.speaking) pendingEndRef.current = true;
      else hangUp("agent_ended");
    },
    [hangUp],
  );

  // User finished a turn: send it, with a spoken filler if the reply is slow.
  const flushTurn = useCallback(() => {
    const text = bufferRef.current.trim();
    bufferRef.current = "";
    if (text) setHeard(text); // keep their full sentence on screen until they speak again
    if (!text || !activeRef.current) return;
    const interrupted = interruptedRef.current;
    interruptedRef.current = false;
    waitingRef.current = true;
    clear(silenceTimer);
    optsRef.current.onUtterance(text, interrupted).finally(() => {
      waitingRef.current = false;
      clear(fillerTimer);
      if (queueRef.current === 0) armSilence();
    });
  }, [armSilence]);

  const accept = useCallback(async () => {
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    const attempt = ++attemptRef.current;
    const cancelled = () => attemptRef.current !== attempt;
    connectingRef.current = true;
    setStatus("connecting");
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
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

    const onHeard: Heard = (finals, interim, speechFinal) => {
      const latest = (finals || interim).trim();
      if (!latest) return;
      // A final goodbye is already on its way: let it finish; nothing said now changes the ending.
      if (finalEndRef.current && pendingEndRef.current) return;
      // While the agent talks, ignore its own voice coming back through the mic.
      if (queueRef.current > 0 && looksLikeEcho(latest, speakingTextRef.current)) return;
      // Real speech over the agent: stop talking and listen (barge-in).
      // Two real words, or one clear "wait"/"stop", stops it (a single stray word from noise doesn't).
      const heardWords = words(latest);
      if (queueRef.current > 0 && (heardWords.length >= 2 || STOP_WORDS.test(heardWords[0] ?? ""))) {
        stopAudio();
        queueRef.current = 0;
        pendingEndRef.current = false;
        speakingTextRef.current = "";
        setSpeaking(false);
        interruptedRef.current = true;
      }
      clear(silenceTimer);
      if (finals.trim()) bufferRef.current += ` ${finals.trim()}`;
      setHeard((bufferRef.current + " " + interim).trim());
      // End of turn = a pause, not the first final result. Long prompts stay whole,
      // and the pause we wait for depends on whether they sound finished.
      clear(turnTimer);
      patienceRef.current = null; // they're back
      turnTimer.current = setTimeout(() => {
        if (interim.trim() && !finals.trim()) bufferRef.current += ` ${interim.trim()}`;
        flushTurn();
      }, turnEndDelay(`${bufferRef.current} ${interim}`, speechFinal));
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
      a.el.volume = 0.3;
      setTimeout(() => {
        if (audioRef.current?.el === a.el) a.el.volume = 1; // just a noise: back to normal
      }, 1500);
    };
    const stopDg = stream && sid ? await startDeepgram(sid, stream, onHeard, () => void (activeRef.current && startWebSpeech()), onSpeechStart) : null;
    if (cancelled()) {
      // Hung up while we were connecting: close everything we opened.
      stopDg?.();
      connectingRef.current = false;
      return false;
    }
    connectingRef.current = false;
    if (stopDg) stopDeepgramRef.current = stopDg;
    else if (!startWebSpeech()) {
      teardown();
      setStatus("idle");
      optsRef.current.onMicDenied();
      return false;
    }
    waitingRef.current = true; // the agent greets first
    setStartedAt(Date.now());
    setStatus("active");
    setListening(true);
    return true;
  }, [flushTurn, startRec, teardown, hangUp]);

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

  return { status, setStatus, speaking, listening, heard, caption, startedAt, accept, hangUp, speak, endAfterSpeaking, greeted, patience };
}
