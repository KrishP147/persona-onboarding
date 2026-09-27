// Live web access through Browserbase (search: titles + links, fetch: one page as markdown).
// Browserbase has no spend cap of its own, so every call is counted in Redis and capped here.
import { incrDaily, incrTotal } from "./store";

const KEY = process.env.BROWSERBASE_API_KEY || "";
const API = "https://api.browserbase.com/v1";
const DAILY = Number(process.env.WEB_DAILY_CALLS ?? 20);
const TOTAL = Number(process.env.WEB_TOTAL_CALLS ?? 100);
const PAGE_CHARS = 4000;

export const webEnabled = () => KEY !== "";

// Search and fetch share one budget (each is one paid request).
async function underCap(): Promise<boolean> {
  if ((await incrDaily("web").catch(() => Infinity)) > DAILY) return false;
  if ((await incrTotal("web").catch(() => Infinity)) > TOTAL) return false;
  return true;
}

async function bb<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-BB-API-Key": KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`browserbase ${path} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return (await res.json()) as T;
}

type SearchRes = { results: { url: string; title: string; publishedDate?: string }[] };

export async function webSearch(query: string, count: number): Promise<string> {
  if (!webEnabled()) return "error: you can't search the web right now. say so plainly and help from what you know";
  if (!(await underCap())) return "error: web lookups are used up for today. tell them honestly and help from what you know (say it's from memory)";
  try {
    const r = await bb<SearchRes>("/search", { query: query.slice(0, 200), numResults: count });
    if (!r.results.length) return `no results for "${query}".`;
    return (
      r.results.map((x, i) => `${i + 1}. ${x.title} | ${x.url}${x.publishedDate ? ` | ${x.publishedDate.slice(0, 10)}` : ""}`).join("\n") +
      "\n(titles and links only. to get the actual facts, call read_page on the best link.)"
    );
  } catch (e) {
    console.error(String((e as Error).message ?? e).slice(0, 200));
    return "error: the search didn't go through. tell them honestly; don't make up results";
  }
}

export async function readPage(url: string): Promise<string> {
  if (!webEnabled()) return "error: you can't open web pages right now. say so plainly";
  if (!/^https?:\/\//i.test(url)) return "error: that's not a web link";
  if (!(await underCap())) return "error: web lookups are used up for today. tell them honestly; don't make up what the page says";
  try {
    const r = await bb<{ statusCode: number; content: unknown }>("/fetch", { url, format: "markdown", allowRedirects: true });
    const text = typeof r.content === "string" ? r.content : JSON.stringify(r.content);
    if (r.statusCode >= 400 || !text.trim()) return `error: that page didn't load (${r.statusCode}). try another link or tell them`;
    const clean = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\n{3,}/g, "\n\n").trim();
    return clean.length > PAGE_CHARS ? `${clean.slice(0, PAGE_CHARS)}\n...(cut)` : clean;
  } catch (e) {
    console.error(String((e as Error).message ?? e).slice(0, 200));
    return "error: that page didn't load. try another link or tell them honestly";
  }
}
