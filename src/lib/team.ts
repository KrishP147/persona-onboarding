// Easter egg: the persona team. If the user's name is one of theirs, the agent asks if it's really them.
// Bios are their public X profiles (as of 2026-09-28), so a yes gets a little recognition, then it carries on.
import type { Session } from "./types";

export interface TeamMember {
  full: string;
  handle: string;
  asks: string; // "is this THE zach? <asks>?"
  bio: string;
}

export const TEAM: Record<string, TeamMember> = {
  zach: { full: "Zach Yadegari", handle: "@zach_yadegari", asks: "founder of persona", bio: "19, Forbes 30 under 30, built Cal AI (acquired), now building Persona" },
  tanay: { full: "Tanay Singh", handle: "@tanaysingh789", asks: "cto at persona", bio: "17, CTO at Persona; previously SWE at Two Dots Finance (YC W22), founding engineer at Scope (YC P26), f.inc offseason, 2x hackathon winner" },
  julia: { full: "Julia Li", handle: "@juliali", asks: "from talent at persona", bio: "talent at Persona" },
  aarav: { full: "Aarav Garg", handle: "@aaravgarg", asks: "one of the people building persona", bio: "20, building Persona; previously built Omi and Humanoid Purdue" },
  mac: { full: "Mac Jablonski", handle: "@mac_jablonski", asks: "building the next ai interface at persona", bio: "building the next AI interface at Persona; into creation, innovation, peak performance, AI and network states" },
  jason: { full: "Jason Suhari", handle: "@jsonphile", asks: "building persona, the one named after a file extension", bio: "building Persona; his parents named him after a file extension; 11x hackathon winner; CS at NUS; f.inc OS2" },
  yasser: { full: "Yasser Drif", handle: "@Yasser_Drif__", asks: "product engineering at persona", bio: "product engineering at Persona, bringing autonomous AI agents to life" },
};

// Their first name is on the team, and we haven't asked about that name yet.
export function teamMatch(s: Session): string | null {
  const first = (s.slots.userName.value ?? "").trim().split(/\s+/)[0]?.toLowerCase();
  return first && TEAM[first] && s.teamGuess !== first ? first : null;
}

// their yes, answered in code before the model's reply
export const teamYes = (key: string) => (key === "jason" ? "no way, named after a file extension? an honor!" : "no way, an honor!");

// one sentence with the role in it: "is this THE zach?" and "is this THE julia?" alone read as the same question
// to the no-repeat guard, which dropped the second
export const teamLine = (key: string) => `woah, is this THE ${key}, ${TEAM[key].asks}? pleasure to meet you!`;

// After a yes: what the model may know about them (public info only), for a moment of recognition.
export const teamNote = (key: string) =>
  `They said they really are ${TEAM[key].full} from Persona (${TEAM[key].handle} on X). Public bio: ${TEAM[key].bio}. You already said \"no way, an honor!\" in a separate text just before yours, so don't react to it again: carry on normally with whatever's next. If they bring up their work, you can mention a detail from the bio. Don't gush.`;
