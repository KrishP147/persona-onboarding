import type { Channel, Session, SlotKey } from "./types";

// Deterministic onboarding policy. The LLM writes the words; this decides
// what the next move is, so behavior stays consistent under adversarial users.

export const MAX_ASKS_PER_SLOT = 2; // after this, defer and bring it up later only when relevant
export const MAX_CONSECUTIVE_ASKS = 2; // then give value before asking again
export const MAX_CALL_OFFERS = 2;
export const MAX_SILENCE_STRIKES = 3;

const SLOT_LABEL: Record<SlotKey, string> = {
  agentName: "a name for you (the assistant)",
  userName: "what to call the user",
  gmail: "connecting their Gmail (send the link, never ask for passwords)",
  helpNeed: "something they could use help with",
};

// Preferred order per channel. Agent name is text-only (per the brief).
const ORDER: Record<Channel, SlotKey[]> = {
  text: ["agentName", "userName", "helpNeed", "gmail"],
  voice: ["userName", "helpNeed", "gmail"],
};

export interface Directive {
  nextSlot: SlotKey | null;
  mayAsk: boolean;
  offerCall: boolean;
  canGraduate: boolean;
  missing: SlotKey[];
  notes: string[];
  chips: string[];
}

export function isOpen(s: Session, k: SlotKey) {
  return s.slots[k].status === "missing";
}

export function computeDirective(s: Session, channel: Channel): Directive {
  const notes: string[] = [];
  const missing = (Object.keys(s.slots) as SlotKey[]).filter((k) => isOpen(s, k));

  if (s.phase === "graduated") {
    return {
      nextSlot: null,
      mayAsk: false,
      offerCall: false,
      canGraduate: false,
      missing,
      notes: [
        "Onboarding is over; act as the full assistant. Only mention a missing item if it directly helps the current request.",
      ],
      chips: [],
    };
  }

  const nextSlot = ORDER[channel].find((k) => isOpen(s, k)) ?? null;

  const mayAsk = nextSlot !== null && s.consecutiveAsks < MAX_CONSECUTIVE_ASKS;
  if (!mayAsk && nextSlot) {
    notes.push(
      "You've asked for things several turns in a row. This turn, give the user something useful (answer, idea, mini-demo) and do NOT ask for info.",
    );
  }
  if (nextSlot && s.slots[nextSlot].asks >= 1 && mayAsk) {
    notes.push(`You already asked about ${SLOT_LABEL[nextSlot]} once; rephrase lightly, don't repeat verbatim.`);
  }

  // Offer the call once the agent has a name (or the user dodged naming), text only.
  const offerCall =
    channel === "text" &&
    !s.call.active &&
    s.phase !== "post_call" &&
    s.callOffers < MAX_CALL_OFFERS &&
    s.slots.agentName.status !== "missing" &&
    (isOpen(s, "userName") || isOpen(s, "helpNeed"));

  const helpKnown = s.slots.helpNeed.status === "filled";
  const canGraduate = helpKnown && s.slots.userName.status !== "missing";

  if (channel === "voice" && isOpen(s, "agentName")) {
    notes.push("Don't ask for your own name on the call; that happens over text. If the user offers one, accept it.");
  }
  if (channel === "voice" && isOpen(s, "gmail") && nextSlot === "gmail") {
    notes.push("Gmail can't be connected by voice: call send_gmail_link and tell them the link is in their texts.");
  }
  if (s.phase === "post_call") {
    notes.push("The call has ended. Continue over text without re-asking anything already collected.");
  }
  if (canGraduate) {
    notes.push(
      "The user has told you what they need. Help with it now (a concrete mini-task), then call graduate. Leftover items get deferred.",
    );
  }

  return { nextSlot, mayAsk, offerCall, canGraduate, missing, notes, chips: chipsFor(s, channel, offerCall) };
}

function chipsFor(s: Session, channel: Channel, offerCall: boolean): string[] {
  if (channel === "voice") return [];
  const chips: string[] = [];
  if (offerCall) chips.push("Call me");
  if (offerCall) chips.push("Text is fine");
  if (isOpen(s, "gmail") && s.slots.agentName.status !== "missing") chips.push("Connect Gmail");
  if (isOpen(s, "helpNeed")) chips.push("I know what I need");
  chips.push("Skip setup");
  return chips.slice(0, 4);
}

// Book-keeping after the agent's reply is known.
export function recordAsk(s: Session, askedSlot: SlotKey | null) {
  if (askedSlot) {
    s.slots[askedSlot].asks += 1;
    s.consecutiveAsks += 1;
    s.lastAskedSlot = askedSlot;
    if (s.slots[askedSlot].asks > MAX_ASKS_PER_SLOT && s.slots[askedSlot].status === "missing") {
      s.slots[askedSlot].status = "deferred";
    }
  } else {
    s.consecutiveAsks = 0;
  }
}

export function directiveText(s: Session, d: Directive, channel: Channel): string {
  const slotLines = (Object.keys(s.slots) as SlotKey[])
    .map((k) => {
      const sl = s.slots[k];
      return `- ${k}: ${sl.status}${sl.value ? ` = "${sl.value}"` : ""} (asked ${sl.asks}x)`;
    })
    .join("\n");
  return [
    `CHANNEL: ${channel === "voice" ? "live phone call (speak; short sentences; no emoji, no lists)" : "text messages"}`,
    `PHASE: ${s.phase}`,
    `SLOTS:\n${slotLines}`,
    d.nextSlot && d.mayAsk ? `NEXT TO GATHER (gently, woven in): ${SLOT_LABEL[d.nextSlot]}` : "NEXT TO GATHER: nothing this turn",
    d.offerCall ? "You may offer a quick call (call offer_call) if it fits naturally." : "",
    d.notes.length ? `NOTES:\n- ${d.notes.join("\n- ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
