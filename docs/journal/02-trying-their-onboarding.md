# 02. trying their onboarding

*sept 26, 2026, on an android phone over rcs*

i wanted to feel the real thing before designing mine. notes from my screenshots and the conversation export.

## how it went

1. i texted "hey, what's a persona?" and got a friendly intro, an emoji list of what it can do (calls, browsing, shopping, email and calendar, doordash and uber), and a terms of service line with a link.
2. "what do you want to call me?" i said julia.
3. "julia it is. save my contact card, and i'll walk you through onboarding on a quick call." then it wouldn't call until i confirmed i'd saved the contact.
4. it called. the voice was masculine, which felt off after naming it julia. when i asked about it later over text it said it didn't have a documented explanation and passed the question to the team.
5. during the call it dropped a "connect your google account" card into the text thread. that part is genuinely nice: voice for talking, text for links.
6. i hung up. nothing came. i had to text "hey you said you would follow up on text". later it told me plainly: once the call ended it didn't get a signal that i'd hung up, and calls don't automatically trigger a follow-up.
7. when i asked meta questions, it answered in long paragraphs ("hypothetically, onboarding learns...", "the product docs don't specify...") that broke the feeling of talking to someone.
8. renaming the agent created a second contact instead of updating the first.
9. it offered quick reply chips (okay, thanks, an emoji, wow), which are a great steering tool, but they weren't used to steer.

## what i'm taking from it

things they do well that i'm keeping:

- agent name over text first. it's a fun, low effort first "yes", and it gives the agent an identity before the call.
- the link in the thread during the call. you can't do oauth by voice, so hand it to the other channel.
- short friendly texts, lowercase, emoji where it fits.

things i'm designing against:

| what happened | what mine does |
|---|---|
| no text after the call, the agent didn't know i hung up | hangups are events in code. the recap text is guaranteed, and if the model somehow says nothing, a deterministic recap goes out anyway |
| the agent vanished when the call ended | it always says a real goodbye before hanging up: my name, what it'll do next, and that it'll text me |
| name said julia, voice said otherwise | the voice is picked from the name, locked for the whole call, and remembered so it's the same next time. renaming mid call applies from the next call so the voice never flips mid sentence |
| gate: save my contact before i'll call | no gate. ask permission to call, make no an easy answer |
| rename made a duplicate contact | one contact card per session, updated in place |
| long hedgy meta answers | short bubbles, never talks about its own internals |
| chips that only said "okay" and "thanks" | chips that steer: call me, text is fine, connect gmail, i know what i need, skip setup |

## the honest takeaway

their onboarding isn't bad. it's close. the gaps are all at the seams: between call and text, between one answer and a changed answer, between the name and the voice. seams are exactly where a stress tester pokes, so that's where i'm putting the work.
