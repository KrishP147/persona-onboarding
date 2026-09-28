"use client";
// composer hint: when the agent just asked something and the composer sits empty a while,
// swap the placeholder for one example of what to type. never fills the input, never blocks typing.
import { useEffect, useState } from "react";
import type { Msg, Session, SlotKey } from "@/lib/types";

const DELAY_MS = 5000;

// moves that ask (or lead the system to ask) for one of these four slots, even without a trailing "?"
const MOVE_SLOT: Partial<Record<string, SlotKey>> = {
  discover: "helpNeed",
  dig: "helpNeed",
  "ask-gmail": "gmail",
  "ask-name": "userName",
  "name-me": "agentName",
  intro: "agentName",
};

// same preference order as src/lib/policy.ts ORDER.text (that file doesn't export it; duplicated here)
const ORDER_TEXT: SlotKey[] = ["agentName", "helpNeed", "userName", "gmail"];

// name ideas: the persona team (one per session, so it doesn't change under them)
const NAME_IDEAS = ["zach", "tanay", "julia", "aarav", "mac", "jason", "yasser"];
const nameIdea = (id = "") => NAME_IDEAS[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % NAME_IDEAS.length];

const EXAMPLE: Record<SlotKey, string> = {
  agentName: "e.g. call you zach",
  userName: "e.g. call me sam",
  helpNeed: "e.g. my inbox is a mess",
  gmail: "e.g. sure, send the link",
};

function openSlot(session: Session | null, moveId: string | undefined): SlotKey | null {
  if (!session) return null;
  const mapped = moveId ? MOVE_SLOT[moveId] : undefined;
  if (mapped && session.slots[mapped].status === "missing") return mapped;
  return ORDER_TEXT.find((k) => session.slots[k].status === "missing") ?? null;
}

export interface StuckHintInput {
  enabled: boolean;
  messages: Msg[];
  session: Session | null;
  draft: string;
  busy: boolean; // typing dots, revealing, on a call, recording/transcribing, an attachment queued
}

// undefined means "use the skin's own default placeholder"
export function useStuckHint({ enabled, messages, session, draft, busy }: StuckHintInput): string | undefined {
  const last = messages.findLast((m) => m.kind !== "event");
  const isAgentQuestion =
    !!last && last.role === "agent" && last.channel === "text" && (/\?\s*$/.test(last.text.trim()) || (!!last.move?.id && last.move.id in MOVE_SLOT));
  const eligible = enabled && isAgentQuestion && !busy && !draft.trim();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!eligible) return; // the cleanup below (from the last time this ran true) already reset `show`
    const wait = Math.max(0, DELAY_MS - (Date.now() - last!.ts));
    const t = setTimeout(() => setShow(true), wait);
    return () => {
      clearTimeout(t);
      setShow(false);
    };
  }, [eligible, last]);

  if (!show) return undefined;
  const slot = openSlot(session, last?.move?.id);
  // a leading 💡 so it reads as a hint, not something already typed
  return slot ? `💡 ${slot === "agentName" ? `e.g. call you ${nameIdea(session?.id)}` : EXAMPLE[slot]}` : undefined;
}
