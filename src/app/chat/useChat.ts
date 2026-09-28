"use client";
// the conversation: session, pacing, receipts, voice notes, calls, gmail, offline. no ui here.
import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Attachment, ClientAction, Msg, Session, TurnResult } from "@/lib/types";
import { AGENT_NUMBER } from "./skins/shared";
import type { Receipt } from "./skins/types";
import { useVoiceCall } from "./useVoiceCall";
import { useIdleNudge } from "./useIdleNudge";
import { useStuckHint } from "./useStuckHint";
import { usePref } from "./usePref";

const LS_KEY = "persona-onboarding-session";
// event-handler clock (kept out of render so the purity lint rule stays quiet)
const now = () => Date.now();

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
    // the previous turn on this conversation is still finishing: wait a beat and try once more.
    await new Promise((r) => setTimeout(r, 1200));
    const again = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive });
    if (!again.ok) throw new Error(`${again.status}`);
    return again.json();
  }
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function fileToAttachment(f: File): Promise<Attachment> {
  const kind = f.type.startsWith("image/") ? "image" : f.type.startsWith("audio/") ? "audio" : f.type.startsWith("video/") ? "video" : "file";
  if (kind !== "image") return { kind, name: f.name, mime: f.type, summary: "(media parsing not wired yet)" };
  // downscale images so uploads stay small.
  const bmp = await createImageBitmap(f);
  const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return { kind, name: f.name, mime: "image/jpeg", dataUrl: c.toDataURL("image/jpeg", 0.85) };
}

// their time zone, so "what day is it?" is answered from their clock, not the model's guess.
function localTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

// events whose reply the agent writes (a model turn): show typing dots meanwhile, like any text
const TYPING_EVENTS = new Set(["gmail_connected", "inbox_scan", "gmail_failed", "call_ended", "call_declined", "mic_denied"]);

