"use client";
import { useEffect } from "react";
import type { Msg } from "@/lib/types";

// Left on read over text: after a while with the agent's text unanswered, ask the server for one double text.
// The server decides what (or whether) to say; this only keeps time. Typing, a call, or a reply in flight resets it.
const IDLE_MS = Number(process.env.NEXT_PUBLIC_IDLE_FIRST_MS) || 45000;
const BEFORE_FIRST_MS = 60000; // before their first message they may still be reading the intro

export function useIdleNudge(messages: Msg[], busy: boolean, nudge: () => void) {
  useEffect(() => {
    if (busy) return;
    const last = messages.findLast((m) => m.kind !== "event");
    if (!last || last.role !== "agent" || last.channel !== "text") return;
    const lastUser = messages.findLastIndex((m) => m.role === "user");
    // One double text at most, then quiet until they're back.
    if (messages.slice(lastUser + 1).some((m) => m.move?.id === "nudge" || m.move?.id === "default-name")) return;
    const after = lastUser < 0 ? Math.max(IDLE_MS, BEFORE_FIRST_MS) : IDLE_MS;
    const t = setTimeout(nudge, Math.max(1000, after - (Date.now() - last.ts)));
    return () => clearTimeout(t);
  }, [messages, busy, nudge]);
}
