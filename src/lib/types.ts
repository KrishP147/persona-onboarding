export type SlotKey = "agentName" | "userName" | "gmail" | "helpNeed";
export const SLOT_KEYS: SlotKey[] = ["agentName", "userName", "gmail", "helpNeed"];

export type SlotStatus = "missing" | "filled" | "declined" | "deferred";

export interface Slot {
  value: string | null;
  status: SlotStatus;
  asks: number; // times the agent has asked for it
  source?: Channel;
  updatedAt?: number;
}

export type Channel = "text" | "voice";

export type Phase =
  | "intro" // texting, before any call
  | "call_offered"
  | "on_call"
  | "post_call"
  | "graduated";

export type VoiceStyle = "feminine" | "masculine" | "neutral";

export interface Attachment {
  kind: "image" | "audio" | "video" | "file";
  name: string;
  mime: string;
  // parsed content the agent can reason over (transcript, description)
  summary?: string;
  dataUrl?: string; // images only, kept small
  localUrl?: string; // voice notes: playback on this device only (never sent to the server)
  seconds?: number;
}

export type MsgKind = "text" | "gmail_link" | "contact_card" | "event" | "link_preview" | "gif";

export interface Msg {
  id: string;
  role: "user" | "agent" | "event";
  channel: Channel;
  text: string;
  ts: number;
  kind?: MsgKind;
  cutOff?: boolean; // voice line they talked over: text holds only what they heard
  attachments?: Attachment[];
  move?: Move; // which research-backed move produced this agent message (shown in the side panel)
  guards?: string[]; // safety nets in code that changed this reply this turn (shown in "why it said that")
  replyTo?: string; // the message they swiped/hovered to reply to (its id)
  discarded?: boolean; // an email draft they threw away (the card shows it as one muted line)
}

export interface Move {
  id: string;
  label: string;
  source: string;
}

export interface CallState {
  active: boolean;
  startedAt?: number;
  endedAt?: number;
  endedReason?: "user_hangup" | "agent_ended" | "silence" | "error" | "declined";
  silenceStrikes: number;
  byUser?: boolean; // they called us: follow their lead, don't run our agenda
  holding?: boolean; // they asked us to hold on: wait quietly, then "you still there?"
}

export interface Session {
  id: string;
  createdAt: number;
  updatedAt: number;
  phase: Phase;
  slots: Record<SlotKey, Slot>;
  callOffers: number;
  call: CallState;
  consecutiveAsks: number; // asks in a row without giving value
  lastAskedSlot?: SlotKey;
  voice: VoiceStyle;
  contactSaved?: boolean; // user tapped Save on the contact card: calls show the name, not a number
  pendingVoice?: VoiceStyle; // agent renamed mid-call: applies from the next call
  gmailEmail?: string;
  tz?: string; // their browser's time zone (IANA), for dates and times
  draft?: { id?: string; to: string; subject: string; body: string; shownAt: number; sent?: boolean; threadId?: string; dupWarnedAt?: number }; // latest email draft (gmail drafts id when saved there)
  lastSent?: { to: string; subject: string; threadId?: string; at: number }; // last email that went out: "email him again" / "follow up" means this one
  gmailUnread?: number; // small value moment at connect time; tokens are never stored
  gmailVerified?: { email: string; unread?: number; demo?: boolean; inbox?: InboxItem[] }; // set by the oauth callback, consumed by the gmail_connected event
  alerts?: Alert[];
  movesUsed?: string[]; // conversation moves already made (src/lib/moves.ts)
  llmFailures?: number; // model unreachable this many turns in a row
  prePhase?: Phase; // phase before a call, restored after (a call never undoes graduation)
  graduateAfterCall?: boolean; // they asked to skip setup mid-call: graduate once the call ends
  callDeclinedAt?: number; // transcript length when they said no to a call (in words or by declining) // interruptions shown, with outcomes (see src/lib/triage.ts)
  graduatedReason?: string;
  graduatedAt?: string; // ISO time setup ended (first time only), for the what-i-know card and setup time
  demoOffered?: boolean; // the sample inbox was offered (once) after google sign-in failed or stalled
  nameCheck?: { value: string; as: "user" | "agent" | "confirm" }; // a bare name answered two open name questions: we leaned one way and asked which
  agentNameDefaulted?: boolean; // they skipped naming it: goes by "Persona" until they pick one
  inboxToScan?: InboxItem[]; // gmail just connected over text: the inbox look happens in its own event (inbox_scan) so "connected" shows at once
  emailSeen?: string[]; // email text the agent has seen (subjects, snippets): slot values found only here are quarantined
  metrics?: SessionMetrics; // per-session cost and model latency (src/lib/usage.ts meter)
  askedQuestions?: string[]; // normalized questions it already asked (last 12): never ask twice
  turnBy?: "user" | "event"; // transient, never saved: who started this turn (intents only read on "user")
  transcript: Msg[];
}

// Headers + a short preview of one unread email. Only what triage needs; bodies are never fetched.
export interface InboxItem {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  date: number;
  labels?: string[];
}

// One interruption the agent raised unprompted, and what the user did with it.
export interface Alert {
  id: string;
  category: "deadline" | "money" | "person";
  reason: string;
  subject: string;
  from: string;
  shownAt: number;
  outcome: "pending" | "acted" | "dismissed" | "ignored";
  resolvedAt?: number;
}

// What the client needs to render after any turn/event.
export interface TurnResult {
  session: Session;
  newMessages: Msg[];
  chips: string[];
  actions: ClientAction[];
}

export type ClientAction =
  | { type: "start_call" }
  | { type: "end_call"; final?: boolean } // final: hang up even if they talk over the goodbye
  | { type: "speak"; text: string }
  | { type: "graduate" }
  | { type: "show_know" } // they asked what we know: show the what-i-know card after this turn
  | { type: "patience"; ms: number }
  | { type: "inbox_scan" }; // gmail just connected over text: ask for the inbox look next // user is doing a task (e.g. gmail sign-in): stretch the next silence window

// Server-side per-session numbers, cheap to keep: no extra model calls, bounded latency sample.
export interface SessionMetrics {
  turns: number; // turns that called a model
  cost: number; // estimated $ across every model call (reply, extractor, triage)
  p50: number; // model reply latency, ms (request to full reply, tools included)
  p95: number;
  latencies: number[]; // last 100 reply latencies, ms
  models: Record<string, number>; // replies per model
  last?: { model: string; latencyMs: number; cost: number };
}
