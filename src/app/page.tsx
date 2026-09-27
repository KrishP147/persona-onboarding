"use client";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Attachment, ClientAction, Msg, Session, TurnResult } from "@/lib/types";
import { useVoiceCall } from "./useVoiceCall";

const LS_KEY = "persona-onboarding-session";
// Event-handler clock (kept out of the component body so the purity lint rule stays quiet).
const now = () => Date.now();
const AGENT_NUMBER = "+1 (650) 555-0142";

function readStoredId(): string | null {
  try {
    return new URL(window.location.href).searchParams.get("s") ?? localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}
function storeId(id: string) {
  try {
    localStorage.setItem(LS_KEY, id);
  } catch {}
}

async function post<T>(url: string, body: unknown, keepalive = false): Promise<T> {
  // keepalive lets a hangup reach the server as the tab closes, but caps bodies at 64KB, so events only.
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive });
  if (res.status === 409) {
    // The previous turn on this conversation is still finishing: wait a beat and try once more.
    await new Promise((r) => setTimeout(r, 1200));
    const again = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive });
    if (!again.ok) throw new Error(`${again.status}`);
    return again.json();
  }
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function fileToAttachment(f: File): Promise<Attachment> {
  const kind = f.type.startsWith("image/") ? "image" : f.type.startsWith("audio/") ? "audio" : f.type.startsWith("video/") ? "video" : "file";
  if (kind !== "image") return { kind, name: f.name, mime: f.type, summary: "(media parsing not wired yet)" };
  // Downscale images so uploads stay small.
  const bmp = await createImageBitmap(f);
  const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return { kind, name: f.name, mime: "image/jpeg", dataUrl: c.toDataURL("image/jpeg", 0.85) };
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [typing, setTyping] = useState(false);
  const [mock, setMock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const retryRef = useRef<(() => void) | null>(null);
  const chanRef = useRef<BroadcastChannel | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const idRef = useRef<string | null>(null);

  const upsert = useCallback((incoming: Msg[]) => {
    setMessages((prev) => {
      const next = [...prev];
      for (const m of incoming) {
        const i = next.findIndex((x) => x.id === m.id);
        if (i >= 0) {
          // Keep device-only bits (a voice note's playback link) when the server's copy replaces ours.
          const local = next[i].attachments;
          next[i] = local?.some((a) => a.localUrl) && m.attachments ? { ...m, attachments: m.attachments.map((a, j) => ({ ...a, localUrl: local[j]?.localUrl, seconds: local[j]?.seconds })) } : m;
        } else next.push(m);
      }
      return next;
    });
  }, []);

  const actionsRef = useRef<(a: ClientAction[]) => Promise<unknown>>(async () => {});
  const busyRef = useRef(0); // requests in flight (sends, voice turns)
  const voiceTurnRef = useRef(0);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRing = () => {
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    ringTimerRef.current = null;
  };
  const [callHidden, setCallHidden] = useState(false); // small screens: peek at the texts mid-call
  // Replies arrive like texts from a person: one bubble at a time, with a typing pause between.
  const revealRef = useRef<Promise<void>>(Promise.resolve());
  const [revealing, setRevealing] = useState(false);
  const [showWhy, setShowWhy] = useState(true);
  // Voice notes: record in the browser, transcribe on our server (deepgram), send the words.
  const [recording, setRecording] = useState<{ startedAt: number } | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<{ rec: MediaRecorder; chunks: Blob[]; stream: MediaStream } | null>(null);
  // Read receipts for your own texts: sent (one check), delivered (two), seen (two, filled).
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({});
  const setReceipt = (id: string, r: Receipt) => setReceipts((prev) => ({ ...prev, [id]: r }));
  const apply = useCallback(
    (r: TurnResult, sentAt?: number) => {
      if (idRef.current && r.session.id !== idRef.current) return; // stale reply from another session
      setSession(r.session);
      chanRef.current?.postMessage("sync");
      revealRef.current = revealRef.current.then(async () => {
        // On a call: say it first, then do it in the chat ("i'm texting you the link" -> the link shows up).
        const speaks = r.actions.some((a) => a.type === "speak");
        const later = speaks ? r.newMessages.filter((m) => m.role === "agent" && m.channel === "text") : [];
        if (later.length) {
          upsert(r.newMessages.filter((m) => !later.includes(m)));
          const spoken = actionsRef.current(r.actions);
          await Promise.race([spoken, new Promise((res) => setTimeout(res, 20000))]);
          for (const m of later) {
            await new Promise((res) => setTimeout(res, 500));
            upsert([m]);
          }
          return;
        }
        let shown = 0;
        for (const m of r.newMessages) {
          const paced = m.role === "agent" && m.channel === "text" && m.kind !== "contact_card";
          // A person reads, then types: longer replies take longer. The server's own time counts toward it.
          const typeMs = Math.min(1600, 250 + m.text.length * 10);
          const wait = shown === 0 && sentAt ? typeMs - (Date.now() - sentAt) : shown > 0 ? typeMs : 0;
          if (paced && wait > 0) {
            setRevealing(true);
            await new Promise((res) => setTimeout(res, wait));
          }
          upsert([m]);
          if (paced) shown++;
        }
        setRevealing(false);
        actionsRef.current(r.actions);
      }).catch(() => setRevealing(false));
    },
    [upsert],
  );

  // Pull the latest server state (other tab, popup, or coming back online).
  const resync = useCallback(async () => {
    if (!idRef.current) return;
    try {
      const res = await fetch(`/api/session?id=${encodeURIComponent(idRef.current)}`, { cache: "no-store" });
      const data = (await res.json()) as { session: Session; chips: string[] };
      if (busyRef.current > 0) return; // a reply is on its way; it carries the fresh state
      setSession(data.session);
      setMessages((prev) => {
        // Server order, plus anything local the server hasn't saved yet (a message still sending).
        const ids = new Set(data.session.transcript.map((m) => m.id));
        return [...data.session.transcript, ...prev.filter((m) => !ids.has(m.id) && m.role === "user")];
      });
    } catch {}
  }, []);

  const sendEvent = useCallback(
    async (event: Record<string, unknown>): Promise<boolean> => {
      if (!idRef.current) return false;
      try {
        apply(await post<TurnResult>("/api/session", { sessionId: idRef.current, event }, true));
        setError(null);
        return true;
      } catch {
        setError("connection hiccup, retrying won't lose anything");
        return false;
      }
    },
    [apply],
  );

  const call = useVoiceCall({
    voice: session?.voice ?? "neutral",
    sessionId: session?.id ?? null,
    onUtterance: async (text, interrupted) => {
      if (!idRef.current) return;
      const turn = ++voiceTurnRef.current;
      // Speaking again before the reply lands means they moved on; say so to the server.
      const body = { sessionId: idRef.current, channel: "voice", text, interrupted: interrupted || turn > 1 && busyRef.current > 0 };
      busyRef.current++;
      try {
        const r = await post<TurnResult>("/api/chat", body).catch(async () => {
          // One quiet retry (a busy session or a slow model), then own it out loud, on the call.
          await new Promise((res) => setTimeout(res, 600));
          return post<TurnResult>("/api/chat", body);
        });
        // A reply to something they've already talked past: keep the text, don't say it out loud.
        apply(turn === voiceTurnRef.current ? r : { ...r, actions: r.actions.filter((a) => a.type !== "speak") });
      } catch {
        call.speak("sorry, i missed that. say it one more time?");
      } finally {
        busyRef.current--;
      }
    },
    onSilence: () => sendEvent({ type: "silence" }),
    onEnded: (reason) => sendEvent({ type: "call_ended", reason }),
    onMicDenied: () => sendEvent({ type: "mic_denied" }),
  });

  useEffect(() => {
    actionsRef.current = (actions) => {
      // Speech first, so a goodbye is queued before the hangup that waits for it.
      const ordered = [...actions].sort((a, b) => Number(b.type === "speak") - Number(a.type === "speak"));
      let spoken: Promise<unknown> = Promise.resolve();
      for (const a of ordered) {
        // A real call takes a moment to come through after "calling you now."
        if (a.type === "start_call") {
          clearRing();
          ringTimerRef.current = setTimeout(() => {
            call.setStatus((st) => (st === "idle" ? "ringing" : st));
            // Nobody picks up: stop ringing after a while, like a real phone.
            ringTimerRef.current = setTimeout(() => {
              call.setStatus((st) => {
                if (st === "ringing") void sendEvent({ type: "call_declined" });
                return st === "ringing" ? "idle" : st;
              });
            }, 30000);
          }, 3000);
        }
        if (a.type === "speak") spoken = call.speak(a.text);
        if (a.type === "end_call") call.endAfterSpeaking(!!a.final);
        if (a.type === "patience") call.patience(a.ms);
      }
      return spoken;
    };
  });

  // Other tabs, visibility, connectivity: keep every view in step with the server.
  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
      const retry = retryRef.current;
      retryRef.current = null;
      if (retry) retry();
      else void resync();
    };
    const onOffline = () => setOffline(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") void resync();
    };
    if (!navigator.onLine) queueMicrotask(onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [resync]);

  // Gmail popup reports back here; the server already holds the verified result.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "persona-gmail") return;
      if (e.data.ok) void sendEvent({ type: "gmail_connected" });
      else void sendEvent({ type: "gmail_failed", error: String(e.data.error ?? "unknown") });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [sendEvent]);

  // Boot: resume the stored session (refresh-safe) or create one.
  const bootedRef = useRef(false);
  useEffect(() => {
    // Once per page load (dev strict mode runs effects twice, which made two sessions).
    if (bootedRef.current) return;
    bootedRef.current = true;
    (async () => {
      const stored = readStoredId();
      const res = await fetch(`/api/session${stored ? `?id=${encodeURIComponent(stored)}` : ""}`);
      const data = (await res.json()) as { session: Session; chips: string[]; mock: boolean };
      idRef.current = data.session.id;
      storeId(data.session.id);
      try {
        chanRef.current?.close();
        chanRef.current = new BroadcastChannel(`persona-${data.session.id}`);
        chanRef.current.onmessage = () => void resync();
      } catch {}
      setSession(data.session);
      setMessages(data.session.transcript);
      setMock(data.mock);
      // A call can't survive a reload: tell the server it dropped.
      if (data.session.call.active) {
        await sendEvent({ type: "call_ended", reason: "error" });
        // The old page's hangup may still be finishing: show its "call ended" and recap when they land.
        await resync();
        setTimeout(() => void resync(), 4000);
      }
      else if (data.session.transcript.length === 0) {
        setTyping(true);
        await sendEvent({ type: "open" });
        setTyping(false);
      }
    })().catch(() => setError("couldn't reach the server"));
  }, [sendEvent, resync]);

  useEffect(() => {
    // Braces matter: newer Chrome returns a Promise from scrollIntoView, which React rejects as a cleanup.
    // First paint of a resumed thread jumps; new messages glide.
    void bottomRef.current?.scrollIntoView({ behavior: seenRef.current ? "smooth" : "instant" });
    if (messages.length) seenRef.current = true;
  }, [messages, typing]);

  const send = async (text: string, extra?: { attachments: Attachment[] }) => {
    if (!idRef.current || (!text.trim() && pending.length === 0 && !extra)) return;
    const atts = extra?.attachments ?? pending;
    if (!extra) {
      setDraft("");
      setPending([]);
    }
    // Your own message lands right away, like any messaging app.
    const clientId = nanoid(10);
    upsert([{ id: clientId, role: "user", channel: "text", text, ts: now(), ...(atts.length ? { attachments: atts } : {}) }]);
    setReceipt(clientId, "sent");
    // The request is on the server within a beat; if it fails, the message comes back out.
    const deliveredTimer = setTimeout(() => setReceipt(clientId, "delivered"), 350);
    // They "read" it first; the typing dots only show after a beat.
    const typingTimer = setTimeout(() => setTyping(true), 500);
    const sentAt = now();
    // A new text wins over a call that hasn't come through yet ("actually, not now").
    if (call.status === "idle") clearRing();
    busyRef.current++;
    try {
      const reply = await post<TurnResult>("/api/chat", { sessionId: idRef.current, channel: "text", text, attachments: atts, clientId });
      clearTimeout(deliveredTimer);
      setReceipt(clientId, "seen"); // the agent has read it; its reply follows at a human pace
      apply(reply, sentAt);
      setError(null);
    } catch {
      clearTimeout(deliveredTimer);
      setMessages((prev) => prev.filter((m) => m.id !== clientId));
      setDraft(text);
      setPending(atts);
      if (!navigator.onLine) {
        setError("you're offline. i'll send it when you're back.");
        retryRef.current = () => void send(text);
      } else setError("that didn't send, hit send to try again");
    } finally {
      clearTimeout(typingTimer);
      busyRef.current--;
      if (busyRef.current === 0) setTyping(false);
    }
  };

  const startNote = async () => {
    if (recording || transcribing || !idRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start(250);
      recorderRef.current = { rec, chunks, stream };
      setRecording({ startedAt: now() });
    } catch {
      setError("i can't reach your mic. check the browser's microphone permission and try again.");
    }
  };

  const stopNote = async (cancel = false) => {
    const r = recorderRef.current;
    if (!r || !recording) return;
    const secs = Math.max(1, Math.round((now() - recording.startedAt) / 1000));
    recorderRef.current = null;
    setRecording(null);
    const done = new Promise<void>((res) => (r.rec.onstop = () => res()));
    r.rec.stop();
    await done;
    r.stream.getTracks().forEach((t) => t.stop());
    if (cancel || !idRef.current) return;
    const blob = new Blob(r.chunks, { type: r.rec.mimeType || "audio/webm" });
    setTranscribing(true);
    try {
      const res = await fetch(`/api/voice/transcribe?s=${encodeURIComponent(idRef.current)}`, { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
      const data = (await res.json()) as { transcript?: string };
      const words = data.transcript?.trim();
      if (!res.ok || !words) {
        setError(res.ok ? "couldn't make out any words in that one. try again?" : "that voice note didn't go through, try again?");
        return;
      }
      const url = URL.createObjectURL(blob);
      await send(words, { attachments: [{ kind: "audio", name: "voice note", mime: blob.type, summary: `voice note, ${secs}s`, dataUrl: undefined, localUrl: url, seconds: secs }] });
    } catch {
      setError("that voice note didn't go through, try again?");
    } finally {
      setTranscribing(false);
    }
  };

  // The user placing the call is consent enough: connect straight away, no ringing.
  const startUserCall = async () => {
    if (call.status !== "idle") return;
    clearRing();
    await connectCall(true);
  };

  // Mic is live: tell the server, or hang up if it can't hear us.
  const connectCall = async (byUser = false) => {
    setCallHidden(false);
    if (!(await call.accept())) return;
    if (await sendEvent({ type: "call_started", byUser })) call.greeted();
    else call.hangUp("error");
  };

  const connectGmail = () => {
    if (!idRef.current) return;
    const w = window.open(`/api/auth/google/start?s=${idRef.current}`, "persona-gmail", "width=480,height=680");
    if (!w) setError("your browser blocked the google window. allow popups for this page and tap the link again.");
  };

  // Until the card is saved, the thread and incoming calls show a bare number, like a real phone.
  const saved = !!session?.contactSaved && !!session?.slots.agentName.value;
  const agentName = saved ? session!.slots.agentName.value! : AGENT_NUMBER;

  const saveContact = () => {
    if (!session || session.contactSaved) return;
    setSession({ ...session, contactSaved: true }); // instant, the server catches up
    void sendEvent({ type: "contact_saved" });
  };

  // Start over with a fresh session (keeps the old one server side, just forgets it here).
  const restart = () => {
    if (call.status === "active" || call.status === "connecting") call.hangUp("user_hangup");
    try {
      localStorage.removeItem(LS_KEY);
    } catch {}
    window.location.replace(window.location.pathname);
  };
  const onCall = call.status === "active" || call.status === "connecting";
  const thread = messages.filter((m) => m.channel !== "voice");

  return (
    <main className="min-h-dvh bg-neutral-950 flex items-center justify-center gap-8 p-0 sm:p-6">
      <div className="fixed top-3 right-3 z-30 hidden sm:flex gap-2">
        <button
          onClick={() => setShowWhy((v) => !v)}
          className="hidden xl:block text-xs text-neutral-300 bg-neutral-800/90 hover:bg-neutral-700 border border-white/10 rounded-full px-3 py-1.5"
        >
          {showWhy ? "Hide reasoning" : "Show reasoning"}
        </button>
        <button
          onClick={restart}
          className="text-xs text-neutral-300 bg-neutral-800/90 hover:bg-neutral-700 border border-white/10 rounded-full px-3 py-1.5"
        >
          Restart
        </button>
      </div>
      {showWhy && <WhyPanel messages={messages} />}
      <div className="relative w-full sm:w-[390px] h-dvh sm:h-[800px] sm:rounded-[44px] sm:border-[10px] border-neutral-800 bg-[#16171b] text-neutral-100 overflow-hidden flex flex-col shadow-2xl">
        {/* status bar (desktop frame only) */}
        <div className="hidden sm:flex justify-between px-7 pt-2 text-[11px] text-neutral-300 bg-[#1e1f24]">
          <Clock />
          <StatusIcons />
        </div>
        {/* header */}
        <header className="flex items-center gap-3 px-3 pt-3 pb-3 bg-[#1e1f24]">
          <span className="text-neutral-300 text-xl px-1" aria-hidden>
            ←
          </span>
          {saved ? (
            <PersonaLogo size={40} />
          ) : (
            <UnknownAvatar size={40} />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{agentName}</div>
            <div className="text-xs text-neutral-400">
              {onCall ? "on a call" : typing ? "typing…" : session?.phase === "graduated" ? "all set" : "Persona · RCS"}
              {mock ? " · mock mode" : ""}
            </div>
          </div>
          <button
            aria-label="Call"
            disabled={onCall}
            onClick={() => void startUserCall()}
            className="w-10 h-10 rounded-full hover:bg-white/10 disabled:opacity-40 flex items-center justify-center"
          >
            <PhoneIcon />
          </button>
          {/* On a phone-sized screen the page is the phone, so restart lives in the menu. */}
          <button
            aria-label="Restart"
            onClick={() => {
              if (window.confirm("Start over with a fresh conversation?")) restart();
            }}
            className="sm:hidden w-8 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-neutral-300"
          >
            <svg width="4" height="16" viewBox="0 0 4 16" fill="currentColor" aria-hidden>
              <circle cx="2" cy="2" r="1.8" />
              <circle cx="2" cy="8" r="1.8" />
              <circle cx="2" cy="14" r="1.8" />
            </svg>
          </button>
        </header>

        {/* small screens: the call is hidden behind the texts, tap to go back */}
        {callHidden && onCall && (
          <button onClick={() => setCallHidden(false)} className="lg:hidden bg-emerald-600 text-white text-sm py-2 px-4 flex items-center justify-center gap-2">
            <PhoneIcon size={14} /> On a call · tap to return
          </button>
        )}

        {/* thread */}
        <div className="flex-1 overflow-y-auto px-3 pb-4 bg-[#131316]" role="log" aria-live="polite" aria-label="Messages">
          {thread.map((m, i) => {
            const prev = thread[i - 1];
            const next = thread[i + 1];
            const side = (x?: Msg) => (!x || x.kind === "event" ? null : x.role);
            const showTime = !prev || m.ts - prev.ts > 10 * 60 * 1000;
            const lastUserId = [...thread].reverse().find((x) => x.role === "user")?.id;
            return (
              <div key={m.id}>
                {showTime && <div className="text-center text-[11px] text-neutral-500 pt-3 pb-2">{stamp(m.ts)}</div>}
                <Bubble
                  m={m}
                  first={showTime || side(prev) !== m.role}
                  last={side(next) !== m.role}
                  reaction={(typing || revealing) && m.id === lastUserId && m.text.length > 90 ? "👀" : undefined}
                  receipt={m.role === "user" && m.id === lastUserId ? (receipts[m.id] ?? "seen") : undefined}
                  onConnect={connectGmail}
                  connected={session?.slots.gmail.status === "filled"}
                  contactSaved={!!session?.contactSaved}
                  onSaveContact={saveContact}
                />
              </div>
            );
          })}
          {(typing || revealing) && (
            <div className="flex justify-start pt-2">
              <div className="bg-[#26272c] rounded-3xl px-4 py-3 flex gap-1" role="status" aria-label="typing">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {offline && <div className="mx-3 mb-1 text-xs text-neutral-300 bg-white/10 rounded-lg px-3 py-1.5">you&apos;re offline. nothing&apos;s lost, it&apos;ll pick up when you&apos;re back.</div>}
        {error && (
          <div className="mx-3 mb-1 text-xs text-amber-300 bg-amber-900/30 rounded-lg px-3 py-1.5">{error}</div>
        )}

        {/* composer */}
        {pending.length > 0 && (
          <div className="px-4 pb-1 text-xs text-neutral-400">{pending.map((p) => p.name).join(", ")} attached</div>
        )}
        <form
          className="flex items-center gap-2 px-3 pb-5 pt-2 bg-[#131316]"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <button type="button" aria-label="Attach" onClick={() => fileRef.current?.click()} className="w-9 h-9 rounded-full hover:bg-white/10 text-xl">
            +
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []).slice(0, 4);
              setPending(await Promise.all(files.map(fileToAttachment)));
              e.target.value = "";
            }}
          />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="RCS message"
            aria-label="Message"
            className="flex-1 min-w-0 bg-[#26272c] rounded-full px-4 py-2.5 outline-none placeholder:text-neutral-500"
          />
          <button
            type="button"
            aria-label={recording ? "Stop and send voice note" : "Record a voice note"}
            onClick={() => void (recording ? stopNote() : startNote())}
            disabled={transcribing}
            className={`h-10 shrink-0 rounded-full flex items-center justify-center gap-1.5 disabled:opacity-50 ${recording ? "bg-red-500 px-3 text-sm" : "w-10 bg-[#26272c] hover:bg-[#33343a]"}`}
          >
            {recording ? (
              <>
                <span className="w-2.5 h-2.5 rounded-sm bg-white" aria-hidden />
                <RecTimer startedAt={recording.startedAt} />
              </>
            ) : transcribing ? (
              <span className="w-4 h-4 rounded-full border-2 border-white/60 border-t-transparent animate-spin" aria-hidden />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
              </svg>
            )}
          </button>
          <button
            type="submit"
            aria-label="Send"
            disabled={!draft.trim() && pending.length === 0}
            className="w-10 h-10 shrink-0 rounded-full bg-[#5b4a8a] hover:bg-[#6c5a9e] disabled:opacity-40 flex items-center justify-center"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M3 20.5 21 12 3 3.5l.01 6.6L15 12 3.01 13.9z" />
            </svg>
          </button>
        </form>

      </div>
      {/* call: its own phone beside the chat on wide screens, full screen on small ones */}
      {call.status !== "idle" && (
        <div
          className={`fixed inset-0 z-20 lg:static lg:z-auto w-full lg:w-[390px] h-dvh lg:h-[800px] lg:rounded-[44px] lg:border-[10px] border-neutral-800 overflow-hidden shadow-2xl ${callHidden ? "hidden lg:block" : ""}`}
        >
        <CallScreen
          said={call.caption}
          onHide={() => setCallHidden(true)}
          saved={saved}
          name={agentName}
          status={call.status}
          speaking={call.speaking}
          heard={call.heard}
          listening={call.listening}
          startedAt={call.startedAt}
          onAccept={() => {
            clearRing();
            void connectCall();
          }}
          onDecline={() => {
            clearRing();
            call.setStatus("idle");
            void sendEvent({ type: "call_declined" });
          }}
          onHangup={() => call.hangUp("user_hangup")}
          muted={call.muted}
          onMute={call.toggleMute}
        />
        </div>
      )}
    </main>
  );
}

// Off the phone: which research-backed move produced each agent message, and where it comes from.
function WhyPanel({ messages }: { messages: Msg[] }) {
  const rows = messages.filter((m) => m.role === "agent" && m.move).slice(-12);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [rows.length]);
  return (
    <aside className="hidden xl:flex flex-col w-[320px] h-[800px] text-neutral-200">
      <div className="text-sm font-medium mb-1">why it said that</div>
      <div className="text-[11px] text-neutral-500 mb-3">each turn, code picks one move from the research; the model writes the words.</div>
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {rows.length === 0 && <div className="text-xs text-neutral-500">moves show up here as the agent talks.</div>}
        {rows.map((m) => (
          <div key={m.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="text-[11px] text-neutral-400 line-clamp-2">
              {m.channel === "voice" ? "📞 " : ""}&ldquo;{m.text}&rdquo;
            </div>
            <div className="text-sm mt-1.5 text-[#c4d3f5]">{m.move!.label}</div>
            <div className="text-[11px] text-neutral-500 mt-0.5 italic">{m.move!.source}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </aside>
  );
}

function RecTimer({ startedAt }: { startedAt: number }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(id);
  }, [startedAt]);
  return <span className="tabular-nums">{`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`}</span>;
}

// A voice note: play it back (this device only; the audio isn't stored), with the transcript below.
function VoiceNote({ url, seconds }: { url?: string; seconds?: number }) {
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
      <button onClick={toggle} disabled={!url} aria-label={playing ? "Pause voice note" : "Play voice note"} className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-40 flex items-center justify-center">
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
          <span key={i} className="w-[3px] rounded-full bg-white/50" style={{ height: h }} />
        ))}
      </span>
      <span className="text-[11px] text-white/70 tabular-nums">{seconds ? `0:${String(seconds).padStart(2, "0")}` : "voice note"}</span>
    </div>
  );
}

