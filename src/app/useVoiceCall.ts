"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceStyle } from "@/lib/types";

// Interim voice layer on browser Web Speech APIs (free, Chrome/Edge).
// The Pipecat pipeline (Deepgram STT + Cartesia TTS, barge-in) replaces this later;
// the event contract with the server stays the same.

type Rec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

const SILENCE_MS = 9000;

const VOICE_HINTS: Record<VoiceStyle, RegExp> = {
  feminine: /female|samantha|zira|aria|jenny|susan|victoria|karen|moira|tessa|libby|sonia/i,
  masculine: /\bmale|david|guy|daniel|mark|alex|fred|ryan|thomas|george/i,
  neutral: /google us english|natural/i,
};

function pickVoice(style: VoiceStyle): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  return voices.find((v) => VOICE_HINTS[style].test(v.name)) ?? voices[0];
}

export type CallStatus = "idle" | "ringing" | "connecting" | "active" | "ended";

export function useVoiceCall(opts: {
  onUtterance: (text: string) => Promise<void>;
  onSilence: () => void;
  onEnded: (reason: "user_hangup" | "agent_ended" | "error") => void;
  onMicDenied: () => void;
  voice: VoiceStyle;
}) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const recRef = useRef<Rec | null>(null);
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const busyRef = useRef(false); // speaking or waiting on the server
  const pendingEndRef = useRef(false);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const clearSilence = () => {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    silenceRef.current = null;
  };
  const armSilence = useCallback(() => {
    clearSilence();
    silenceRef.current = setTimeout(() => {
      if (activeRef.current && !busyRef.current) optsRef.current.onSilence();
    }, SILENCE_MS);
  }, []);

  const listen = useCallback(() => {
    if (!activeRef.current || busyRef.current) return;
    try {
      recRef.current?.start();
      setListening(true);
    } catch {
      /* already started */
    }
    armSilence();
  }, [armSilence]);

  const teardown = useCallback(() => {
    activeRef.current = false;
    clearSilence();
    try {
      recRef.current?.abort();
    } catch {}
    recRef.current = null;
    window.speechSynthesis?.cancel();
    setListening(false);
    setSpeaking(false);
  }, []);

  const hangUp = useCallback(
    (reason: "user_hangup" | "agent_ended" | "error" = "user_hangup") => {
      if (!activeRef.current && status !== "active") return;
      teardown();
      setStatus("ended");
      optsRef.current.onEnded(reason);
      setTimeout(() => setStatus("idle"), 1200);
    },
    [status, teardown],
  );

  const speak = useCallback(
    (text: string) => {
      if (!activeRef.current) return;
      busyRef.current = true;
      clearSilence();
      try {
        recRef.current?.stop();
      } catch {}
      setListening(false);
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(optsRef.current.voice);
      if (v) u.voice = v;
      u.rate = 1.05;
      u.onstart = () => setSpeaking(true);
      const done = () => {
        setSpeaking(false);
        busyRef.current = false;
        if (pendingEndRef.current) {
          pendingEndRef.current = false;
          hangUp("agent_ended");
        } else listen();
      };
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
    },
    [hangUp, listen],
  );

  const endAfterSpeaking = useCallback(() => {
    if (busyRef.current || window.speechSynthesis.speaking) pendingEndRef.current = true;
    else hangUp("agent_ended");
  }, [hangUp]);

  const accept = useCallback(async () => {
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    setStatus("connecting");
    try {
      if (!Ctor || !window.speechSynthesis) throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      setStatus("idle");
      optsRef.current.onMicDenied();
      return false;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript;
      text = text.trim();
      if (!text || busyRef.current) return;
      clearSilence();
      busyRef.current = true;
      try {
        rec.stop();
      } catch {}
      setListening(false);
      optsRef.current.onUtterance(text).finally(() => {
        // If the reply produced no speech, resume listening.
        if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
          busyRef.current = false;
          listen();
        }
      });
    };
    rec.onend = () => {
      setListening(false);
      if (activeRef.current && !busyRef.current) listen(); // Chrome stops on its own; keep the line open
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") {
        teardown();
        setStatus("idle");
        optsRef.current.onMicDenied();
      }
    };
    recRef.current = rec;
    activeRef.current = true;
    busyRef.current = true; // agent greets first
    setStartedAt(Date.now());
    setStatus("active");
    return true;
  }, [listen, teardown]);

  // Tab closed or navigated mid-call: server still learns about the hangup.
  useEffect(() => {
    const onHide = () => {
      if (activeRef.current) optsRef.current.onEnded("user_hangup");
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  return { status, setStatus, speaking, listening, startedAt, accept, hangUp, speak, endAfterSpeaking };
}
