import type { Ctx } from "./engine";
import { computeDirective } from "./policy";
import { normQuestion } from "./engine/guards";

// Keyless stand-in so the UI and harness plumbing work before API keys exist.
// Deliberately dumb: real behavior comes from the LLM path.
type RunTool = (ctx: Ctx, name: string, input: Record<string, unknown>) => Promise<string>;

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

export async function mockReply(ctx: Ctx, runTool: RunTool): Promise<string> {
  const { s, channel } = ctx;
  const last = [...s.transcript].reverse().find((m) => m.role === "user");
  const text = last?.text.toLowerCase() ?? "";

  const agentName = text.match(/(?:call you|name you)\s+([a-z]+)/)?.[1]; // "you're bad" is a reaction, not a name
  const userName = text.match(/(?:call me|i'm|i am|my name is|name's)\s+([a-z]+)/)?.[1];
  const need = text.match(/(?:help (?:me )?with|i need|i want)\s+(.+)/)?.[1];

  if (agentName) await runTool(ctx, "set_slot", { slot: "agentName", value: cap(agentName) });
  if (userName && userName !== "back") await runTool(ctx, "set_slot", { slot: "userName", value: cap(userName) });
  if (need) await runTool(ctx, "set_slot", { slot: "helpNeed", value: need });
  if (/^call me$|sure call|yes call|^call$/.test(text.trim())) {
    await runTool(ctx, "start_call", {});
    return "calling you now.";
  }
  if (/connect gmail/.test(text)) {
    await runTool(ctx, "send_gmail_link", {});
    return "here's the link, takes 10 seconds.";
  }

  const d = computeDirective(s, channel);
  if (!last) return "hey! i'm your new personal assistant.\n\ni can call places for you, handle email, shop, book stuff.\n\nwhat do you want to call me?";
  if (d.canGraduate) {
    await runTool(ctx, "graduate", { reason: "mock: need known" });
    return `on it. (mock mode: add ANTHROPIC_API_KEY for real replies)`;
  }
  // Like a real model reading the thread: it doesn't re-ask anything already asked above (by it or by code).
  const askedAbove = (q: string) => s.transcript.some((m) => m.role === "agent" && m.text.split(/(?<=[.!?])\s+/).some((x) => x.trim().endsWith("?") && normQuestion(x) === normQuestion(q)));
  const offer = "want a quick call so i can get set up around you?";
  if (d.offerCall && !askedAbove(offer)) {
    await runTool(ctx, "offer_call", {});
    return `love it. ${offer}`;
  }
  const q: Record<string, string> = {
    agentName: "what do you want to call me?",
    userName: "what should i call you?",
    helpNeed: "what's one thing you'd love off your plate?",
    gmail: "want to connect gmail so i can help with email?",
  };
  // Like a sane model: a question it already asked isn't asked again word for word.
  const ask = d.nextSlot && d.mayAsk ? q[d.nextSlot] : null;
  return ask && !askedAbove(ask) ? ask : "got it. (mock mode)";
}