export function useChat() {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraftState] = useState("");
  // when they last touched the composer (typed, or an edit prefill): the idle nudge measures from this too,
  // so typing then clearing the draft doesn't make the nudge think they've been silent since the agent's message.
  const [lastKeystroke, setLastKeystroke] = useState(0);
  const setDraft = useCallback((v: string) => {
    setLastKeystroke(now());
    setDraftState(v);
  }, []);
  const [pending, setPending] = useState<Attachment[]>([]);
  const [typing, setTyping] = useState(false);
  const [mock, setMock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const retryRef = useRef<(() => void) | null>(null);
  const chanRef = useRef<BroadcastChannel | null>(null);
  const idRef = useRef<string | null>(null);
  const serverIds = useRef<Set<string>>(new Set()); // message ids the server last had

  const upsert = useCallback((incoming: Msg[]) => {
    setMessages((prev) => {
      const next = [...prev];
      for (const m of incoming) {
        const i = next.findIndex((x) => x.id === m.id);
        if (i >= 0) {
          // keep device-only bits (a voice note's playback link) when the server's copy replaces ours.
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
  const callbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRing = () => {
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    ringTimerRef.current = null;
  };
  const [callHidden, setCallHidden] = useState(false); // small screens: peek at the texts mid-call
  // replies arrive like texts from a person: one bubble at a time, with a typing pause between.
  const revealRef = useRef<Promise<void>>(Promise.resolve());
  const [revealing, setRevealing] = useState(false);
  const [seenAt, setSeenAt] = useState(0); // last time the texts were on screen (for the call's unread badge)
  // bringing the call screen up: everything in the texts so far counts as seen.
  const showCall = () => {
    setSeenAt(Date.now());
    setCallHidden(false);
  };
  // voice notes: record in the browser, transcribe on our server (deepgram), send the words.
  const [recording, setRecording] = useState<{ startedAt: number } | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<{ rec: MediaRecorder; chunks: Blob[]; stream: MediaStream } | null>(null);
  // read receipts for your own texts: sent, delivered, seen.
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({});
  const setReceipt = (id: string, r: Receipt) => setReceipts((prev) => ({ ...prev, [id]: r }));
  // "what do you know about me": the id of the user text that asked, so the what-i-know card can
  // anchor right after that turn (see cards/KnowCard.tsx useGradSlot). in-memory only, not persisted.
  const [knowAskId, setKnowAskId] = useState<string | null>(null);
  // replying to one message (hover or swipe "reply"): shown above the composer until sent or cancelled
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const apply = useCallback(
    (r: TurnResult, sentAt?: number) => {
      if (idRef.current && r.session.id !== idRef.current) return; // stale reply from another session
      // the server folds a re-sent growing voice utterance into one message: drop the copies it removed
      const ids = new Set(r.session.transcript.map((m) => m.id));
      setMessages((prev) => prev.filter((m) => ids.has(m.id) || !serverIds.current.has(m.id)));
      serverIds.current = ids;
      setSession(r.session);
      if (r.actions.some((a) => a.type === "show_know")) {
        const last = r.session.transcript.findLast((m) => m.role === "user");
        if (last) setKnowAskId(last.id);
      }
      chanRef.current?.postMessage("sync");
      revealRef.current = revealRef.current
        .then(async () => {
          // on a call: say it first, then do it in the chat ("i'm texting you the link" -> the link shows up).
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
            // a person reads, then types: longer replies take longer. the server's own time counts toward it.
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
        })
        .catch(() => setRevealing(false));
    },
    [upsert],
  );

  // pull the latest server state (other tab, popup, or coming back online).
  const resync = useCallback(async () => {
    if (!idRef.current) return;
    try {
      const res = await fetch(`/api/session?id=${encodeURIComponent(idRef.current)}`, { cache: "no-store" });
      const data = (await res.json()) as { session: Session; chips: string[] };
      if (busyRef.current > 0) return; // a reply is on its way; it carries the fresh state
      setSession(data.session);
      setMessages((prev) => {
        // server order, plus anything local the server hasn't saved yet (a message still sending).
        const ids = new Set(data.session.transcript.map((m) => m.id));
        serverIds.current = ids;
        return [...data.session.transcript, ...prev.filter((m) => !ids.has(m.id) && m.role === "user")];
      });
    } catch {}
  }, []);

  const sendEvent = useCallback(
    async (event: Record<string, unknown>): Promise<boolean> => {
      if (!idRef.current) return false;
      const dots = TYPING_EVENTS.has(String(event.type));
      if (dots) setTyping(true);
      try {
        apply(await post<TurnResult>("/api/session", { sessionId: idRef.current, event }, true));
        setError(null);
        return true;
      } catch {
        setError("connection hiccup, retrying won't lose anything");
        return false;
      } finally {
        if (dots) setTyping(false);
      }
    },
    [apply],
  );

  const call = useVoiceCall({
    voice: session?.voice ?? "neutral",
    sessionId: session?.id ?? null,
    onUtterance: async (text, interrupted, heardBefore) => {
      if (!idRef.current) return;
      const turn = ++voiceTurnRef.current;
      // speaking again before the reply lands means they moved on; say so to the server.
      const body = { sessionId: idRef.current, channel: "voice", tz: localTz(), text, interrupted: interrupted || (turn > 1 && busyRef.current > 0), ...(interrupted && heardBefore !== undefined ? { heardBefore } : {}) };
      busyRef.current++;
      try {
        const r = await post<TurnResult>("/api/chat", body).catch(async () => {
          // one quiet retry (a busy session or a slow model), then own it out loud, on the call.
          await new Promise((res) => setTimeout(res, 600));
          return post<TurnResult>("/api/chat", body);
        });
        // a reply to something they've already talked past: keep the text, don't say it out loud.
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
      // speech first, so a goodbye is queued before the hangup that waits for it.
      const ordered = [...actions].sort((a, b) => Number(b.type === "speak") - Number(a.type === "speak"));
      let spoken: Promise<unknown> = Promise.resolve();
      for (const a of ordered) {
        // a real call takes a moment to come through after "calling you now."
        if (a.type === "ring_later") {
          if (callbackTimerRef.current) clearTimeout(callbackTimerRef.current);
          callbackTimerRef.current = setTimeout(() => ringNow(0), a.ms);
        }
        if (a.type === "start_call") ringNow(3000);
        function ringNow(delay: number) {
          clearRing();
          ringTimerRef.current = setTimeout(() => {
            call.setStatus((st) => (st === "idle" ? "ringing" : st));
            // nobody picks up: stop ringing after a while, like a real phone.
            ringTimerRef.current = setTimeout(() => {
              call.setStatus((st) => {
                if (st === "ringing") void sendEvent({ type: "call_declined" });
                return st === "ringing" ? "idle" : st;
              });
            }, 30000);
          }, delay);
        }
        if (a.type === "speak") spoken = call.speak(a.text);
        if (a.type === "end_call") call.endAfterSpeaking(!!a.final);
        if (a.type === "patience") call.patience(a.ms);
        // "connected" landed; the slower look through the inbox follows as its own request
        if (a.type === "inbox_scan") void sendEvent({ type: "inbox_scan" });
      }
      return spoken;
    };
  });

  // other tabs, visibility, connectivity: keep every view in step with the server.
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

  // gmail popup reports back here; the server already holds the verified result.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "persona-gmail") return;
      if (e.data.ok) void sendEvent({ type: "gmail_connected" });
      else void sendEvent({ type: "gmail_failed", error: String(e.data.error ?? "unknown") });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [sendEvent]);

  // boot: resume the stored session (refresh-safe) or create one.
  const bootedRef = useRef(false);
  useEffect(() => {
    // once per page load (dev strict mode runs effects twice, which made two sessions).
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
      serverIds.current = new Set(data.session.transcript.map((m) => m.id));
      setMock(data.mock);
      // a call can't survive a reload: tell the server it dropped.
      if (data.session.call.active) {
        await sendEvent({ type: "call_ended", reason: "error" });
        // the old page's hangup may still be finishing: show its "call ended" and recap when they land.
        await resync();
        setTimeout(() => void resync(), 4000);
      } else if (data.session.transcript.length === 0) {
        setTyping(true);
        await sendEvent({ type: "open" });
        setTyping(false);
      }
    })().catch(() => setError("couldn't reach the server"));
  }, [sendEvent, resync]);

  const send = async (text: string, extra?: { attachments: Attachment[] }) => {
    if (!idRef.current || (!text.trim() && pending.length === 0 && !extra)) return;
    const atts = extra?.attachments ?? pending;
    const quoted = extra ? undefined : replyTo?.id;
    if (!extra) {
      setDraftState("");
      setPending([]);
      setReplyTo(null);
    }
    // your own message lands right away, like any messaging app.
    const clientId = nanoid(10);
    upsert([{ id: clientId, role: "user", channel: "text", text, ts: now(), ...(atts.length ? { attachments: atts } : {}), ...(quoted ? { replyTo: quoted } : {}) }]);
    setReceipt(clientId, "sent");
    // the request is on the server within a beat; if it fails, the message comes back out.
    const deliveredTimer = setTimeout(() => setReceipt(clientId, "delivered"), 350);
    // they "read" it first; the typing dots only show after a beat.
    const typingTimer = setTimeout(() => setTyping(true), 500);
    const sentAt = now();
    // a new text wins over a call that hasn't come through yet ("actually, not now").
    if (call.status === "idle") clearRing();
    busyRef.current++;
    try {
      const reply = await post<TurnResult>("/api/chat", { sessionId: idRef.current, channel: "text", text, attachments: atts, clientId, tz: localTz(), ...(quoted ? { replyTo: quoted } : {}) });
      clearTimeout(deliveredTimer);
      setReceipt(clientId, "seen"); // the agent has read it; its reply follows at a human pace
      apply(reply, sentAt);
      setError(null);
    } catch {
      clearTimeout(deliveredTimer);
      setMessages((prev) => prev.filter((m) => m.id !== clientId));
      setDraftState(text);
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

  // mic is live: tell the server, or hang up if it can't hear us.
  const connectCall = async (byUser = false) => {
    showCall();
    if (!(await call.accept())) return;
    if (await sendEvent({ type: "call_started", byUser })) call.greeted();
    else call.hangUp("error");
  };

  // the user placing the call is consent enough: connect straight away, no ringing.
  const startUserCall = async () => {
    if (call.status !== "idle") return;
    clearRing();
    await connectCall(true);
  };

  const connectGmail = () => {
    if (!idRef.current) return;
    const w = window.open(`/api/auth/google/start?s=${idRef.current}`, "persona-gmail", "width=480,height=680");
    if (!w) setError("your browser blocked the google window. allow popups for this page and tap the link again.");
  };

  // until the card is saved, the thread and incoming calls show a bare number, like a real phone.
  const saved = !!session?.contactSaved && !!session?.slots.agentName.value;
  const agentName = saved ? session!.slots.agentName.value! : AGENT_NUMBER;

  const saveContact = () => {
    if (!session || session.contactSaved) return;
    setSession({ ...session, contactSaved: true }); // instant, the server catches up
    void sendEvent({ type: "contact_saved" });
  };

  // "forget" on the what-i-know card: gone here at once, the server wipes it for real
  const forgetSlot = (slot: "userName" | "helpNeed" | "gmail") => {
    if (!session) return;
    const was = session.slots[slot];
    setSession({ ...session, slots: { ...session.slots, [slot]: { ...was, value: null, status: "declined" } }, ...(slot === "gmail" ? { gmailEmail: undefined, alerts: undefined } : {}) });
    void sendEvent({ type: "forget_slot", slot });
  };

  // draft card: edit in place (instant here, the server confirms and re-saves to gmail) or discard
  const saveDraftEdit = (to: string, subject: string, body: string) => {
    if (!session?.draft) return;
    setSession({ ...session, draft: { ...session.draft, to: to.trim(), subject: subject.trim(), body: body.trim() } });
    void sendEvent({ type: "draft_edit", to, subject, body });
  };
  const discardDraft = () => {
    if (!session?.draft) return;
    setSession({ ...session, draft: undefined });
    void sendEvent({ type: "draft_discard" });
  };

  // start over with a fresh session (keeps the old one server side, just forgets it here).
  const restart = () => {
    if (call.status === "active" || call.status === "connecting") call.hangUp("user_hangup");
    try {
      localStorage.removeItem(LS_KEY);
    } catch {}
    // keep the phone pick in the url, drop the session
    const url = new URL(window.location.href);
    url.searchParams.delete("s");
    window.location.replace(url.pathname + url.search);
  };

  const onCall = call.status === "active" || call.status === "connecting";
  // left on read: a friend double texts once (then once more, lightly), never nags.
  const nudge = useCallback(() => void sendEvent({ type: "text_idle" }), [sendEvent]);
  useIdleNudge(messages, typing || revealing || !!draft.trim() || pending.length > 0 || call.status !== "idle" || !!recording || transcribing, lastKeystroke, nudge);
  const thread = messages.filter((m) => m.channel !== "voice");
  const [typingHints] = usePref("persona-typing-hints", true);
  const hint = useStuckHint({
    enabled: typingHints,
    messages: thread,
    session,
    draft,
    busy: typing || revealing || onCall || !!recording || transcribing || pending.length > 0,
  });
  // texts that arrived while the call screen covered them (a link, a draft): shown as a badge on the call.
  const textsVisible = callHidden || !onCall;
  const unread = textsVisible ? 0 : thread.filter((m) => m.role === "agent" && m.kind !== "event" && m.ts > seenAt).length;

  const attachFiles = async (files: File[]) => setPending(await Promise.all(files.slice(0, 4).map(fileToAttachment)));

  const acceptCall = () => {
    clearRing();
    void connectCall();
  };
  const declineCall = () => {
    clearRing();
    call.setStatus("idle");
    void sendEvent({ type: "call_declined" });
  };

  return {
    session,
    messages,
    thread,
    draft,
    setDraft,
    hint,
    pending,
    typing,
    revealing,
    mock,
    error,
    offline,
    receipts,
    recording,
    transcribing,
    call,
    callHidden,
    setCallHidden,
    showCall,
    onCall,
    unread,
    saved,
    agentName,
    send,
    startNote,
    stopNote,
    startUserCall,
    acceptCall,
    declineCall,
    connectGmail,
    saveContact,
    forgetSlot,
    restart,
    attachFiles,
    knowAskId,
    replyTo,
    setReplyTo,
    saveDraftEdit,
    discardDraft,
  };
}

export type Chat = ReturnType<typeof useChat>;
