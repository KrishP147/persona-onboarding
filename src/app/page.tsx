"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Attachment, ClientAction, Msg, Session, TurnResult } from "@/lib/types";
import { useVoiceCall } from "./useVoiceCall";

const LS_KEY = "persona-onboarding-session";

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

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
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
  const [chips, setChips] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [typing, setTyping] = useState(false);
  const [mock, setMock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const retryRef = useRef<(() => void) | null>(null);
  const chanRef = useRef<BroadcastChannel | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const idRef = useRef<string | null>(null);

  const upsert = useCallback((incoming: Msg[]) => {
    setMessages((prev) => {
      const next = [...prev];
      for (const m of incoming) {
        const i = next.findIndex((x) => x.id === m.id);
        if (i >= 0) next[i] = m;
        else next.push(m);
      }
      return next;
    });
  }, []);

  const actionsRef = useRef<(a: ClientAction[]) => void>(() => {});
  const apply = useCallback(
    (r: TurnResult) => {
      setSession(r.session);
      setChips(r.chips);
      upsert(r.newMessages);
      actionsRef.current(r.actions);
      chanRef.current?.postMessage("sync");
    },
    [upsert],
  );

  // Pull the latest server state (other tab, popup, or coming back online).
  const resync = useCallback(async () => {
    if (!idRef.current) return;
    try {
      const res = await fetch(`/api/session?id=${encodeURIComponent(idRef.current)}`, { cache: "no-store" });
      const data = (await res.json()) as { session: Session; chips: string[] };
      setSession(data.session);
      setMessages(data.session.transcript);
      setChips(data.chips);
    } catch {}
  }, []);

  const sendEvent = useCallback(
    async (event: Record<string, unknown>) => {
      if (!idRef.current) return;
      try {
        apply(await post<TurnResult>("/api/session", { sessionId: idRef.current, event }));
        setError(null);
      } catch {
        setError("connection hiccup, retrying won't lose anything");
      }
    },
    [apply],
  );

  const call = useVoiceCall({
    voice: session?.voice ?? "neutral",
    onUtterance: async (text, interrupted) => {
      if (!idRef.current) return;
      try {
        apply(await post<TurnResult>("/api/chat", { sessionId: idRef.current, channel: "voice", text, interrupted }));
      } catch {
        setError("lost you for a sec");
      }
    },
    onSilence: () => sendEvent({ type: "silence" }),
    onEnded: (reason) => sendEvent({ type: "call_ended", reason }),
    onMicDenied: () => sendEvent({ type: "mic_denied" }),
  });

  useEffect(() => {
    actionsRef.current = (actions) => {
      for (const a of actions) {
        if (a.type === "start_call") call.setStatus("ringing");
        if (a.type === "speak") call.speak(a.text);
        if (a.type === "end_call") call.endAfterSpeaking();
      }
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
  useEffect(() => {
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
      setChips(data.chips);
      setMock(data.mock);
      // A call can't survive a reload: tell the server it dropped.
      if (data.session.call.active) await sendEvent({ type: "call_ended", reason: "error" });
      else if (data.session.transcript.length === 0) {
        setTyping(true);
        await sendEvent({ type: "open" });
        setTyping(false);
      }
    })().catch(() => setError("couldn't reach the server"));
  }, [sendEvent, resync]);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, typing]);

  const send = async (text: string) => {
    if (!idRef.current || (!text.trim() && pending.length === 0)) return;
    const atts = pending;
    setDraft("");
    setPending([]);
    setTyping(true);
    try {
      apply(await post<TurnResult>("/api/chat", { sessionId: idRef.current, channel: "text", text, attachments: atts }));
      setError(null);
    } catch {
      setDraft(text);
      setPending(atts);
      if (!navigator.onLine) {
        setError("you're offline. i'll send it when you're back.");
        retryRef.current = () => void send(text);
      } else setError("that didn't send, hit send to try again");
    } finally {
      setTyping(false);
    }
  };

  // The user placing the call is consent enough: connect straight away, no ringing.
  const startUserCall = async () => {
    if (call.status !== "idle") return;
    if (await call.accept()) {
      await sendEvent({ type: "call_started" });
      call.greeted();
    }
  };

  const onChip = (c: string) => {
    if (c === "Call me") return void send("sure, call me");
    if (c === "Call me back") return void startUserCall();
    if (c === "Connect Gmail") return void send("connect gmail");
    void send(c);
  };

  const connectGmail = () => {
    if (!idRef.current) return;
    const w = window.open(`/api/auth/google/start?s=${idRef.current}`, "persona-gmail", "width=480,height=680");
    if (!w) setError("your browser blocked the google window. allow popups for this page and tap the link again.");
  };

  const agentName = session?.slots.agentName.value ?? "New assistant";
  const onCall = call.status === "active" || call.status === "connecting";

  return (
    <main className="min-h-dvh bg-neutral-950 flex items-center justify-center p-0 sm:p-6">
      <div className="relative w-full sm:w-[390px] h-dvh sm:h-[800px] sm:rounded-[44px] sm:border-[10px] border-neutral-800 bg-[#16171b] text-neutral-100 overflow-hidden flex flex-col shadow-2xl">
        {/* header */}
        <header className="flex items-center gap-3 px-4 pt-5 pb-3 border-b border-white/5">
          <div className="w-10 h-10 rounded-full bg-amber-400 text-neutral-900 flex items-center justify-center font-semibold">
            {agentName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{agentName}</div>
            <div className="text-xs text-neutral-400">
              {onCall ? "on a call" : session?.phase === "graduated" ? "all set" : "Persona"}
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
        </header>

        {/* thread */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
          {messages.map((m) => (
            <Bubble key={m.id} m={m} onConnect={connectGmail} connected={session?.slots.gmail.status === "filled"} />
          ))}
          {typing && (
            <div className="flex justify-start">
              <div className="bg-[#23252b] rounded-2xl px-4 py-3 flex gap-1" aria-label="typing">
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

        {/* chips */}
        {chips.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-3 pb-2">
            {chips.map((c) => (
              <button key={c} onClick={() => onChip(c)} className="shrink-0 text-sm rounded-full border border-white/20 px-3 py-1.5 hover:bg-white/10">
                {c}
              </button>
            ))}
          </div>
        )}

        {/* composer */}
        {pending.length > 0 && (
          <div className="px-4 pb-1 text-xs text-neutral-400">{pending.map((p) => p.name).join(", ")} attached</div>
        )}
        <form
          className="flex items-center gap-2 px-3 pb-5 pt-1"
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
            accept="image/*,audio/*,video/*"
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
            placeholder="Text message"
            className="flex-1 bg-[#23252b] rounded-full px-4 py-2.5 outline-none placeholder:text-neutral-500"
          />
          <button type="submit" className="rounded-full bg-indigo-500 hover:bg-indigo-400 px-4 py-2.5 text-sm font-medium">
            Send
          </button>
        </form>

        {/* call overlay */}
        {call.status !== "idle" && (
          <CallScreen
            name={agentName}
            status={call.status}
            speaking={call.speaking}
            heard={call.heard}
            listening={call.listening}
            startedAt={call.startedAt}
            onAccept={async () => {
              if (await call.accept()) {
                await sendEvent({ type: "call_started" });
                call.greeted();
              }
            }}
            onDecline={() => {
              call.setStatus("idle");
              void sendEvent({ type: "call_declined" });
            }}
            onHangup={() => call.hangUp("user_hangup")}
          />
        )}
      </div>
    </main>
  );
}

function Bubble({ m, onConnect, connected }: { m: Msg; onConnect: () => void; connected: boolean }) {
  if (m.kind === "event") return <div className="text-center text-xs text-neutral-500 py-1">{m.text}</div>;
  if (m.kind === "gmail_link")
    return (
      <div className="max-w-[80%] rounded-2xl overflow-hidden border border-white/10">
        <div className="bg-gradient-to-br from-neutral-200 to-neutral-400 text-neutral-900 p-4">
          <div className="text-xs font-medium opacity-70">Persona</div>
          <div className="text-lg font-semibold leading-tight mt-1">One tap to a quieter inbox</div>
        </div>
        <button onClick={onConnect} disabled={connected} className="w-full text-left bg-[#26250f] text-yellow-200 px-4 py-3 disabled:opacity-60">
          {connected ? "Google connected ✓" : "Connect your Google account →"}
        </button>
      </div>
    );
  if (m.kind === "contact_card")
    return (
      <div className="flex items-center gap-3 bg-[#23252b] rounded-2xl px-3 py-2 w-fit">
        <div className="w-9 h-9 rounded-full bg-rose-500 flex items-center justify-center font-semibold">{m.text.charAt(0).toUpperCase()}</div>
        <div>
          <div className="text-sm">{m.text}</div>
          <div className="text-xs text-neutral-400">contact card · updates if you rename me</div>
        </div>
      </div>
    );
  const mine = m.role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 whitespace-pre-wrap ${mine ? "bg-[#3b4a6b]" : "bg-[#23252b]"}`}>
        {m.channel === "voice" && <span className="text-[10px] uppercase tracking-wide text-neutral-400 block">on call</span>}
        {m.attachments?.map((a, i) =>
          a.dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={a.dataUrl} alt={a.name} className="rounded-lg mb-1 max-h-48" />
          ) : (
            <div key={i} className="text-xs text-neutral-300 mb-1">📎 {a.name}</div>
          ),
        )}
        {m.text}
      </div>
    </div>
  );
}

function CallScreen(p: {
  name: string;
  status: string;
  speaking: boolean;
  listening: boolean;
  heard: string;
  startedAt: number | null;
  onAccept: () => void;
  onDecline: () => void;
  onHangup: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = p.startedAt ? Math.max(0, Math.floor((now - p.startedAt) / 1000)) : 0;
  const timer = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <div className="absolute inset-0 bg-gradient-to-b from-[#1d2433] to-[#0d0f14] flex flex-col items-center justify-between py-16 z-10">
      <div className="text-center">
        <div className={`mx-auto w-24 h-24 rounded-full bg-amber-400 text-neutral-900 text-4xl font-semibold flex items-center justify-center ${p.speaking ? "ring-8 ring-amber-400/30 animate-pulse" : ""}`}>
          {p.name.charAt(0).toUpperCase()}
        </div>
        <div className="mt-4 text-2xl">{p.name}</div>
        <div className="text-neutral-400 mt-1 text-sm">
          {p.status === "ringing" && "incoming call…"}
          {p.status === "connecting" && "connecting…"}
          {p.status === "active" && `${timer} · ${p.speaking ? "speaking" : p.listening ? "listening" : "…"}`}
          {p.status === "ended" && "call ended"}
        </div>
        {p.status === "active" && p.heard && <div className="mt-6 px-8 text-neutral-300 text-sm italic">&ldquo;{p.heard}&rdquo;</div>}
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
        <button onClick={p.onHangup} disabled={p.status === "ended"} className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center" aria-label="Hang up">
          <PhoneIcon down />
        </button>
      )}
    </div>
  );
}

function PhoneIcon({ down }: { down?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={down ? { transform: "rotate(135deg)" } : undefined}>
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" />
    </svg>
  );
}
