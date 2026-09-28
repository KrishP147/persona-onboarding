"use client";
import { useEffect } from "react";
import type { Msg } from "@/lib/types";

// Left on read over text: after a while with the agent's text unanswered, ask the server for a double text.
// The server decides what (or whether) to say; this only keeps time. Typing, a call, or a reply in flight resets it.
const FIRST_MS = Number(process.env.NEXT_PUBLIC_IDLE_FIRST_MS) || 45000;
const SECOND_MS = Number(process.env.NEXT_PUBLIC_IDLE_SECOND_MS) || 180000;

export function useIdleNudge(messages: Msg[], busy: boolean, nudge: () => void) {
  useEffect(() => {
    if (busy) return;
    const last = messages.findLast((m) => m.kind !== "event");
    if (!last || last.role !== "agent" || last.channel !== "text") return;
    const lastUser = messages.findLastIndex((m) => m.role === "user");
    // A two-bubble double text counts once (same rule as the server's countNudges).
    const isNudge = (m?: Msg) => m?.move?.id === "nudge" || m?.move?.id === "default-name";
    const since = messages.slice(lastUser + 1);
    const nudges = since.filter((m, i) => isNudge(m) && !(isNudge(since[i - 1]) && m.ts - since[i - 1].ts < 5000)).length;
    const after = [FIRST_MS, SECOND_MS][nudges];
    if (after === undefined) return;
    const t = setTimeout(nudge, Math.max(1000, after - (Date.now() - last.ts)));
    return () => clearTimeout(t);
  }, [messages, busy, nudge]);
}
