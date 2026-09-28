# loom script (5 minutes)

open https://persona-onboarding-gold.vercel.app in chrome on a wide screen (the reasoning map runs side by side with the phone from 1024px up, a bottom sheet below that). mute the call whenever you talk to the camera. have FUNNEL.md and STRESS_TESTS.md open in tabs.

## 0:00 to 0:15: this is a trial demo

- the landing page says it top and bottom: "a trial demo by Krish for Persona, not the real product," with a link to the real yourpersona.com. say: "quick disclaimer up front, since it's built to look like the real thing." click "try it in your browser" to land on `/chat`.

## 0:15 to 1:45: try to break it, live

say: "onboarding is the first conversation with your assistant, so i spent most of my time on the moments where people don't play along. let me try to break it."

- skip the name question and just say what you need ("i'm drowning in recruiter emails"). it says "i'll go by persona for now, rename me anytime" and answers you. no "you skipped my name".
- say "lol ok" to the call offer. it rings (a laugh isn't a no).
- on the call: talk over it mid-sentence. it stops right away, and never says "as i said" about the part you cut off.
- go quiet. it waits. after 25s it picks up where you were ("still thinking about the recruiter emails? no rush."), checks in once more, and only warns before hanging up at about two minutes.
- call again and hang up on it mid-sentence. the recap text still lands. (if it missed something you said on the call, the recap adds "caught after you hung up: ...". it only shows when something was missed, so don't promise it on camera.)
- say: "persona's own flow sent nothing after i hung up. this one can't skip it: the recap lives in code, not in a prompt."

## 1:45 to 3:15: the payoff, gmail and the inbox

- back in the texts, it asks for gmail with a reason tied to what you said, and the link can also land mid-call if you're still on one. tap the card, then "use a demo inbox instead" (say: "google only lets approved test accounts in during a trial, so a reviewer never hits a dead end").
- it doesn't read you a list of 14 unread emails. it interrupts for the one that costs you if you wait (a recruiter waiting on your availability) and rolls the rest into one line.
- point out that the phishing email posing as tech support, asking for your password and telling the assistant to "call me bob," is never flagged as urgent, and it won't take bob as anyone's name, or that address as anywhere to send to. "email text reaches the model as data, never as instructions, and it can't hand the assistant a name or an address on its own."
- ask it to draft the reply. the draft card shows up collapsed (who, subject, one line). tap `show full email` to read it, then tap `Edit` and change a word right in the card, `Save`. "no retyping the whole thing over chat, and it re-saves the gmail draft."
- say "send it": 5 seconds to undo, then "sent from your gmail."
- tap the "follow up on that email" chip that shows up right after. ask it to draft a quick "thanks, got it": same person, same gmail thread, subject line `Re: ...`, no need to re-give the address.
- ask it to send that first email again. it won't quietly resend: it says plainly that one already went out, so this would be a second copy, and asks if you still want it sent. "that's a duplicate-send guard, not the model being cautious on its own."

## 3:15 to 4:15: you can watch it think

- open "examine reasoning" (top right on desktop, in the ⋮ menu on phones) next to any reply: the move code picked for that turn, and the source behind it. three to name: *the mom test* (fitzpatrick, 2013) for one question about a real recent moment, *to sell is human* (pink, 2012) for an easy yes and an easy no, and *influence* (cialdini, 1984) for giving before asking.
- show the "checks that ran" chips on a reply ("goodbye added before hangup", "blocked a third question in a row"). reasoning is collapsed by default, so expand one. "most onboarding bots hide their logic in a prompt. here every time code stepped in, the reply says so."
- flash FUNNEL.md: median 50 seconds from opening the chat to the first real help, and the three biggest drop-offs, each next to the fix it got. "that baseline is mostly our own testing, so the real test is the post-fix funnel."

## 4:15 to 5:00: my first 30 days at persona

- "the engine doesn't care where the words come from. week one is plugging it into imessage and real calls, and the screenless band, where the gmail link becomes a text while the call keeps going."
- "i'd measure three things: completion, gmail connect rate, and time to first value, plus how often each guard fires, as an early warning."
- "and i'd run three a/b tests first: call first vs after they say what they need, the gmail ask on the call vs in the recap, and asking for the agent's name first vs defaulting it."
- close: "it's all in the repo: the journal for how i thought about it, and a stress matrix you can try on the live link."

---

# the 1 minute "impress me" version

one take, no slides, live link on screen.

- **0:00** "this is a trial demo of a persona style assistant, not the real product, i'll say so up top, then get into it." click through to `/chat`.
- **0:08** skip the name, say "i'm drowning in recruiter emails". it follows you, takes "persona" as a default, and offers a call with a reason.
- **0:18** take the call, talk over it (it stops right away), then hang up mid-sentence. the recap text lands anyway, and it remembers the recruiter emails.
- **0:32** connect the demo inbox. it interrupts for the one email that can't wait and ignores the phishing one that tries to rename it or hand it an address.
- **0:45** draft a reply, send it with the 5-second undo, then ask it to send the same email again: it warns you it would be a duplicate instead of quietly resending.
- **0:53** open "examine reasoning": "every reply shows the move code chose and the research behind it, and every time code corrected the model, the reply shows it."
- **0:58** "the model writes the words. code decides what has to happen. that's why it holds up."
