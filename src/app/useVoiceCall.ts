"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceStyle } from "@/lib/types";

// Interim voice layer on browser Web Speech APIs (free, Chrome/Edge).
// A streaming STT/TTS pipeline can replace this later; the server contract stays the same.
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
const TURN_END_COMPLETE_MS = 700;
const TURN_END_MIDPHRASE_MS = 1500;
const TURN_END_SPELLING_MS = 2000;
const TRAILING = /\b(and|but|or|so|because|the|a|an|my|is|are|to|of|with|for|um+|uh+|like|then|if|at|dot)$/i;
const SPELLING = /(\d\s*){3,}$|@|\bdot\b|\bat\b\s*$|\bemail is\b|\bnumber is\b|\baddress is\b/i;

// How long to wait before deciding the user is done talking.
function turnEndDelay(text: string) {
  const t = text.trim();
  if (SPELLING.test(t)) return TURN_END_SPELLING_MS;
  if (TRAILING.test(t) || /,$/.test(t)) return TURN_END_MIDPHRASE_MS;
  return TURN_END_COMPLETE_MS;
}
const FILLER_AFTER_MS = 1800;
const FILLERS = ["mm, one sec.", "okay, give me a second.", "got it, one sec.", "mhm, let me think."];
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

export function useVoiceCall(opts: {
  onUtterance: (text: string, interrupted: boolean) => Promise<void>;
  onSilence: () => void;
  onEnded: (reason: "user_hangup" | "agent_ended" | "error") => void;
  onMicDenied: () => void;
  voice: VoiceStyle;
}) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
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
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fillerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fillerIdx = useRef(0);
  const patienceRef = useRef<number | null>(null); // one-shot longer silence window
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const clear = (t: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
    if (t.current) clearTimeout(t.current);
    t.current = null;
  };

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
    window.speechSynthesis?.cancel();
    queueRef.current = 0;
    bufferRef.current = "";
    setListening(false);
    setSpeaking(false);
    setHeard("");
  }, []);

  const hangUp = useCallback(
    (reason: "user_hangup" | "agent_ended" | "error" = "user_hangup") => {
      if (!activeRef.current) return;
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
      const u = new SpeechSynthesisUtterance(text);
      if (voiceRef.current) u.voice = voiceRef.current;
      u.rate = 1.03;
      u.onstart = () => {
        speakingTextRef.current = text;
        setSpeaking(true);
      };
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
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
    },
    [armSilence, hangUp],
  );

  const endAfterSpeaking = useCallback(() => {
    if (queueRef.current > 0 || window.speechSynthesis.speaking) pendingEndRef.current = true;
    else hangUp("agent_ended");
  }, [hangUp]);

  // User finished a turn: send it, with a spoken filler if the reply is slow.
  const flushTurn = useCallback(() => {
    const text = bufferRef.current.trim();
    bufferRef.current = "";
    setHeard("");
    if (!text || !activeRef.current) return;
    const interrupted = interruptedRef.current;
    interruptedRef.current = false;
    waitingRef.current = true;
    clear(silenceTimer);
    fillerTimer.current = setTimeout(() => {
      if (waitingRef.current && queueRef.current === 0) speak(FILLERS[fillerIdx.current++ % FILLERS.length], true);
    }, FILLER_AFTER_MS);
    optsRef.current.onUtterance(text, interrupted).finally(() => {
      waitingRef.current = false;
      clear(fillerTimer);
      if (queueRef.current === 0) armSilence();
    });
  }, [armSilence, speak]);

  const accept = useCallback(async () => {
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    setStatus("connecting");
    try {
      if (!Ctor || !window.speechSynthesis) throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      setStatus("idle");
      optsRef.current.onMicDenied();
      return false;
    }
    voiceRef.current = await lockVoice(optsRef.current.voice);

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
      const latest = (finals || interim).trim();
      if (!latest) return;
      // While the agent talks, ignore its own voice coming back through the mic.
      if (queueRef.current > 0 && looksLikeEcho(latest, speakingTextRef.current)) return;
      // Real speech over the agent: stop talking and listen (barge-in).
      if (queueRef.current > 0 && words(latest).length >= 2) {
        window.speechSynthesis.cancel();
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
      }, turnEndDelay(`${bufferRef.current} ${interim}`));
    };
    rec.onend = () => {
      // Chrome ends recognition on its own every so often; keep the line open.
      if (activeRef.current) setTimeout(startRec, 150);
      else setListening(false);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        teardown();
        setStatus("idle");
        optsRef.current.onMicDenied();
      }
      // "no-speech", "network", "aborted": onend restarts; silence is handled by our own timer.
    };
    recRef.current = rec;
    activeRef.current = true;
    waitingRef.current = true; // the agent greets first
    setStartedAt(Date.now());
    setStatus("active");
    startRec();
    return true;
  }, [flushTurn, startRec, teardown]);

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

  return { status, setStatus, speaking, listening, heard, startedAt, accept, hangUp, speak, endAfterSpeaking, greeted, patience };
}
