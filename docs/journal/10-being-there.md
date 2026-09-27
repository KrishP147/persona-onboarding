# 10. being there

*sept 27, 2026, night*

the feedback this time wasn't about a bug. it was about a feeling. when you call julia, you're the one bringing something. it should sound like a friend who's glad you called, not an assistant with a checklist. it should be fine with quiet, think out loud when it needs to, and ask when it isn't sure instead of guessing wrong.

i had a research pass done on silence, fillers, listening, and humanizing voice agents before changing anything. what follows is what the research says and what changed because of it.

## when they call you

- **what changed:** a call you start opens with "hey krish! really good to hear from you. what's going on?" no setup questions, no gmail ask, and nothing from before (an old need, past emails) unless you bring it up. in code: inbound calls turn off slot gathering entirely (`src/lib/policy.ts`).
- **why:** hospitality is when "the other person is on your side" (meyer, *setting the table*, 2006). the listener's own agenda is the main thing that gets in the way of listening (nichols, *the lost art of listening*, 1995). a "support response" invites them to say more; a "shift response" turns the talk toward yourself (derber, via murphy, *you're not listening*, 2020). "it is not about you" (headlee, *we need to talk*, 2017).
- **limit:** i found no published research comparing greetings when they call you versus when you call them. the design follows from the hospitality and listening sources: when they reach out, open warm and let them lead.

## silence

- **what the research says:** a normal gap between turns is about 200 ms (stivers et al., *pnas*, 2009). an awkward pause starts around 4 seconds (koudenburg, postmes & gordijn, 2011). but not every silence is a problem: when a topic winds down, a lapse is a normal part of talk (hoey, *when conversation lapses*, 2020). voice guidelines say at most two check-ins, then end warmly (google conversation design, "errors").
- **what changed:**
  - the first check-in waits 10 seconds (was 6).
  - the second waits 20 seconds after the first, and the goodbye another 30 after that.
  - after "hold on", it waits 90 seconds, then "i'm still here whenever you're ready."
  - the check-ins sound like presence, not a probe: "no rush." or "mm, i'm here." instead of "anything else you want me to do with that?"

## thinking out loud

- **what the research says:**
  - "uh" signals a short delay and "um" a longer one (clark & fox tree, 2002).
  - people liked a robot best when it answered in about a second; when it had to be slower, a filler softened the impression (shiwa et al., 2008).
  - delays over 4 seconds hurt, and fillers made the wait feel shorter (maslych et al., 2025).
  - generic fillers can make an agent seem less smart, while thinking ones ("let me think") don't (arXiv 2508.11781, 2025, read only in summary). sierra avoids filler audio and uses lines tied to the request instead.
- **what changed:** fillers only when the reply is actually slow.
  - at about 1 second, half the time, a short "hmm." or "mm, okay."
  - at about 3 seconds, "um, let me think that through for a second."
  - never on a fast reply, and never the same one twice in a row.
  - the prompt also lets the reply itself open with "hmm" or "oh" sparingly, and say "let me think that through" when something needs thought.

## asking instead of assuming

- **what the research says:** people ground what they mean together, and a quick check costs less than a misunderstanding later (clark & brennan, "grounding in communication", 1991). conversation prefers that people fix their own words; a listener starts the fix with "you mean...?" (schegloff, jefferson & sacks, 1977). specific clarifying questions raise satisfaction more than generic ones (rahmani et al., eacl 2024).
- **what changed:** if what they said could mean two things and a wrong guess would cost them effort, it asks a short, specific question ("the recruiter emails, or the interview scheduling?"). otherwise it says its guess out loud so they can correct it ("sounds like the job stuff is the big one?").

## human, not pretending

google duplex's "um"s and "mm-hmm"s were so convincing that people didn't know they were talking to a bot. the backlash led to built-in disclosure (i/o 2018 coverage). so julia can sound human, but if you ask whether it's a person, it says plainly that it's an ai assistant.

## not done yet

backchannels ("mm-hm" while you talk, only at your pauses) are the next step (yngve, 1970; schegloff, 1982; gravano & hirschberg, 2011). they need tight timing against the mic stream, so they're a bigger change than this pass.

## also: the voice

cartesia ran out of credits (402), so calls were falling back to the browser's robotic voice. calls now switch to deepgram's aura voices when that happens, and they stay on aura for 6 hours so the voice never changes mid-call.
