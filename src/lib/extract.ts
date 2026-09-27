// Second pair of ears: after each user message, a small structured pass reads what they just
// said for the four things onboarding needs (and any "no"). It runs alongside the reply, so it
// adds no wait, and it means a name or a need is saved even when the talking model forgets to.
import { json, provider } from "./llm";
import type { Session } from "./types";

export interface Extracted {
  agentName: string | null; // what the user wants to call the assistant
  userName: string | null; // what the user wants to be called
  helpNeed: string | null; // something concrete they want help with, short
  declined: ("agentName" | "userName" | "gmail" | "helpNeed")[]; // things they clearly said no to
}

const EMPTY: Extracted = { agentName: null, userName: null, helpNeed: null, declined: [] };

export async function extract(s: Session, userText: string): Promise<Extracted> {
  if (!provider || !userText.trim()) return EMPTY;
  const lastAgent = [...s.transcript].reverse().find((m) => m.role === "agent" && m.kind !== "event" && m.kind !== "contact_card")?.text ?? "";
  try {
    return await json<Extracted>({
      tag: "extract",
      fast: true,
      system:
        "You read one message from a user who is setting up a new personal assistant, and pull out only what they clearly stated. Never guess. " +
        "agentName = a name they give the ASSISTANT (e.g. answering \"what do you want to call me?\", or \"call yourself Max\", \"actually call you Luna\"). " +
        "userName = what the USER wants to be called (\"i'm Priya\", \"call me CJ\", \"actually it's Chris\"). A correction replaces the old one. " +
        "helpNeed = a concrete thing they want help with, as a short phrase (\"rescheduling a dentist appointment\"); null for vague answers like \"stuff\". " +
        "declined = setup items they clearly refused (\"no calls\" is not one of these; \"i won't give my name\" is userName; \"skip the gmail thing\" / \"not connecting my email\" is gmail). " +
        "Use null / [] when absent.",
      user: `The assistant's last message: "${lastAgent.slice(0, 300)}"\nThe user's message: "${userText.slice(0, 600)}"\nWhat the assistant already knows: assistant name=${s.slots.agentName.value ?? "none"}, user name=${s.slots.userName.value ?? "none"}, need=${s.slots.helpNeed.value ?? "none"}.`,
      schema: {
        type: "object",
        properties: {
          agentName: { type: ["string", "null"] },
          userName: { type: ["string", "null"] },
          helpNeed: { type: ["string", "null"] },
          declined: { type: "array", items: { type: "string", enum: ["agentName", "userName", "gmail", "helpNeed"] } },
        },
        required: ["agentName", "userName", "helpNeed", "declined"],
        additionalProperties: false,
      },
    });
  } catch {
    return EMPTY; // best effort: the talking model's own tools still work
  }
}

const clean = (v: string | null, max: number) => (v ? v.trim().replace(/^["']|["'.!]$/g, "").slice(0, max) : null);

// Apply after the reply: fill what's missing, take explicit corrections, record clear refusals.
export function applyExtracted(s: Session, e: Extracted, setName: (value: string) => Promise<void>): Promise<void> | void {
  const now = Date.now();
  const userName = clean(e.userName, 40);
  if (userName && userName.toLowerCase() !== s.slots.userName.value?.toLowerCase()) {
    s.slots.userName = { ...s.slots.userName, value: userName, status: "filled", updatedAt: now };
    if (s.lastAskedSlot === "userName") s.lastAskedSlot = undefined;
  }
  const need = clean(e.helpNeed, 120);
  if (need && s.slots.helpNeed.status !== "filled") {
    s.slots.helpNeed = { ...s.slots.helpNeed, value: need, status: "filled", updatedAt: now };
  }
  for (const k of e.declined ?? []) {
    if (s.slots[k] && s.slots[k].status === "missing") s.slots[k].status = "declined";
  }
  const agentName = clean(e.agentName, 30);
  if (agentName && agentName.toLowerCase() !== s.slots.agentName.value?.toLowerCase()) return setName(agentName);
}
