import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import type { Session, SlotKey, Slot } from "./types";
import { SLOT_KEYS } from "./types";

export class SessionBusyError extends Error {
  constructor() {
    super("session busy");
  }
}

// Two backends behind one interface:
// - local dev: one JSON file per session under .data/
// - deployed: Upstash Redis over its REST API (serverless has no writable disk and many instances)
interface Backend {
  incrDaily(name: string): Promise<number>;
  incrTotal(name: string): Promise<number>;
  addFloat(name: string, amount: number): Promise<number>;
  getFloat(name: string): Promise<number>;
  get(id: string): Promise<string | null>;
  set(id: string, value: string): Promise<void>;
  lock(id: string): Promise<() => Promise<void>>;
}

const TTL_SECONDS = 60 * 60 * 24 * 7;

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

// ---- file backend ----
const DIR = path.join(process.cwd(), ".data", "sessions");
const memLocks = new Map<string, Promise<unknown>>();

const memCounters = new Map<string, number>();

const fileBackend: Backend = {
  async addFloat(name, amount) {
    const n = (memCounters.get(`f:${name}`) ?? 0) + amount;
    memCounters.set(`f:${name}`, n);
    return n;
  },
  async getFloat(name) {
    return memCounters.get(`f:${name}`) ?? 0;
  },
  async incrTotal(name) {
    const n = (memCounters.get(`total:${name}`) ?? 0) + 1;
    memCounters.set(`total:${name}`, n);
    return n;
  },
  async incrDaily(name) {
    const key = `${name}:${new Date().toISOString().slice(0, 10)}`;
    const n = (memCounters.get(key) ?? 0) + 1;
    memCounters.set(key, n);
    return n;
  },
  async get(id) {
    try {
      return await fs.readFile(path.join(DIR, `${id}.json`), "utf8");
    } catch {
      return null;
    }
  },
  async set(id, value) {
    await fs.mkdir(DIR, { recursive: true });
    const file = path.join(DIR, `${id}.json`);
    // write-then-rename so a crash mid-write never leaves a torn session
    await fs.writeFile(`${file}.tmp`, value);
    await fs.rename(`${file}.tmp`, file);
  },
  async lock(id) {
    const prev = memLocks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    memLocks.set(id, prev.then(() => mine));
    await prev;
    return async () => release();
  },
};

// ---- upstash backend ----
function upstash(url: string, token: string): Backend {
  async function cmd<T>(...args: (string | number)[]): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    return ((await res.json()) as { result: T }).result;
  }
  return {
    incrTotal: (name) => cmd<number>("INCR", `count:${name}:total`),
    addFloat: async (name, amount) => Number(await cmd<string>("INCRBYFLOAT", `float:${name}`, amount)),
    getFloat: async (name) => Number((await cmd<string | null>("GET", `float:${name}`)) ?? 0),
    async incrDaily(name) {
      const key = `count:${name}:${new Date().toISOString().slice(0, 10)}`;
      const n = await cmd<number>("INCR", key);
      if (n === 1) await cmd("EXPIRE", key, 60 * 60 * 48);
      return n;
    },
    get: (id) => cmd<string | null>("GET", `session:${id}`),
    async set(id, value) {
      await cmd("SET", `session:${id}`, value, "EX", TTL_SECONDS);
    },
    async lock(id) {
      // Per-session mutex across serverless instances. Expires on its own if a request dies.
      const key = `lock:${id}`;
      const owner = nanoid(8);
      // Long enough for the slowest turn (model chain + tools); a waiting request polls up to ~30s.
      for (let i = 0; i < 200; i++) {
        if ((await cmd<string | null>("SET", key, owner, "NX", "PX", 45000)) === "OK") {
          return async () => {
            if ((await cmd<string | null>("GET", key)) === owner) await cmd("DEL", key);
          };
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      throw new SessionBusyError();
    },
  };
}

const backend: Backend =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? upstash(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN)
    : fileBackend;

// Shared daily counter (across serverless instances when Upstash is configured).
export const incrDaily = (name: string) => backend.incrDaily(name);
export const incrTotal = (name: string) => backend.incrTotal(name);
export const addFloat = (name: string, amount: number) => backend.addFloat(name, amount);
export const getFloat = (name: string) => backend.getFloat(name);

export async function loadSession(id: string): Promise<Session | null> {
  const raw = await backend.get(safeId(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function saveSession(s: Session): Promise<void> {
  s.updatedAt = Date.now();
  await backend.set(safeId(s.id), JSON.stringify(s));
}

// Serialize turns per session: rapid double-sends and overlapping events must not race.
export async function withSession<T>(id: string, fn: (s: Session) => Promise<T>): Promise<T> {
  const release = await backend.lock(safeId(id));
  try {
    const s = (await loadSession(id)) ?? { ...newSession(), id };
    const out = await fn(s);
    await saveSession(s);
    return out;
  } finally {
    await release();
  }
}
