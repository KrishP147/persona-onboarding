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
}

export type MsgKind = "text" | "gmail_link" | "contact_card" | "event" | "link_preview" | "gif";

export interface Msg {
  id: string;
  role: "user" | "agent" | "event";
  channel: Channel;
  text: string;
  ts: number;
  kind?: MsgKind;
  attachments?: Attachment[];
  move?: Move; // which research-backed move produced this agent message (shown in the side panel)
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
  gmailUnread?: number; // small value moment at connect time; tokens are never stored
  gmailVerified?: { email: string; unread?: number; demo?: boolean; inbox?: InboxItem[] }; // set by the oauth callback, consumed by the gmail_connected event
  alerts?: Alert[];
  movesUsed?: string[]; // conversation moves already made (src/lib/moves.ts) // interruptions shown, with outcomes (see src/lib/triage.ts)
  graduatedReason?: string;
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
  | { type: "end_call" }
  | { type: "speak"; text: string }
  | { type: "graduate" }
  | { type: "patience"; ms: number }; // user is doing a task (e.g. gmail sign-in): stretch the next silence window
