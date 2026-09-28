import type { CSSProperties, FC, ReactNode } from "react";
import type { Msg } from "@/lib/types";

export type SkinId = "iphone" | "pixel" | "galaxy";
export const SKIN_IDS: SkinId[] = ["iphone", "pixel", "galaxy"];

// where a bubble sits in a run from one sender
export type Pos = "single" | "first" | "middle" | "last";
// read receipts for your own texts
export type Receipt = "sent" | "delivered" | "seen";

export interface BubbleProps {
  m: Msg;
  mine: boolean;
  pos: Pos;
  reaction?: string;
  receipt?: Receipt;
  receiptAt?: number;
  highlight?: string | null; // framework color when its "why" card is hovered/active
  showTime?: boolean; // galaxy: time beside the last bubble of a run
}

export interface HeaderProps {
  name: string;
  saved: boolean;
  onCall: () => void;
  callDisabled: boolean;
  onMenu: () => void; // phones: the menu (reasoning, restart, picker)
}

export interface ComposerProps {
  draft: string;
  setDraft: (v: string) => void;
  onSubmit: () => void;
  onAttach: () => void;
  canSend: boolean;
  recording: { startedAt: number } | null;
  transcribing: boolean;
  onMic: () => void;
  hint?: string; // stuck-hint placeholder example; undefined means the skin's own default
}

export interface CallProps {
  saved: boolean;
  said: string;
  name: string;
  status: string;
  speaking: boolean;
  listening: boolean;
  heard: string;
  startedAt: number | null;
  onAccept: () => void;
  onDecline: () => void;
  onHangup: () => void;
  muted?: boolean;
  onMute?: () => void;
  onHide?: () => void;
  unread?: number;
}

// colors for in-thread rich cards (what i know, send confirm), in the phone's own palette
export interface RichTheme {
  ink: string;
  mute: string;
  accent: string;
  onAccent: string; // text on a filled accent button
  line: string; // hairlines between rows
  danger: string;
  track: string; // empty part of a progress bar
}

export interface RichCardProps {
  title: string;
  children: ReactNode;
  pos?: Pos;
}

export interface Skin {
  id: SkinId;
  label: string;
  // the phone screen's own ground, ink and type (never the persona page tokens)
  screen: { className: string; style?: CSSProperties };
  threadClass: string; // scroll area
  sheet: "ios" | "m3";
  why: { ink: string; mute: string; surface: string; line: string }; // colors for the in-phone why affordance + sheet
  StatusBar: FC<{ dark?: boolean }>;
  Header: FC<HeaderProps>;
  DateStamp: FC<{ ts: number; first: boolean }>;
  Bubble: FC<BubbleProps>;
  Typing: FC;
  Composer: FC<ComposerProps>;
  EventRow: FC<{ text: string }>;
  GmailCard: FC<{ connected: boolean; onConnect: () => void; pos: Pos }>;
  LinkPreview: FC<{ url: string; pos: Pos }>;
  ContactCard: FC<{ name: string; saved: boolean; onSave: () => void; pos: Pos }>;
  Media: FC<{ src: string }>;
  UnknownAvatar: FC<{ size: number }>;
  Banner: FC<{ tone: "info" | "error"; children: ReactNode }>;
  UnknownNotice?: FC; // iphone: "not in your contacts" line over the composer
  CallScreen: FC<CallProps>;
  RichCard: FC<RichCardProps>; // skin-native shell for rich cards in the thread
  rich: RichTheme;
}
