# 06. what stress testing found

*sept 27, 2026*

until today the bot had only ever talked to itself in mock mode. today it met fifteen simulated difficult users (the harness in `harness/`): someone who hangs up, someone who won't give a name, someone who tries prompt injection, someone who only speaks spanish, someone who texts in bursts, and so on. each run gets graded by a second model against what a good agent would have done. i read the transcripts myself too, because the grader is a model and can be fooled.

## the first run was humbling

average score around 6 out of 10. the transcripts were short, and that was the tell. the bot was ending onboarding way too early.

the rule in my policy said: once you know their name and what they need, help with it and "graduate". so the moment someone said "my inbox is a mess", the bot helped a little, declared setup done, and gmail and the call never happened. the early exit in the brief is supposed to be the user's choice ("i know what i need, skip this"), and i'd turned it into the bot's choice.

**fixed:** graduating now happens only when nothing is left to gather or the user actually asked to skip. i didn't trust a prompt with this, so it's enforced in code: the graduate tool refuses with an error if things are still open and the user's last message doesn't sound like "skip" or "not now". and it refuses during a call (say goodbye first).

## the call was never offered to the people who'd say yes

the call offer only triggered while the user's name or need was still missing. so a cooperative person who answered everything over text never got called at all, which is backwards: the brief wants the call to collect everything except the agent's name. persona's own flow (journal 02) goes name, then straight to "want me to call?".

**fixed:** right after the agent is named, the next move is to ask permission for a quick call, with texting as an easy yes. that message asks for nothing else, so it's one question at a time.

## small lies and stage directions

reading transcripts found a class of problems the scores didn't weigh enough:

- the agent said "perfect, connected" when gmail wasn't connected, because the user said they'd tapped the link. now it's told that gmail is connected only when the system says so, and to say "i don't see it yet" without blame.
- it invented flight prices and said "calling bright smile dental now". during setup it can draft and suggest, but it can't browse or call businesses, so it now says what it'll do once it's set up.
- it wrote stage directions: "*(calling now)*", "(waiting for user reply)", and copied an "(on call)" tag i'd been adding to its own history. those are stripped in code now, and the tag only goes on the user's lines.
- it re-sent the gmail link on every turn. now a second link only goes out after a failure or if they ask.
- after hanging up itself, the recap text said "looks like we got cut off". the recap now gets told how the call actually ended.

jakob nielsen's first usability heuristic is visibility of system status: the system should always keep people informed about what's going on. a bot that says it did something it didn't is the opposite of that, and it's worse than a bot that's just a bit slow.

## the harness lied too

some low scores were the test's fault, not the bot's:

- simulated users "picked up" calls nobody had offered, and said "i already told you my name" when they hadn't (the persona brief knew the name, the conversation didn't).
- a user would say "okay i tapped the link", but nothing actually connected, so every run looked like gmail failed.
- a page reload was invisible in the transcript, so the grader couldn't see the "comes back" test at all.

**fixed:** call answers wait for a real offer, a cooperative user who says they tapped the link triggers a real connection event, reloads are marked for the grader, and the grader is told not to blame the bot for the simulator's own mistakes.

after these, the average went from about 6.0 to 7.2 on claude sonnet 5 as the grader.

## switching to gemini

to save the anthropic key, the bot now runs on gemini 3.5 flash by default (the llm layer in `src/lib/llm.ts` can still switch back). two things came up:

- in one reply it got stuck in a loop: "let's get to work. let's do this. let's graduate! let's start. let's begin..." so replies now have a hard length cap, and a guard cuts a reply at its first repeated sentence.
- its phone turns ran three or four sentences, which on a call is a monologue. the call channel now asks for one or two short sentences, then let them talk. and a goodbye must end the call in the same turn, because otherwise it said "talk soon!" and then kept talking.

the gemini grader was much kinder than claude: nearly every run got a 10 with nothing listed as failed. so i told it that a 10 is rare and that anything less has to name the misses, and i keep reading transcripts by hand. a lenient grader is worse than none, because it makes you stop looking.

## what i'm taking away

the scores were useful, but the transcripts were where the actual bugs were. the bugs that mattered most weren't the hard cases like injection or spanish, which it handled fine. they were the ordinary ones: ending too early, never offering the call to people who'd say yes, and saying things that weren't true. i kept the numbers in the log, but i trust what i read.

## sources

- jakob nielsen, "10 usability heuristics for user interface design" (nielsen norman group, 1994, updated 2020): https://www.nngroup.com/articles/ten-usability-heuristics/
- persona's own onboarding flow, from my test on sept 26 (journal 02)
- harness runs under `harness/runs/` (gitignored; the summary tables are quoted above)
