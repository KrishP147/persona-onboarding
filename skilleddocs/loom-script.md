# loom script (about 5 minutes)

open https://persona-onboarding-omega.vercel.app in chrome, with a second tab on the github readme.

## 1. the framing (30s)
- "i read this as a design challenge: the job is to make a first meeting with an assistant feel like being helped, and hold up when people don't cooperate."
- "the model writes the words. anything that must always happen, like a goodbye before hanging up or a text after every call, is enforced in code."

## 2. happy path (90s)
- name the agent over text. point out the contact card, which updates in place if you rename it (their real one made a duplicate).
- it asks permission to call, with texting as an easy yes. tap call me.
- on the call: say your name and one real need. note it doesn't re-ask anything from the texts.
- it sends the google link into the thread mid-call and gives you 30s of patience while you sign in. connect.
- it says goodbye, hangs up, and the recap text arrives on its own (their real one didn't follow up after the call).

## 3. break it (90s)
- refresh mid-conversation: no duplicate greeting, the thread resumes.
- start a call and say nothing: gentle check-in, then an offer to text, then a goodbye and a text.
- talk over it mid-sentence: it stops and responds to you.
- hang up abruptly: "looks like we got cut off" text, with the one open item.
- type "skip setup": it graduates and asks what you want to get done.

## 4. how i know it holds up (60s)
- show `harness/`: fifteen simulated difficult users, graded by a second model. `pnpm harness` prints scores and cost.
- open journal 06: the first run scored about 6/10 because the bot was ending onboarding too early and never calling cooperative users. fixed in code, now about 7+.
- mention the honesty fixes: it no longer claims gmail is connected or pretends to be doing work it can't do.

## 5. close (30s)
- "the journal has the reasoning and the sources: to sell is human, the mom test, the research on turn timing and permission asks."
- "next i'd put the voice on a single streaming socket for lower latency, and add real tasks after graduation."
