import type { Channel, Session, SlotKey } from "./types";
import { MOOD_GUIDANCE, readMood } from "./mood";

// Deterministic onboarding policy. The LLM writes the words; this decides
// what the next move is, so behavior stays consistent under adversarial users.

export const MAX_ASKS_PER_SLOT = 2; // after this, defer and bring it up later only when relevant
export const MAX_CONSECUTIVE_ASKS = 1; // after an ask, the next turn just responds like a person
export const MAX_CALL_OFFERS = 2;
// One check-in after a real while, then a spoken heads-up and a hangup (never waits forever).
// The silence ladder on a call. The client waits 25s before the first strike (45s after "hold on");
// each strike tells it how long to wait for the next. Warning at about two minutes of total silence.
export const SILENCE_SECOND_MS = 30000; // check-in -> softer check-in
export const SILENCE_BEFORE_WARN_MS = 65000; // softer check-in -> heads-up (25 + 30 + 65 = 2 min)
export const SILENCE_WARN_STRIKE = 3;
export const SILENCE_WARN_GAP_MS = 12000; // heads-up -> goodbye and hangup
export const MAX_SILENCE_STRIKES = 4;
export const HOLD_MS = 45000; // "hold on" / "one sec": first check-in waits this long

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
  text: ["agentName", "helpNeed", "userName", "gmail"],
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

  // They called us: their topic first. Setup can come back only after a few turns of theirs
  // (the brief still wants it kept on track when something's missing).
  const theirTurn = channel === "voice" && s.call.byUser && userTurnsThisCall(s) < INBOUND_OWN_TURNS;
  const mayAsk = nextSlot !== null && s.consecutiveAsks < MAX_CONSECUTIVE_ASKS && !theirTurn;
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
  if (channel === "voice" && isOpen(s, "gmail") && nextSlot === "gmail" && !theirTurn) {
    notes.push("Gmail can't be connected by voice: call send_gmail_link and tell them the link is in their texts.");
  }
  if (theirTurn) {
    notes.push(
      "They called you, so they're bringing something. Be there like a friend: listen, reflect what they said, follow their topic. Don't push setup items or any agenda, and don't bring up earlier topics (their old need, past emails, what you talked about before) unless they do. Short replies, comfortable with pauses.",
    );
  }
  if (s.phase === "post_call") {
    notes.push("The call has ended. Continue over text without re-asking anything already collected.");
  }
  if (s.agentNameDefaulted && s.slots.agentName.value === "Persona") {
    notes.push("They skipped naming you, so you're going by Persona for now (they were told). Don't ask for a name again; if they give you one later, take it with set_slot.");
  }
  if (rushed && !canGraduate && s.phase !== "on_call") {
    notes.push("They seem in a hurry: offer to skip the rest of setup and just start with whatever they need. Graduate only if they say yes.");
  }
  if (s.slots.helpNeed.status === "filled" && !canGraduate && !theirTurn) {
    notes.push(
      "You know what they need: give a small concrete taste of help now, and tie whatever's left (especially Gmail) to that need. Don't graduate unless they ask to skip or stop setup.",
    );
  }
  if (canGraduate) {
    notes.push(
      s.call.active
        ? "Everything's gathered. Help with their need, then let them know that's all you needed and ask if there's anything else. Don't hang up until they say bye."
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
// A question counts toward the "don't ask twice in a row" rule; only a question about a slot
// counts toward that slot's ask budget (so "want me to call?" never uses up the name ask).
export function recordAsk(s: Session, askedSlot: SlotKey | null, isQuestion = askedSlot !== null) {
  if (!isQuestion) {
    s.consecutiveAsks = 0;
    return;
  }
  s.consecutiveAsks += 1;
  if (!askedSlot) return;
  s.slots[askedSlot].asks += 1;
  s.lastAskedSlot = askedSlot;
  if (s.slots[askedSlot].asks > MAX_ASKS_PER_SLOT && s.slots[askedSlot].status === "missing") {
    s.slots[askedSlot].status = "deferred";
  }
}

export function directiveText(s: Session, d: Directive, channel: Channel, hasMove = false): string {
  // They called us: the old need stays out of view until they bring it up themselves on this call,
  // so it can't open with "i've got you down for..." (it did).
  const callStart = s.call.startedAt ?? 0;
  const raisedNeed = s.transcript.some((m) => m.role === "user" && m.ts >= callStart && sharesWords(m.text, s.slots.helpNeed.value ?? ""));
  const hideNeed = channel === "voice" && s.call.byUser && !raisedNeed;
  const slotLines = (Object.keys(s.slots) as SlotKey[])
    .map((k) => {
      const sl = s.slots[k];
      if (k === "helpNeed" && hideNeed) return `- ${SLOT_NAME[k]}: (don't bring up; follow what they bring to this call)`;
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
    s.call.active
      ? "STREAMS: you're talking on the call, and there's a separate text chat. Whatever you put in the chat (a link, a draft, a list) happens there, not on the call: say out loud what you're sending and what it looks like, so they know where to look."
      : "",
    "REMINDER: this is setup. You can't call businesses or book anything yet. For anything live (weather, hours, prices, news), look it up now with web_search and read_page, and only quote what you read. Never say \"one sec\", \"checking now\", \"calling them now\", or \"it'll be ready in a minute\"; do it in this turn or draft something right here in the message.",
    s.slots.gmail.status === "filled" ? "GMAIL: already connected. Never mention the link again." : s.slots.gmail.status === "declined" ? "GMAIL: they said no. Don't bring it up again unless they do." : "",
    `PHASE: ${s.phase}`,
    s.slots.agentName.status === "filled" ? `CONTACT CARD: ${s.contactSaved ? "saved by the user" : "sent, not saved yet (a call from you shows up as an unknown number)"}` : "",
    `SLOTS:\n${slotLines}`,
    // When a move is chosen it says what (if anything) to ask; a second "ask" line would mean two questions.
    hasMove ? "" : d.nextSlot && d.mayAsk ? `COULD ASK ABOUT (only if it flows naturally, fine to skip this turn): ${SLOT_LABEL[d.nextSlot]}` : "NEXT TO GATHER: nothing this turn",
    d.offerCall ? "You may offer a quick call (call offer_call) if it fits naturally." : "",
    d.notes.length ? `NOTES:\n- ${d.notes.join("\n- ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// Do two texts share a meaningful word ("recruiter", "inbox")?
function sharesWords(a: string, b: string) {
  const words = (x: string) => new Set(x.toLowerCase().match(/[a-z]{5,}/g) ?? []);
  const wb = words(b);
  return [...words(a)].some((w) => wb.has(w));
}

// On a call they started, this many of their turns belong to their topic before setup can come up.
export const INBOUND_OWN_TURNS = 3;
export function userTurnsThisCall(s: Session) {
  const start = s.call.startedAt ?? 0;
  return s.transcript.filter((m) => m.role === "user" && m.channel === "voice" && m.ts >= start).length;
}
