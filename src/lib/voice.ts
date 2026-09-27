import type { VoiceStyle } from "./types";

// One Cartesia voice per style, fixed, so an agent never changes voice mid-call or between calls.
export const CARTESIA_VOICES: Record<VoiceStyle, string> = {
  feminine: "f786b574-daa5-4673-aa0c-cbe3e8534c02", // Katie: young adult, conversational
  masculine: "30894953-bcce-41fe-892c-15ce19c843ff", // Parker: casual, supportive
  neutral: "83ae58a1-7e97-4b94-b03f-e4cc0a10d8af", // Eden: clean, easy to follow
};

export const CARTESIA_VERSION = "2026-08-14";
export const CARTESIA_MODEL = process.env.CARTESIA_MODEL ?? "sonic-3.6";
