# 09. ask while it hurts

*sept 27, 2026, evening*

a live call went like this. i said recruiters were flooding my inbox. julia asked what the tough part was. i said i'd missed final rounds. julia asked what would help most. i said my inbox was a mess. julia asked what missing an interview actually looks like. i asked, straight out, "is there anything you could offer?" and got "sound good?" back. i hung up. only then, in a text, did it say it needed my gmail to help.

four questions, no offer, and the one thing that would have helped showed up after the moment had passed.

## onboarding is not customer discovery

the mom test (fitzpatrick, *the mom test*, 2013) is about learning whether a problem is real before you build anything. you ask about the past, not about hypotheticals, and you don't pitch. that's the right instinct for a founder talking to strangers.

it's the wrong default here. this person already signed up. they aren't a research subject, they're a customer waiting to be helped. the questions exist for one reason: so the suggestion that follows feels earned instead of scripted. one or two good ones do that. a fifth one feels like a form with a friendly voice, which is exactly what the brief says not to build.

so the rule became:

- once we know what's bothering them, ask **at most one** mom test style question (the "last time it happened" kind).
- then make the offer, **on the call**, while they're still talking about the pain: a sentence of help, then "want me to text you a link to connect your gmail, so i can actually help with that?"
- if they ask for help ("is there anything you could offer?", "can you help?"), that's the cue. skip the question and offer.

## why the timing matters

- **ask at peak motivation.** a prompt works when motivation is high (fogg, *tiny habits*, 2019). the moment someone is describing a missed final round is the most motivated they'll be all day. a text after hanging up lands when they've moved on.
- **give before you ask.** reciprocity (cialdini, *influence*, 1984) is why the offer starts with a line of real help, not with the ask. one sentence, not a lecture.
- **get them to the value fast.** good onboarding gets people to their first win quickly and gets out of the way (hulick, *the elements of user onboarding*, 2014). connecting gmail is the step that unlocks the first win, so it shouldn't wait behind a questionnaire.
- **agree to the pain, then act.** people feel heard when you play back what they said (voss, *never split the difference*, 2016). "that sounds tough" plus a concrete next step beats another question.

## how it's enforced

it's in code, not just the prompt, because the model loves to keep asking:

- `src/lib/moves.ts`: on a call, once the need is known and gmail isn't connected, the move is "ask gmail" as soon as one discovery move has been used (discover, dig, give first, playback, offramp), or right away if they asked what it can do. this check runs before the other moves, so an off to the side question can't push it back.
- turns where they talked over the agent, or texted during the call, used to skip move selection entirely, which is how the call above kept asking. those turns now still get the move.
- `src/lib/engine.ts`: the spoken ask is one short sentence, and the help before it is capped to one sentence, so the voice length cap can never cut the question off.
- "yeah sure" to the ask drops the link card in the texts and says so out loud. a no is respected, and it isn't asked again on that call.

one honest limit: the need is read from what they said in parallel with the reply, so the offer comes on the turn right after the problem is clear, not the same turn. in a local replay of the call above, it landed on the fourth spoken turn, right when i asked what it could offer, instead of never.

## also added

a mute button on the call, for recording. the mic goes silent at the source, nothing reaches the agent, silence check-ins pause, and the agent is never told.
