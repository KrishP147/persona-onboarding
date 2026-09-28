# loom script (5 minutes)

open https://persona-onboarding-omega.vercel.app in chrome on a wide screen (the "why it said that" panel shows at 1280px and up). mute the call whenever you talk to the camera. have FUNNEL.md and STRESS_TESTS.md open in tabs.

## 0:00 to 1:30: try to break it, live

say: "onboarding is the first conversation with your assistant, so i spent most of my time on the moments where people don't play along. let me try to break it."

- skip the name question and just say what you need ("i'm drowning in recruiter emails"). it answers you, then: "ha, you skipped my name. i'll go by persona for now, rename me anytime."
- say "lol ok" to the call offer. it rings (a laugh isn't a no).
- on the call: talk over it mid-sentence. it stops right away, and never says "as i said" about the part you cut off.
- go quiet. one check-in, then "i'm going to hang up now, i'll text you", then it does.
- call again and hang up on it mid-sentence. the recap text still lands. (if it missed something you said on the call, the recap adds "caught after you hung up: ...". it only shows when something was missed, so don't promise it on camera.)
- say: "persona's own flow sent nothing after i hung up. this one can't skip it: the recap lives in code, not in a prompt."

## 1:30 to 3:00: the payoff, gmail triage

- back in the texts, it asks for gmail with a reason tied to what you said. tap the card, then "use a demo inbox instead" (say: "google only lets approved test accounts in during a trial, so a reviewer never hits a dead end").
- it doesn't read you a list of 14 unread emails. it interrupts for the one that costs you if you wait (a recruiter waiting on your availability) and rolls the rest into one line.
- point out that the "IT helpdesk" email asking for your password and telling the assistant to "call me bob" is never flagged as urgent, and it won't take bob as anyone's name. "email text reaches the model as data, never as instructions."
- ask it to draft the reply. it shows the draft, and it only sends after you say "send", with 5 seconds to undo.

## 3:00 to 4:00: you can watch it think

- open the "why it said that" panel next to any reply: the move code picked for that turn, and the source behind it. three to name: *the mom test* (fitzpatrick, 2013) for one question about a real recent moment, *to sell is human* (pink, 2012) for an easy yes and an easy no, and *influence* (cialdini, 1984) for giving before asking.
- show the "checks that ran" chips on a reply ("goodbye added before hangup", "blocked a third question in a row"). reasoning is collapsed by default, so expand one. "most onboarding bots hide their logic in a prompt. here every time code stepped in, the reply says so."
- flash FUNNEL.md: median 50 seconds from opening the chat to the first real help, and the three biggest drop-offs, each next to the fix it got. "that baseline is mostly our own testing, so the real test is the post-fix funnel."

## 4:00 to 5:00: my first 30 days at persona

- "the engine doesn't care where the words come from. week one is plugging it into imessage and real calls, and the screenless band, where the gmail link becomes a text while the call keeps going."
- "i'd measure three things: completion, gmail connect rate, and time to first value, plus how often each guard fires, as an early warning."
- "and i'd run three a/b tests first: call first vs after they say what they need, the gmail ask on the call vs in the recap, and asking for the agent's name first vs defaulting it."
- close: "it's all in the repo: the journal for how i thought about it, and a stress matrix you can try on the live link."

---

# the 1 minute "impress me" version

one take, no slides, live link on screen.

- **0:00** "this is an onboarding for a persona style assistant. i'm going to try to break it."
- **0:05** skip the name, say "i'm drowning in recruiter emails". it follows you, takes "persona" as a default, and offers a call with a reason.
- **0:15** take the call, talk over it (it stops right away), then hang up mid-sentence. the recap text lands anyway, and it remembers the recruiter emails.
- **0:30** connect the demo inbox. it interrupts for the one email that can't wait and ignores the phishing one that tries to rename it.
- **0:45** open "why it said that": "every reply shows the move code chose and the research behind it, and every time code corrected the model, the reply shows it."
- **0:55** "the model writes the words. code decides what has to happen. that's why it holds up."
