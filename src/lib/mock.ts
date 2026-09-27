import type { Ctx } from "./engine";
import { computeDirective } from "./policy";

// Keyless stand-in so the UI and harness plumbing work before API keys exist.
// Deliberately dumb: real behavior comes from the LLM path.
type RunTool = (ctx: Ctx, name: string, input: Record<string, unknown>) => Promise<string>;

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

export async function mockReply(ctx: Ctx, runTool: RunTool): Promise<string> {
  const { s, channel } = ctx;
  const last = [...s.transcript].reverse().find((m) => m.role === "user");
  const text = last?.text.toLowerCase() ?? "";

  const agentName = text.match(/(?:call you|name you|you(?:'re| are))\s+([a-z]+)/)?.[1];
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
  if (d.offerCall) {
    await runTool(ctx, "offer_call", {});
    return "love it. want a quick call so i can get set up around you?";
  }
  const q: Record<string, string> = {
    agentName: "what do you want to call me?",
    userName: "what should i call you?",
    helpNeed: "what's one thing you'd love off your plate?",
    gmail: "want to connect gmail so i can help with email?",
  };
  return d.nextSlot && d.mayAsk ? q[d.nextSlot] : "got it. (mock mode)";
}
