import type { Channel, Session, SlotKey } from "./types";
import { MOOD_GUIDANCE, readMood } from "./mood";

// Deterministic onboarding policy. The LLM writes the words; this decides
// what the next move is, so behavior stays consistent under adversarial users.

export const MAX_ASKS_PER_SLOT = 2; // after this, defer and bring it up later only when relevant
export const MAX_CONSECUTIVE_ASKS = 1; // after an ask, the next turn just responds like a person
export const MAX_CALL_OFFERS = 2;
export const MAX_SILENCE_STRIKES = 3;

const SLOT_NAME: Record<SlotKey, string> = {
  agentName: "agentName (YOUR name, the assistant's)",
  userName: "userName (THEIR name, the user's)",
  gmail: "gmail",
  helpNeed: "helpNeed",
};

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
  callFirst: boolean;
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
      callFirst: false,
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

  // Offer the call once the agent has a name (or the user dodged naming): the call gathers the rest.
  const offerCall =
    channel === "text" &&
    !s.call.active &&
    s.phase !== "post_call" &&
    s.call.endedReason !== "declined" &&
    s.callOffers < MAX_CALL_OFFERS &&
    s.slots.agentName.status !== "missing" &&
    (isOpen(s, "userName") || isOpen(s, "helpNeed") || isOpen(s, "gmail"));
  const callFirst = offerCall && s.callOffers === 0;

  // Early graduation is the user's call; otherwise finish once nothing is left to gather.
  const canGraduate = missing.length === 0;
  // Offering to skip setup is a big move: only on a confident read, not a single terse text.
  const mood = readMood(s.transcript);
  const rushed = mood.mood === "rushed" && mood.confidence !== "low";

  if (channel === "voice" && isOpen(s, "agentName")) {
    notes.push("Don't ask for your own name on the call; that happens over text. If the user offers one, accept it.");
  }
  if (channel === "voice" && isOpen(s, "gmail") && nextSlot === "gmail") {
    notes.push("Gmail can't be connected by voice: call send_gmail_link and tell them the link is in their texts.");
  }
  if (s.phase === "post_call") {
    notes.push("The call has ended. Continue over text without re-asking anything already collected.");
  }
  if (rushed && !canGraduate && s.phase !== "on_call") {
    notes.push("They seem in a hurry: offer to skip the rest of setup and just start with whatever they need. Graduate only if they say yes.");
  }
  if (s.slots.helpNeed.status === "filled" && !canGraduate) {
    notes.push(
      "You know what they need: give a small concrete taste of help now, and tie whatever's left (especially Gmail) to that need. Don't graduate unless they ask to skip or stop setup.",
    );
  }
  if (canGraduate) {
    notes.push(
      s.call.active
        ? "Everything's gathered. Help with their need, then wrap up the call warmly (goodbye, you'll text a recap, end_call). Graduate after that."
        : "Everything's gathered. Help with their need and call graduate.",
    );
  }
  if (callFirst) {
    notes.push(
      "Right now, ask permission for a quick call (about a minute) to get set up, and call offer_call. Make texting instead an easy yes. Don't ask for anything else in this message.",
    );
  }

  return { nextSlot, mayAsk: mayAsk && !callFirst, offerCall, canGraduate, callFirst, missing, notes, chips: chipsFor(s, channel, offerCall) };
}

function chipsFor(s: Session, channel: Channel, offerCall: boolean): string[] {
  if (channel === "voice") return [];
  const chips: string[] = [];
  if (offerCall) chips.push("Call me");
  if (offerCall) chips.push("Text is fine");
  const callWorthIt = isOpen(s, "userName") || isOpen(s, "helpNeed") || isOpen(s, "gmail");
  if (s.phase === "post_call" && callWorthIt) chips.push("Call me back");
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
      return `- ${SLOT_NAME[k]}: ${sl.status}${sl.value ? ` = "${sl.value}"` : ""} (asked ${sl.asks}x)`;
    })
    .join("\n");
  const mood = readMood(s.transcript);
  const moodLine =
    mood.mood === "cooperative" && mood.signals.length === 0
      ? `USER SEEMS: no strong signal. ${MOOD_GUIDANCE.cooperative}`
      : `USER SEEMS (${mood.confidence} confidence guess${mood.intensity === "high" ? ", strong feeling" : ""}): ${mood.mood} (${mood.signals.join(", ")}). ${MOOD_GUIDANCE[mood.mood]} If their words say otherwise, trust the words.`;
  return [
    moodLine,
    `CHANNEL: ${channel === "voice" ? "live phone call (speak: 1-2 short sentences per turn, then let them talk; no emoji, no lists)" : "text messages"}`,
    "REMINDER: this is setup. You can't browse, check prices, call businesses, or read anything live yet. Never say \"one sec\", \"checking now\", \"calling them now\", \"it'll be ready in a minute\", or quote prices or availability. Say what you'll do once you're set up, or draft something right here in the message.",
    s.slots.gmail.status === "filled" ? "GMAIL: already connected. Never mention the link again." : s.slots.gmail.status === "declined" ? "GMAIL: they said no. Don't bring it up again unless they do." : "",
    `PHASE: ${s.phase}`,
    s.slots.agentName.status === "filled" ? `CONTACT CARD: ${s.contactSaved ? "saved by the user" : "sent, not saved yet (a call from you shows up as an unknown number)"}` : "",
    `SLOTS:\n${slotLines}`,
    d.nextSlot && d.mayAsk ? `COULD ASK ABOUT (only if it flows naturally, fine to skip this turn): ${SLOT_LABEL[d.nextSlot]}` : "NEXT TO GATHER: nothing this turn",
    d.offerCall ? "You may offer a quick call (call offer_call) if it fits naturally." : "",
    d.notes.length ? `NOTES:\n- ${d.notes.join("\n- ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