function StatusIcons() {
  return (
    <span className="flex items-center gap-1.5" aria-hidden>
      <svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor">
        <rect x="0" y="7" width="2.5" height="3" rx=".5" />
        <rect x="3.8" y="5" width="2.5" height="5" rx=".5" />
        <rect x="7.6" y="2.5" width="2.5" height="7.5" rx=".5" />
        <rect x="11.4" y="0" width="2.5" height="10" rx=".5" />
      </svg>
      <svg width="13" height="10" viewBox="0 0 24 18" fill="currentColor">
        <path d="M12 18l3.5-4.2a5.5 5.5 0 0 0-7 0zM4.2 9.9l2.3 2.7a8.5 8.5 0 0 1 11 0l2.3-2.7a12 12 0 0 0-15.6 0zM0 4.8l2.3 2.7a15 15 0 0 1 19.4 0L24 4.8a18.6 18.6 0 0 0-24 0z" />
      </svg>
      <svg width="20" height="10" viewBox="0 0 20 10" fill="none">
        <rect x=".5" y=".5" width="17" height="9" rx="2" stroke="currentColor" opacity=".6" />
        <rect x="2" y="2" width="12" height="6" rx="1" fill="currentColor" />
        <rect x="18.3" y="3.2" width="1.4" height="3.6" rx=".5" fill="currentColor" opacity=".6" />
      </svg>
    </span>
  );
}

