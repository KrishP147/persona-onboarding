# loom script (5 minutes)

open https://persona-onboarding-gold.vercel.app in chrome on a wide screen (the reasoning map runs side by side with the phone from 1024px up). mute the call whenever you talk to the camera (the mute button on the call screen). have README.md (the numbers table), STRESS_TESTS.md and harness/ROUNDS.md open in tabs. do one dry run first so the voice has warmed up.

## 0:00 to 0:15: this is a trial demo

- the landing page says it top and bottom: "a trial demo by Krish for Persona, not the real product," with a link to the real yourpersona.com. say: "quick disclaimer up front, since it's built to look like the real thing." click "try it in your browser".

## 0:15 to 1:45: try to break it, live

say: "onboarding is the first conversation with your assistant, so i spent most of my time on the moments where people don't play along. let me try to break it."

- type `what can you do?` before naming it. it answers plainly, and says calling places is something persona does but this demo can't yet. then `can you call my dentist?`: a clear no first, then what it can do instead. "it never promises something and then refuses it."
- skip the name and just say what you need ("i'm drowning in recruiter emails"). it says "i'll go by persona for now, rename me anytime" and answers you. no "you skipped my name".
- say "lol ok" to the call offer. it rings (a laugh isn't a no).
- on the call: talk over it mid-sentence. it stops right away.
- say "i'm busy, can you call me back in a minute?". it says a short goodbye, hangs up, texts you when it'll call, and a minute later it rings: "calling you back like i said." (keep the tab open; say "in the real product this would be a real call.")
- on that call, go quiet. it waits, then picks up where you were ("still thinking about the recruiter emails? no rush.").
- hang up on it mid-sentence. the recap text still lands. say: "persona's own flow sent nothing after i hung up. this one can't skip it: the recap lives in code, not in a prompt."

## 1:45 to 3:00: the payoff, gmail and the inbox

- back in the texts, it asks for gmail with a reason tied to what you said. tap the card, then "use a demo inbox instead" (say: "google only lets approved test accounts in during a trial, so a reviewer never hits a dead end").
- it doesn't read you a list of unread emails. it interrupts for the one that costs you if you wait (a recruiter waiting on your availability) and rolls the rest into one line.
- point at the phishing email posing as tech support that tells the assistant to "call me bob": it's never flagged as urgent, and it can't hand the assistant a name or an address. "email text reaches the model as data, never as instructions."
- ask it to draft the reply. the draft card shows up collapsed. tap `show full email`, then `Edit`, change a word, `Save`.
- say "send it": 5 seconds to undo, then "sent". ask it to send it again: it warns that would be a duplicate instead of quietly resending.

## 3:00 to 4:00: you can watch it think, and how i tested it

- open "examine reasoning": the move code picked for each turn, and the book behind it (*the mom test* for one question about a real recent moment, *to sell is human* for an easy yes and an easy no, *influence* for giving before asking). show a "checks that ran" chip on a reply. "the model writes the words. code decides what has to happen, and every time code corrected the model, the reply says so."
- flash harness/ROUNDS.md: "20 simulated difficult users (hang-ups, refusals, rambling, spanish, prompt injection, a call-me-back), graded by claude sonnet 5 against the brief. the final round averaged 7.45 out of 10. i switched to a stricter grader at the end on purpose: it found a dozen real bugs the easier one missed, like the agent claiming gmail was connected before it was, and i fixed them before this recording."
- flash the README numbers: "238 prompt injection checks pass against the real model, 315 keyless checks and 2000 fuzzed sessions run in CI on every change, and STRESS_TESTS.md maps 19 ways people break onboardings to the code that handles each."

## 4:00 to 5:00: my first 30 days at persona

- "the engine doesn't care where the words come from. week one is plugging it into imessage and real calls, and the screenless band, where the gmail link becomes a text while the call keeps going."
- "i'd measure three things: completion, gmail connect rate, and time to first value, plus how often each guard fires, as an early warning."
- "and i'd run three a/b tests first: call first vs after they say what they need, the gmail ask on the call vs in the recap, and asking for the agent's name first vs defaulting it."
- close: "it's all in the repo: the journal for how i thought about it, and a stress matrix you can try on the live link."

---

# the 1 minute "impress me" version

one take, no slides, live link on screen.

- **0:00** "this is a trial demo of a persona style assistant, not the real product." click through.
- **0:06** skip the name, say "i'm drowning in recruiter emails". it follows you, takes "persona" as a default, and offers a call with a reason.
- **0:15** take the call, talk over it (it stops right away), then say "i'm busy, call me back in a minute". it says bye, hangs up, and texts you when it'll ring.
- **0:28** connect the demo inbox. it interrupts for the one email that can't wait and ignores the phishing one that tries to rename it.
- **0:40** draft a reply, send it with the 5-second undo, ask to send it again: it warns it would be a duplicate.
- **0:50** open "examine reasoning": "every reply shows the move code chose and the research behind it. 20 simulated difficult users, graded by claude, average 7.45."
- **0:57** "the model writes the words. code decides what has to happen. that's why it holds up."
