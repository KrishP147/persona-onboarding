# my first 30 days at persona

*sept 28, 2026*

this sim is a web page, but everything that matters in it is the engine: the turn loop, the guards, the session shared by text and voice. none of that cares where the words come from. so the first month is mostly plugging the engine into the places persona already lives, measuring it honestly, and testing the few decisions i'm least sure about.

## week 1: plug it in

- **imessage and rcs.** the text thread becomes persona's real messaging channel. the engine already works on events ("they texted", "they went quiet", "they connected gmail"), so the channel is an adapter: inbound message in, bubbles out, typing indicators and read receipts mapped to what each platform supports. the left-on-read double text runs on a server timer instead of a browser one.
- **real calls.** the browser call becomes a phone call (twilio media streams or persona's current stack), with the same events: started, silence, hung up. the goodbye and the recap after every call already live in code, which is exactly the part persona's current flow drops.
- **the screenless band.** voice-only onboarding is the hardest version, because there's no screen for a link, a contact card, or a draft. the engine already separates "said out loud" from "put in the chat", so on the band, "in the chat" becomes "in your texts on your phone", and the one thing that can't happen by voice (google sign-in) becomes a text with the link while the call keeps going. the name for the agent, which the brief keeps text-only, moves to the first text after the call.

## what i'd measure

the dashboard i'd want on day one, from session events (the same ones `pnpm funnel` reads today):

- **completion:** of people who send a first message, how many get through naming, the call, their name, their need, and gmail, and where each one drops. the development-period baseline is in [FUNNEL.md](../FUNNEL.md).
- **gmail connect rate:** connected over asked, split by where the ask happened (on the call, over text, after a failed sign-in). this is the step that unlocks everything after onboarding.
- **time to first value:** opening the chat to the first real help (inbox triage or a draft). the baseline is a median of 50s (23 sessions); after the fixes it's 3.3 min, but only 4 sessions got there, so the sample says more about how few reach value than how fast. i'd rather push this down than push completion up, because value is why people finish.
- **guardrails, as a health metric:** how often each guard fires per 100 turns. a guard firing more after a prompt change is the earliest sign the change made the model worse.

## the first 3 a/b tests

1. **call first vs text first.** today it asks to call right after you name it (persona's own flow). 44% of people who were offered a call didn't take one (37 of 85), the biggest drop-off in the baseline, and after the fixes it's 79% (19 of 24) now that texting is offered as an equal yes. test: offer the call right away vs only after they've said what they need. measure: need captured, gmail connect rate, time to first value.
2. **where the gmail ask lands.** on the call while they're describing the problem ("ask while it hurts", journal 09) vs over text right after the call with the recap. measure: connect rate and sign-in completion, since a link during a call is easy to miss.
3. **the name ask: first or later.** the first ask is "what do you want to call me?", a small fun yes (cialdini, *influence*, 1984), but 23% of people who texted never named it (29 of 126). test: ask it first vs start with "what's eating your time this week?" and default to "persona" with a rename later. measure: first-message-to-need rate, and whether people rename the default.

each one would be a single flag in the decide step, so a config change rather than a rewrite, and the guards keep both variants honest.
