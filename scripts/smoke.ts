// Keyless smoke test of the engine's safety nets (mock mode). Run: pnpm tsx scripts/smoke.ts
import { loadSession, newSession, saveSession, withSession } from "../src/lib/store";
import { handleEvent, handleUserMessage } from "../src/lib/engine";
import { readMood } from "../src/lib/mood";
import type { TurnResult } from "../src/lib/types";

delete process.env.ANTHROPIC_API_KEY;
let fails = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) fails++;
};
const said = (r: TurnResult) => r.newMessages.filter((m) => m.role === "agent").map((m) => m.text).join(" | ");

async function main() {
  const s = newSession();
  await handleEvent(s, { type: "open" });
  await handleUserMessage(s, "text", "ill call you julia");
  await handleUserMessage(s, "text", "sure call me");
  await handleEvent(s, { type: "call_started" });
  check("call active", s.call.active && s.phase === "on_call");

  // silence x3 → goodbye + end_call
  await handleEvent(s, { type: "silence" });
  await handleEvent(s, { type: "silence" });
  const r3 = await handleEvent(s, { type: "silence" });
  check("3rd silence ends call", r3.actions.some((a) => a.type === "end_call"));
  const spoken = r3.actions.find((a) => a.type === "speak");
  check("says goodbye before hanging up", !!spoken && /bye/i.test((spoken as { text: string }).text), said(r3));

  const end = await handleEvent(s, { type: "call_ended", reason: "agent_ended" });
  check("text follow-up after call", end.newMessages.some((m) => m.role === "agent" && m.channel === "text"), said(end));
  check("phase post_call", s.phase === "post_call");

  const dup = await handleEvent(s, { type: "call_ended", reason: "user_hangup" });
  check("duplicate hangup is a no-op", dup.newMessages.length === 0);

  // hangup mid-call → recap text
  await handleEvent(s, { type: "call_started" });
  const hang = await handleEvent(s, { type: "call_ended", reason: "user_hangup" });
  check("recap after user hangup", hang.newMessages.some((m) => m.role === "agent" && m.channel === "text"), said(hang));

  // rename mid-call keeps voice until next call
  const t = newSession();
  t.voice = "feminine";
  t.call.active = true;
  t.pendingVoice = "masculine";
  await handleEvent(t, { type: "call_ended", reason: "user_hangup" });
  check("pending voice applied after call", (t.voice as string) === "masculine" && !t.pendingVoice);

  // refresh: open on existing session doesn't re-greet
  const again = await handleEvent(s, { type: "open" });
  check("no duplicate greeting on reopen", again.newMessages.length === 0);

  // gmail: unverified connect is ignored, verified connect fills the slot once
  const g = newSession();
  const fake = await handleEvent(g, { type: "gmail_connected", email: "attacker@evil.com" });
  check("unverified gmail event ignored", fake.newMessages.length === 0 && g.slots.gmail.status === "missing");
  g.gmailVerified = { email: "me@gmail.com", unread: 12 };
  const ok = await handleEvent(g, { type: "gmail_connected" });
  check("verified gmail fills slot", g.slots.gmail.status === "filled" && g.gmailEmail === "me@gmail.com");
  check("gmail value moment mentions unread", said(ok).includes("12"), said(ok));
  const cancel = await handleEvent(newSession(), { type: "gmail_failed", error: "access_denied" });
  check("oauth cancel treated as a choice", /no worries/.test(said(cancel)), said(cancel));

  // post-call chip offers a call back when something is still missing
  check("call me back chip after call", end.chips.includes("Call me back"), end.chips.join("|"));

  // concurrent turns on one session are serialized, nothing lost
  const c = newSession();
  await saveSession(c);
  await Promise.all(["one", "two", "three"].map((t) => withSession(c.id, (x) => handleUserMessage(x, "text", t))));
  const after = await loadSession(c.id);
  const userTexts = after?.transcript.filter((m) => m.role === "user").map((m) => m.text) ?? [];
  check("parallel sends all persisted", ["one", "two", "three"].every((t) => userTexts.includes(t)), userTexts.join(","));

  // mood
  const m = (text: string) => readMood([{ id: "x", role: "user", channel: "text", text, ts: 0 }]).mood;
  check("mood rushed", m("just skip this pls") === "rushed");
  check("mood resistant", m("nah not telling you that") === "resistant");
  check("mood confused", m("asdkjh qwrtp") === "confused");
  check("mood curious", m("can you facetime?") === "curious");

  const conf = (text: string) => readMood([{ id: "x", role: "user", channel: "text", text, ts: 0 }]);
  check("single emoji doesn't flip mood", conf("sure 🙂").mood === "cooperative");
  check("acronym isn't shouting", conf("OK that's HUGE").mood === "cooperative");
  check("lone ? reads confused", conf("?").mood === "confused");
  check("weak signal stays low confidence", conf("nah").confidence === "low");
  check("stretching raises intensity", conf("noooo").intensity === "high");

  console.log(fails ? `\n${fails} failed` : "\nall passed");
  process.exit(fails ? 1 : 0);
}
main();
