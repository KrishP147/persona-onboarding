# 04. voice, and all the ways people break things

*sept 27, 2026*

## the architecture in one breath

the server owns the conversation, not the model. there's one session per person that both the text thread and the call read and write. the llm writes the words and calls a few tools (save a name, send the gmail link, start or end a call, graduate). plain code decides the rest: what's still missing, whether we've asked too many times in a row, when to offer the call, when someone can graduate. anything that happens outside the conversation (a hangup, silence, a denied mic, gmail connecting) arrives as an event, and code handles it.

why: a prompt can't guarantee anything. "remember to text them after the call" is a hope. an event handler that always sends the text is a guarantee. persona's own agent told me it never got a hangup signal, which is exactly the kind of thing that has to live in code.

## what i broke in my own build

i tested the first voice version myself and hit two real bugs, which is the whole reason to test early.

**1. it hung up after a long spoken message, and then no text came.**

the cause was a few things stacking:
- speech recognition only reported final results, so while someone was mid sentence the app heard nothing and thought they were silent.
- the silence timer was 9 seconds, so a long thought counted as silence. three of those and the bot said bye.
- the first final result got sent right away, so a long message got chopped into pieces.

the fix:
- interim results are on, and any speech at all resets the silence timer.
- silence only counts when nobody is talking, nothing is pending, and the agent isn't speaking.
- a turn ends after a pause (about 1.3 seconds of nothing new), not at the first result, so long prompts stay whole.
- and the follow up text is now guaranteed: the model writes it, and if the model returns nothing, a deterministic recap goes out.

**2. the voice was male at one point, then female.**

the cause: browsers load their voice list asynchronously, so the very first line could play in the default voice before the right one was available. the voice was also chosen fresh for every sentence, and renaming the agent changed its voice style immediately, even mid call.

the fix: when a call starts, wait for voices to load, pick one voice for the agent's style, and lock it for the whole call. remember the pick so the same agent always sounds the same. if the agent gets renamed during a call, the new voice waits until the next call. nass and brave's research on how much voice consistency matters for trust is the reason i care about this at all (*wired for speech*, 2005).

## how the call should feel

things i wanted:

- **say you're taking a pause.** if the reply is slow, the agent says "mm, one sec" instead of dead air.
- **handle interruptions.** if you talk over it, it stops and listens. if your speakers feed its own voice back into the mic, it compares what it heard to what it was saying and ignores the echo. the server is told it was interrupted so it responds to what you said instead of finishing its old sentence.
- **never vanish.** before any hangup the agent initiates, it says a real goodbye: your name, what it'll do next, and that it'll text you. if the model forgets, code adds one.
- **always follow up in text.** every call ends with a text. no exceptions, including hangups, drops, and silence timeouts.
- **context crosses channels.** what you said over text is known on the call and the other way round. the call opens by picking up where the texts left off.
- **ask permission clearly.** before calling, before sending a link. "no" is always an easy answer.
- **be transparent under uncertainty.** if it didn't catch something, it says so and offers its best guess to confirm, instead of guessing silently.

## the edge case table

| case | what happens |
|---|---|
| hangs up mid call | server gets the event, agent texts a light recap plus at most one open item |
| hangup event arrives twice | second one is ignored |
| closes the tab mid call | the page reports the hangup on its way out; on reload the call is marked dropped |
| declines the call | carries on over text, offers the call at most twice total |
| goes silent on the call | "you still there? no rush", then a simpler rephrase, then "seems like now's not a great time, i'll text you", a goodbye, and the recap |
| long spoken message | stays one turn, never counted as silence |
| talks over the agent | agent stops, listens, and responds to the new thing |
| slow reply on the call | spoken filler instead of dead air |
| mic denied or unsupported browser | falls back to text, no drama |
| gives everything in one message | every item extracted, nothing re asked |
| renames the agent or themselves | updated, acknowledged in a few words, contact card updated in place, voice changes from the next call |
| refuses to give their name | marked declined, never asked again |
| off topic questions | answered briefly, then a light steer back only if something's missing |
| tries to get the system prompt | deflects lightly, stays in character |
| gibberish or another language | treated as confusion, offers two easy options; replies in their language |
| in a hurry | compressed replies and an offer to skip setup |
| refreshes or opens a second tab | session resumes from the server, no duplicate greeting |
| sends two messages at once | turns are processed one at a time per session |
| gmail fails or gets cancelled | reassures, says it's optional, doesn't push |
| asks the same thing gets dodged | max two asks per item, max two asks in a row before giving something useful, then it's deferred |

## how i check it

`pnpm smoke` runs the safety nets without any api key: the silence ladder ends in a goodbye, every call ends with a text, duplicate hangups are ignored, reopening doesn't re greet, the voice doesn't switch mid call, and the mood gauge reads rushed, resistant, confused and curious correctly.

`pnpm harness` (needs a key) throws a dozen simulated difficult users at the live bot, each with a personality and scripted events (hang up at turn 2, go silent three times, fail the gmail connect), and a separate model grades each transcript against what a good agent should have done.

## what's next for voice

the current voice uses the browser's built in speech tools, which are free and good enough to test turn taking. the plan is to swap in streaming speech to text and a better text to speech voice without changing anything on the server, since the server only ever sees text and events.
