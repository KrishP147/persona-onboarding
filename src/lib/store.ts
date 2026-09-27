import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import type { Session, SlotKey, Slot } from "./types";
import { SLOT_KEYS } from "./types";

// Dev store: one JSON file per session under .data/. Swap for Upstash on deploy
// (Vercel's filesystem is read-only).
const DIR = path.join(process.cwd(), ".data", "sessions");

function emptySlot(): Slot {
  return { value: null, status: "missing", asks: 0 };
}

export function newSession(): Session {
  const now = Date.now();
  return {
    id: nanoid(12),
    createdAt: now,
    updatedAt: now,
    phase: "intro",
    slots: Object.fromEntries(SLOT_KEYS.map((k) => [k, emptySlot()])) as Record<SlotKey, Slot>,
    callOffers: 0,
    call: { active: false, silenceStrikes: 0 },
    consecutiveAsks: 0,
    voice: "neutral",
    transcript: [],
  };
}

function safeId(id: string) {
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) throw new Error("bad session id");
  return id;
}

export async function loadSession(id: string): Promise<Session | null> {
  try {
    const raw = await fs.readFile(path.join(DIR, `${safeId(id)}.json`), "utf8");
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function saveSession(s: Session): Promise<void> {
  s.updatedAt = Date.now();
  await fs.mkdir(DIR, { recursive: true });
  const file = path.join(DIR, `${safeId(s.id)}.json`);
  // write-then-rename so a crash mid-write never leaves a torn session
  await fs.writeFile(`${file}.tmp`, JSON.stringify(s, null, 2));
  await fs.rename(`${file}.tmp`, file);
}

// Serialize turns per session: rapid double-sends must not race each other.
const locks = new Map<string, Promise<unknown>>();
export async function withSession<T>(id: string, fn: (s: Session) => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const run = prev.then(async () => {
    const s = (await loadSession(id)) ?? { ...newSession(), id };
    const out = await fn(s);
    await saveSession(s);
    return out;
  });
  locks.set(id, run.catch(() => {}));
  return run;
}