function Clock() {
  const [t, setT] = useState("");
  useEffect(() => {
    const tick = () => setT(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);
  return <span>{t}</span>;
}

function stamp(ts: number) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? `Today • ${time}` : `${d.toLocaleDateString([], { weekday: "short" })} • ${time}`;
}

function CallLogRow({ text }: { text: string }) {
  const ended = text.match(/^Call ended \((\d+)s\)/);
  const secs = ended ? Number(ended[1]) : 0;
  const label = ended ? `Voice call · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : text === "Call declined" ? "Declined call" : "Voice call";
  return (
    <div className="flex justify-center py-2">
      <div className="flex items-center gap-2 text-xs text-neutral-400 bg-white/5 rounded-full px-3 py-1.5">
        <span className={text === "Call declined" ? "text-red-400" : "text-emerald-400"}>
          <PhoneIcon size={14} down={text === "Call declined"} />
        </span>
        {label}
      </div>
    </div>
  );
}

function Bubble({
  m,
  first,
  last,
  reaction,
  receipt,
  onConnect,
  connected,
  contactSaved,
  onSaveContact,
}: {
  m: Msg;
  first: boolean;
  last: boolean;
  reaction?: string;
  receipt?: Receipt;
  onConnect: () => void;
  connected: boolean;
  contactSaved: boolean;
  onSaveContact: () => void;
}) {
  if (m.kind === "event") {
    if (m.text === "Call started") return null; // the "Call ended" row carries the duration
    if (/^Call (ended|declined)/.test(m.text)) return <CallLogRow text={m.text} />;
    return <div className="text-center text-[11px] text-neutral-500 py-2">{m.text}</div>;
  }
  const gap = first ? "pt-2" : "pt-[3px]";
  if (m.kind === "gmail_link")
    return (
      <div className={`${gap} flex justify-start`}>
        <div className="w-[78%] rounded-3xl overflow-hidden bg-[#26272c]">
          <div className="relative h-36 bg-gradient-to-b from-[#c9d3d6] via-[#dfe3df] to-[#b7bfb4] text-[#1f2420] px-4 pt-3">
            <div className="text-[11px] font-semibold tracking-wide opacity-70">Persona</div>
            <div className="font-serif text-xl leading-snug mt-3">One tap to a quieter life</div>
            <div className="absolute bottom-3 left-4 flex items-center gap-1.5 bg-white rounded-full px-3 py-1 text-xs font-medium shadow-sm">
              <GoogleG /> Connect with Google
            </div>
          </div>
          <button onClick={onConnect} disabled={connected} className="w-full text-left bg-[#23200a] px-4 py-3 disabled:cursor-default hover:brightness-125">
            <div className="text-[#f2efa0] text-sm font-medium">{connected ? "Google connected ✓" : "Connect your Google account"}</div>
            <div className="text-[11px] text-neutral-400 mt-0.5">app.yourpersona.com</div>
          </button>
        </div>
      </div>
    );
  if (m.kind === "gif")
    return (
      <div data-role="agent" className={`${gap} flex justify-start`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.text} alt="animated reaction" className="rounded-2xl max-w-[60%] max-h-48 object-cover bg-[#26272c]" loading="lazy" />
      </div>
    );
  if (m.kind === "link_preview")
    return (
      <div className={`${gap} flex justify-start`}>
        <a href={`https://${m.text}`} target="_blank" rel="noreferrer" className="w-[78%] rounded-3xl overflow-hidden bg-[#26272c] border border-white/10 hover:brightness-110">
          <div className="h-20 bg-gradient-to-br from-[#e9ece8] to-[#c9d0c6] flex items-center gap-2 px-4 text-[#1f2420]">
            <PersonaLogo size={28} /> <span className="font-medium">Persona</span>
          </div>
          <div className="px-4 py-2.5">
            <div className="text-sm">Terms, SMS Terms and Privacy Policy</div>
            <div className="text-[11px] text-neutral-400 mt-0.5">{m.text.split("/")[0]}</div>
          </div>
        </a>
      </div>
    );
  if (m.kind === "contact_card")
    return (
      <div className={`${gap} flex justify-start`}>
        <div className="flex items-center gap-3 bg-[#26272c] rounded-3xl pl-2 pr-5 py-2">
          <div className="w-10 h-10 rounded-full bg-[#e8665a] flex items-center justify-center font-semibold text-white">{m.text.charAt(0).toUpperCase()}</div>
          <div>
            <div className="text-sm font-medium">{m.text}</div>
            <div className="text-[11px] text-neutral-400">{AGENT_NUMBER}</div>
          </div>
          <button
            onClick={onSaveContact}
            disabled={contactSaved}
            className="ml-2 text-xs rounded-full px-3 py-1 bg-[#3b4a6b] hover:bg-[#4a5b80] disabled:bg-transparent disabled:text-emerald-400"
          >
            {contactSaved ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>
    );
  const mine = m.role === "user";
  // Google Messages style grouping: inner corners flatten inside a run of bubbles.
  const corners = mine
    ? `rounded-3xl ${first ? "" : "rounded-tr-md"} ${last ? "" : "rounded-br-md"}`
    : `rounded-3xl ${first ? "" : "rounded-tl-md"} ${last ? "" : "rounded-bl-md"}`;
  return (
    <div data-role={m.role} className={`${gap} flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`relative max-w-[78%] px-4 py-2.5 whitespace-pre-wrap text-[15px] leading-snug ${corners} ${mine ? "bg-[#3b4a6b]" : "bg-[#26272c]"}`}>
        {m.channel === "voice" && (
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-neutral-400 mb-0.5">
            <PhoneIcon size={10} /> on call
          </span>
        )}
        {m.attachments?.map((a, i) =>
          a.kind === "audio" ? (
            <VoiceNote key={i} url={a.localUrl} seconds={a.seconds} />
          ) : a.dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={a.dataUrl} alt={a.name} className="rounded-xl mb-1 max-h-48" />
          ) : (
            <div key={i} className="text-xs text-neutral-300 mb-1">📎 {a.name}</div>
          ),
        )}
        {linkify(m.text)}
        {reaction && (
          <span className="absolute -bottom-3 right-2 text-xs bg-[#1e1f24] border border-[#131316] rounded-full w-6 h-6 flex items-center justify-center" aria-label="reaction">
            {reaction}
          </span>
        )}
      </div>
      {receipt && <ReceiptMark state={receipt} />}
    </div>
  );
}

type Receipt = "sent" | "delivered" | "seen";

// Bottom right of your latest text: one check sent, two delivered, two filled in when seen.
function ReceiptMark({ state }: { state: Receipt }) {
  const color = state === "seen" ? "#8ab4f8" : "#8b8d94";
  const one = <path d="M1.5 8.5 5 12l7.5-8" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;
  const two = <path d="M7 12l7.5-8" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;
  return (
    <span className="self-end ml-1 mb-0.5 flex items-center" aria-label={state} title={state}>
      <svg width="17" height="14" viewBox="0 0 17 14">
        {state === "seen" && <circle cx="8.5" cy="7" r="7" fill="#8ab4f8" opacity="0.18" />}
        {one}
        {state !== "sent" && two}
      </svg>
    </span>
  );
}

function linkify(text: string) {
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

// Persona's logo (black mark on white), used as the saved contact's profile photo.
function PersonaLogo({ size }: { size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/persona-logo.png" alt="Persona" width={size} height={size} className="rounded-full bg-white object-cover" style={{ width: size, height: size }} />
  );
}

// Unsaved contact: the generic yellow person avatar Google Messages shows for a bare number.
function UnknownAvatar({ size }: { size: number }) {
  return (
    <div className="rounded-full bg-[#f9c22e] text-neutral-900 flex items-center justify-center" style={{ width: size, height: size }} aria-hidden>
      <svg width={size / 2} height={size / 2} viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6z" />
      </svg>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="12" height="12" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.2-8.5 2.2-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function CallScreen(p: {
  saved: boolean;
  said: string;
  name: string;
  status: string;
  speaking: boolean;
  listening: boolean;
  heard: string;
  startedAt: number | null;
  onAccept: () => void;
  onDecline: () => void;
  onHangup: () => void;
  muted?: boolean;
  onMute?: () => void;
  onHide?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = p.startedAt ? Math.max(0, Math.floor((now - p.startedAt) / 1000)) : 0;
  const timer = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <div
      className="relative h-full w-full bg-gradient-to-b from-[#1d2433] to-[#0d0f14] text-neutral-100 flex flex-col items-center justify-between py-16"
      role={p.status === "ringing" ? "alertdialog" : undefined}
      aria-label={p.status === "ringing" ? `Incoming call from ${p.name}` : "Call"}
    >
      {p.onHide && p.status === "active" && (
        <button onClick={p.onHide} className="lg:hidden absolute top-4 left-4 text-sm text-neutral-300 hover:text-white flex items-center gap-1">
          ← Messages
        </button>
      )}
      <div className="text-center">
        {/* Saved contact: their photo, like any phone. Unsaved: a bare number and a generic avatar. */}
        <div className={`mx-auto w-24 h-24 rounded-full flex items-center justify-center ${p.speaking ? "ring-8 ring-white/20 animate-pulse" : ""}`}>
          {p.saved ? <PersonaLogo size={96} /> : <UnknownAvatar size={96} />}
        </div>
        <div className="mt-4 text-2xl">{p.name}</div>
        <div className="text-neutral-400 mt-1 text-sm" role="status">
          {p.status === "ringing" && "incoming call…"}
          {p.status === "connecting" && "connecting…"}
          {p.status === "active" && `${timer} · ${p.muted ? "muted" : p.speaking ? "speaking" : p.listening ? "listening" : "…"}`}
          {p.status === "ended" && "call ended"}
        </div>
        {p.status === "active" && (
          <div className="mt-8 px-8 space-y-3 text-sm">
            {p.said && (
              <div data-caption="agent" className="text-neutral-200">
                {p.said}
              </div>
            )}
            {p.heard && <div className="text-neutral-400 italic">you: {p.heard}</div>}
          </div>
        )}
      </div>
      {p.status === "ringing" ? (
        <div className="flex gap-16">
          <button onClick={p.onDecline} className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center" aria-label="Decline">
            <PhoneIcon down />
          </button>
          <button onClick={p.onAccept} className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center" aria-label="Accept">
            <PhoneIcon />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-10">
          {p.onMute && p.status === "active" && (
            <button
              onClick={p.onMute}
              aria-pressed={!!p.muted}
              aria-label={p.muted ? "Unmute" : "Mute"}
              className={`w-16 h-16 rounded-full flex flex-col items-center justify-center text-[10px] gap-0.5 ${p.muted ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25"}`}
            >
              <MicIcon off={p.muted} />
              {p.muted ? "unmute" : "mute"}
            </button>
          )}
          <button onClick={p.onHangup} disabled={p.status === "ended"} className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center" aria-label="Hang up">
            <PhoneIcon down />
          </button>
        </div>
      )}
    </div>
  );
}

function PhoneIcon({ down, size = 22 }: { down?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={down ? { transform: "rotate(135deg)" } : undefined}>
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" />
    </svg>
  );
}

function MicIcon({ off, size = 20 }: { off?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}
