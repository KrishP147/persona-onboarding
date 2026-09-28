// Keyless smoke test of the engine's safety nets (mock mode). Run: pnpm tsx scripts/smoke.ts
import { loadSession, newSession, saveSession, withSession } from "../src/lib/store";
import { cleanModelText, handleEvent, handleUserMessage, nowLine, parseTypedEmail } from "../src/lib/engine";
import { readMood } from "../src/lib/mood";
import { DEMO_INBOX, scoreItem } from "../src/lib/triage";
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

  // silence: one check-in (no hangup), then a spoken heads-up + end_call
  const r1 = await handleEvent(s, { type: "silence" });
  check("1st silence only checks in", !r1.actions.some((a) => a.type === "end_call") && r1.actions.some((a) => a.type === "patience"), said(r1));
  const r3 = await handleEvent(s, { type: "silence" });
  check("2nd silence warns and hangs up", r3.actions.some((a) => a.type === "end_call") && /hang up/i.test(said(r3)), said(r3));
  const spoken = r3.actions.find((a) => a.type === "speak");
  check("says goodbye before hanging up", !!spoken && /bye|talk soon|text you/i.test((spoken as { text: string }).text), said(r3));

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
  g.gmailVerified = { email: "me@gmail.com", unread: 12, inbox: DEMO_INBOX };
  const ok = await handleEvent(g, { type: "gmail_connected" });
  check("verified gmail fills slot", g.slots.gmail.status === "filled" && g.gmailEmail === "me@gmail.com");
  check("gmail raises the one item that can't wait", said(ok).toLowerCase().includes("interview"), said(ok));
  check("interruption logged as pending", g.alerts?.length === 1 && g.alerts[0].category === "person" && g.alerts[0].outcome === "pending");
  await handleUserMessage(g, "text", "yes please draft it");
  check("acting on it is recorded", g.alerts?.[0].outcome === "acted");

  // gifs: laughter gets a gif, but never early and never twice in a row
  const gs = newSession();
  await handleEvent(gs, { type: "open" });
  const early = await handleUserMessage(gs, "text", "haha");
  check("no gif in the first few messages", !early.newMessages.some((m) => m.kind === "gif"));
  for (let i = 0; i < 3; i++) {
    gs.transcript.push({ id: `upad${i}`, role: "user", channel: "text", text: "cool", ts: Date.now() });
    gs.transcript.push({ id: `pad${i}`, role: "agent", channel: "text", text: "sure thing.", ts: Date.now() });
  }
  const laugh = await handleUserMessage(gs, "text", "lol 😂😂");
  check("laughter gets a gif", laugh.newMessages.some((m) => m.kind === "gif"), said(laugh));
  const twice = await handleUserMessage(gs, "text", "haha");
  check("no two gifs close together", !twice.newMessages.some((m) => m.kind === "gif"));

  // name question answered with their own name: it's theirs, not the assistant's
  const own = newSession();
  await handleEvent(own, { type: "open" });
  await handleUserMessage(own, "text", "i'm dana");
  check("\"i'm dana\" is the user's name", own.slots.userName.value === "Dana" && own.slots.agentName.status === "missing");
  const filler = newSession();
  await handleEvent(filler, { type: "open" });
  await handleUserMessage(filler, "text", "lol");
  check("\"lol\" is not a name for the assistant", filler.slots.agentName.status === "missing");
  await handleUserMessage(filler, "text", "can you write an email for me");
  const cmd = await handleUserMessage(filler, "text", "send");
  const nocalls = newSession();
  await handleEvent(nocalls, { type: "open" });
  await handleUserMessage(nocalls, "text", "hey im dana. no calls lol i hate phone calls. need cheap flights");
  const named2 = await handleUserMessage(nocalls, "text", "finder");
  const offered = said(named2).toLowerCase().includes("call") && /\?/.test(said(named2));
  check("'no calls' said upfront: never offers or rings", nocalls.callDeclinedAt !== undefined && !offered && !named2.actions.some((a) => a.type === "start_call"), said(named2));
  const nameNotRing = newSession();
  await handleEvent(nameNotRing, { type: "open" });
  await handleUserMessage(nameNotRing, "text", "julia");
  const cm = await handleUserMessage(nameNotRing, "text", "you can call me krish");
  check("'you can call me krish' is a name, not a ring", !cm.actions.some((a) => a.type === "start_call"), said(cm));
  const rude = newSession();
  await handleEvent(rude, { type: "open" });
  const ugly = await handleUserMessage(rude, "text", "ugly");
  check("an insult name gets a laugh, not a cheerful miss", /ouch/i.test(said(ugly)), said(ugly));
  const yesBut = await handleUserMessage(rude, "text", "yes but u aren't doing anything about my insults");
  check("'yes but...' to a call offer doesn't ring", !yesBut.actions.some((a) => a.type === "start_call"), said(yesBut));
  const didnt = await handleUserMessage(rude, "text", "i didn't want u to call me idiot");
  check("'didn't want u to call me' is a refusal, not a ring", !didnt.actions.some((a) => a.type === "start_call") && rude.callDeclinedAt !== undefined, said(didnt));
  const terms = newSession();
  await handleEvent(terms, { type: "open" });
  const tr = await handleUserMessage(terms, "text", "can you text me the terms link again?");
  check("terms link is the legal page, not gmail", tr.newMessages.some((m) => m.kind === "link_preview" && m.text.includes("legal")) && !tr.newMessages.some((m) => m.kind === "gmail_link"), said(tr));
  const now = nowLine("America/New_York", new Date("2026-09-28T02:30:00Z"));
  check("agent knows the real date, in their zone", now.includes("September 27, 2026") && now.includes("America/New_York") && now.includes("September 28, 2026"), now);
  const leak = cleanModelText('The system is being strict about the most recent message context. The message "got it, krish." is already sent.');
  check("meta talk about its own setup never goes out", leak === "", leak);
  const keep = cleanModelText("got it, krish. i'll keep an eye out. i have two time slots open tuesday.");
  check("normal replies survive the leak filter", keep.includes("keep an eye out") && keep.includes("time slots"), keep);
  const typed = parseTypedEmail("here's a draft:\n\nto: a@b.com\nsubject: late\n\nhi,\n\nrunning 10 min late.\n\nbest,\nkrish\n\nlet me know if you'd like any changes, or if you'd like me to send it.");
  check("typed email parsed, assistant chatter left out", typed?.to === "a@b.com" && typed.subject === "late" && typed.body === "hi,\n\nrunning 10 min late.\n\nbest,\nkrish", JSON.stringify(typed));
  check("a later \"send\" is not a name", !/send/i.test(filler.slots.agentName.value ?? "") && !cmd.newMessages.some((m) => m.kind === "contact_card"), said(cmd));

  // "no, text is fine" after a call offer means no more calls
  const nocall = newSession();
  await handleEvent(nocall, { type: "open" });
  await handleUserMessage(nocall, "text", "Julia");
  await handleUserMessage(nocall, "text", "no, text is fine");
  check("a spoken no to a call is remembered", nocall.callOffers >= 2 && nocall.callDeclinedAt !== undefined);

  // a call after graduating doesn't undo it
  const grad = newSession();
  await handleEvent(grad, { type: "open" });
  await handleUserMessage(grad, "text", "skip setup");
  grad.phase = "graduated";
  await handleEvent(grad, { type: "call_started" });
  await handleEvent(grad, { type: "call_ended", reason: "user_hangup" });
  check("calling after graduating keeps you graduated", grad.phase === "graduated");

  // triage rules: bulk mail never interrupts, payment trouble always does
  check("promo is not an interrupt", scoreItem(DEMO_INBOX[1]).category === null);
  check("overdue bill is a high-confidence money interrupt", scoreItem({ ...DEMO_INBOX[4], subject: "Payment failed: action needed", snippet: "" }).confidence === "high");
  const g2 = newSession();
  g2.alerts = [{ id: "x", category: "money", reason: "", subject: "", from: "", shownAt: Date.now(), outcome: "acted" }];
  g2.gmailVerified = { email: "me@gmail.com", inbox: DEMO_INBOX };
  const quiet = await handleEvent(g2, { type: "gmail_connected" });
  check("budget spent: no second interruption", g2.alerts.length === 1 && !said(quiet).toLowerCase().includes("interview"), said(quiet));
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

  // left on read over text: default name + call offer, then one light no-question line, then quiet
  const ago = (x: typeof s, ms: number) => x.transcript.forEach((m) => (m.ts -= ms));
  const idle = newSession();
  await handleEvent(idle, { type: "open" });
  const tooSoon = await handleEvent(idle, { type: "text_idle" });
  check("no double text seconds after its own text", tooSoon.newMessages.length === 0, said(tooSoon));
  ago(idle, 60000);
  const n1 = await handleEvent(idle, { type: "text_idle" });
  check("skipped name: goes by persona, says so", idle.slots.agentName.value === "Persona" && /skipped my name/.test(said(n1)) && /rename/.test(said(n1)), said(n1));
  check("skipped name double text offers the call with a reason", /call/.test(said(n1)) && /easier|faster/.test(said(n1)) && idle.callOffers === 1, said(n1));
  ago(idle, 200000);
  const n2 = await handleEvent(idle, { type: "text_idle" });
  check("second nudge asks nothing", n2.newMessages.length === 1 && !said(n2).includes("?"), said(n2));
  ago(idle, 200000);
  const n3 = await handleEvent(idle, { type: "text_idle" });
  check("then quiet until they're back", n3.newMessages.length === 0, said(n3));
  const back = await handleUserMessage(idle, "text", "sure call me");
  check("yes to the nudge's call offer rings", back.actions.some((a) => a.type === "start_call"), said(back));

  // unanswered call offer: take the pressure off
  const offer = newSession();
  await handleEvent(offer, { type: "open" });
  await handleUserMessage(offer, "text", "nova");
  ago(offer, 60000);
  const o1 = await handleEvent(offer, { type: "text_idle" });
  check("unanswered call offer: no pressure, keep texting", /no pressure/.test(said(o1)) && offer.slots.agentName.value === "Nova", said(o1));
  const onCallIdle = newSession();
  onCallIdle.call.active = true;
  check("no text nudges during a call", (await handleEvent(onCallIdle, { type: "text_idle" })).newMessages.length === 0);

  // answering something else instead of a name: reply to them, then the persona double text
  const skip = newSession();
  await handleEvent(skip, { type: "open" });
  const sk = await handleUserMessage(skip, "text", "i need help with my inbox honestly");
  const last = sk.newMessages.at(-1);
  check("skipped name in a reply: persona default as the last bubble", skip.slots.agentName.value === "Persona" && last?.move?.id === "default-name", said(sk));
  const shortHi = newSession();
  await handleEvent(shortHi, { type: "open" });
  await handleUserMessage(shortHi, "text", "hi");
  check("a bare \"hi\" gets another chance at naming", shortHi.slots.agentName.status === "missing");
  await handleUserMessage(shortHi, "text", "call you luna");
  check("real name after a default-free hi still lands", shortHi.slots.agentName.value === "Luna", shortHi.slots.agentName.value ?? "");
  const renamed = await handleUserMessage(skip, "text", "actually call you max");
  check("default name can be renamed later", skip.slots.agentName.value === "Max", `${skip.slots.agentName.value} | ${said(renamed)}`);

  console.log(fails ? `\n${fails} failed` : "\nall passed");
  process.exit(fails ? 1 : 0);
}
main();
