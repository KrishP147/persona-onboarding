import type { Session, VoiceStyle } from "./types";

// One Cartesia voice per style, fixed, so an agent never changes voice mid-call or between calls.
export const CARTESIA_VOICES: Record<VoiceStyle, string> = {
  feminine: "f786b574-daa5-4673-aa0c-cbe3e8534c02", // Katie: young adult, conversational
  masculine: "30894953-bcce-41fe-892c-15ce19c843ff", // Parker: casual, supportive
  neutral: "83ae58a1-7e97-4b94-b03f-e4cc0a10d8af", // Eden: clean, easy to follow
};

export const CARTESIA_VERSION = "2026-08-14";
export const CARTESIA_MODEL = process.env.CARTESIA_MODEL ?? "sonic-3.6";

// Backup voices (Deepgram Aura 2), one per style, used when Cartesia is out of credits.
export const AURA_VOICES: Record<VoiceStyle, string> = {
  feminine: "aura-2-thalia-en", // clear, energetic, friendly
  masculine: "aura-2-apollo-en", // casual, comfortable
  neutral: "aura-2-andromeda-en", // casual, expressive
};

// ElevenLabs (used first when ELEVENLABS_API_KEY is set): premade voices, overridable by env.
export const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_flash_v2_5";
export const ELEVEN_VOICES: Record<VoiceStyle, string> = {
  feminine: process.env.ELEVENLABS_VOICE_FEMININE ?? "EXAVITQu4vr4xnSDxMaL", // sarah
  masculine: process.env.ELEVENLABS_VOICE_MASCULINE ?? "TX3LPaxmHKxFdv7VOQHJ", // liam
  neutral: process.env.ELEVENLABS_VOICE_NEUTRAL ?? "SAz9YHcvj6GT2YYXdXww", // river
};

// Deepgram nova-3 keyterm prompting: names it must not mishear (sent with the stt token, appended as keyterm= params).
export function keyterms(s: Session): string[] {
  const names = [s.slots.agentName.value, s.slots.userName.value].filter((v): v is string => !!v?.trim());
  return [...new Set([...names, "Persona", "Gmail"].map((k) => k.trim().slice(0, 40)))].slice(0, 10);
}
