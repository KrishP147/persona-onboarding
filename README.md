# persona onboarding

[![CI](https://github.com/KrishP147/persona-onboarding/actions/workflows/ci.yml/badge.svg)](https://github.com/KrishP147/persona-onboarding/actions/workflows/ci.yml)

**live: https://persona-onboarding-omega.vercel.app** (chrome or edge for the call; the "why it said that" panel shows at 1280px and up)

<!-- GIF placeholder: 20s loop of a text, the call, a hangup mid-sentence, and the recap text landing. record it last, save as docs/design/demo.gif, and add ![demo](docs/design/demo.gif) here. -->

an onboarding for a persona style personal assistant, built as a phone in the browser: a text thread plus a voice call.

- **it meets you like a person.** it texts in short bubbles, jokes a little, double texts once if you leave it on read, takes a default name if you skip giving one, and says a real goodbye before every hangup, then texts you after every call.
- **it gets four things without feeling like a form:** a name for the agent, your name, what you need help with, and your gmail (real sign-in, or a demo inbox if google won't let you in). you can skip ahead anytime.
- **it helps before it asks.** once gmail is in, it triages your inbox and only interrupts for something that costs you if you wait. it drafts replies and only sends after you've seen the draft and said "send".

most onboarding bots hide their logic in a prompt, so you find out what they do by poking at them. this one's logic is in code you can watch: every reply names the move it made and the research behind it, and every time code stepped in to fix a reply (a leaked internal note, a claim it couldn't back up, a missing goodbye) the reply records which guard did it. <!-- TODO: once the why panel shows guard chips, say "and shows it" --> the model writes the words. code decides what has to happen.

## try to break it

[STRESS_TESTS.md](STRESS_TESTS.md) lists 15 ways people break onboardings (silence, hanging up mid-sentence, refusing every question, "haha" as an answer, prompt injection, a poisoned email) with the code that handles each, the smoke check that proves it, and its harness score. the table is generated from the source, and CI fails if it goes stale. please try the same things on the live link.

## numbers

| what | number | source |
|---|---|---|
| time to first value | **median 50s** from opening the chat to inbox triage or a draft (23 sessions) | [FUNNEL.md](FUNNEL.md) |
| harness score | **8.9 / 10** avg over 16 simulated difficult users (round 3; 7.9 in round 1) | [harness/ROUNDS.md](harness/ROUNDS.md) |
| cost | **$0.0152 per onboarding**, $0.0030 per reply (claude haiku 4.5) | `pnpm metrics` |
| latency | **p50 2.0s, p95 4.8s** per reply | `pnpm metrics` |
| checks | 110 keyless smoke checks in CI, 25 browser checks with a fake mic, 23 manual scripts | `pnpm smoke`, `pnpm e2e`, [docs/manual-tests.md](docs/manual-tests.md) |
| post-fix funnel | _placeholder: `pnpm funnel --since <deploy time>` after friends try it_ | [FUNNEL.md](FUNNEL.md) |
| eval | _placeholder: final harness round_ | [harness/ROUNDS.md](harness/ROUNDS.md) |

honest caveats: the funnel is a development-period baseline (our own testing plus a few friends), and the latency number is turn time read from transcripts, so it runs a little high. new sessions record real model latency and cost per turn in `session.metrics`.

## how it's built

every message, typed or spoken, goes through the same five steps:

1. **parse** (code): what did they actually say? names, yes or no, bye, "no calls", "skip this". a small model pass pulls out names and needs in parallel.
2. **decide** (code): what's still missing, whether to offer a call, and which one conversation move to make this turn (e.g. "ask about a specific recent moment", from *the mom test*).
3. **generate** (model): claude haiku 4.5 writes the words and can use tools (look something up, read the inbox, draft an email). what the user typed, what tools returned, and email text all reach it fenced as data, never instructions.
4. **guard** (code): 24 named safety nets check the reply. a leaked internal note gets dropped, a "sent!" that wasn't sent gets corrected, a third question in a row gets cut, a hangup without a goodbye gets one.
5. **commit** (code): the session is saved, with the move, the guards, and the turn's cost and latency.

the engine lives in `src/lib/engine/` (turn, events, tools, intents, guards, text). text and voice share one redis session, so anything said on the call is known in the texts and the other way round. the call is a browser simulation: deepgram listens, cartesia speaks, and both fall back to the browser's own speech apis.

**code decides:** when to offer a call and when to ring, the gmail ask's wording and timing, goodbyes, the recap after every call, when to hang up on silence, what counts as a yes, what's worth interrupting you for, sending email, and refusing anything that only came from an email.
**the model decides:** the words, how to help with whatever you bring, and what to look up.

one page with the diagram, the guard list, failure modes and costs: [docs/architecture.md](docs/architecture.md). what i'd do in my first 30 days at persona: [docs/first-30-days.md](docs/first-30-days.md).

## how i thought about it

the journal is how my understanding changed, and why the bot behaves the way it does.

- [01. reading the brief (and then reading it again)](docs/journal/01-reading-the-brief.md)
- [02. trying their onboarding](docs/journal/02-trying-their-onboarding.md)
- [03. principles: serve, don't sell](docs/journal/03-principles.md)
- [04. voice, and all the ways people break things](docs/journal/04-voice-and-edge-cases.md)
- [05. what the research changed](docs/journal/05-research.md)
- [06. what stress testing found](docs/journal/06-stress-testing.md)
- [07. deciding when to interrupt](docs/journal/07-interruptions.md)
- [08. the long polish](docs/journal/08-polish.md)
- [09. ask while it hurts](docs/journal/09-ask-while-it-hurts.md)
- [10. being there](docs/journal/10-being-there.md)
- [11. persona calls persona](docs/journal/11-persona-calls-persona.md)
- [12. the user leads](docs/journal/12-the-user-leads.md)
- [13. left on read](docs/journal/13-left-on-read.md)
- [14. phone skins and "why it said that"](docs/journal/14-phone-skins-and-why.md)
- [16. dead mic](docs/journal/16-dead-mic.md)
- [reading list](docs/reading-list.md)

## how i built it

i built this with ai agents, the way i'd want a small team to work. one orchestrator session held the plan and split it into lanes (engine, voice, ui, safety, docs), and planner, implementer and verifier agents picked up one task each, on their own branch or worktree. early on, merges waited on the local smoke checks; once CI existed, they waited for it to pass on the exact commit being merged. every change had to hold up against the same smoke checks, harness personas and stress matrix, which is a big part of why those exist.

## running it

```bash
pnpm install
cp .env.example .env.local   # ANTHROPIC_API_KEY + LLM_PROVIDER=anthropic, or GEMINI_API_KEY. with neither, a mock mode
pnpm dev                      # http://localhost:3000 (chrome or edge for the voice call)
pnpm smoke                    # 110 keyless checks of the safety nets
pnpm stress-matrix            # regenerates STRESS_TESTS.md from the source
pnpm harness                  # 16 simulated difficult users vs a local dev server, graded (ALLOW_TEST_EVENTS=1). prints its cost
pnpm metrics                  # latest harness run as one table: p50/p95 latency, $ per onboarding
pnpm funnel                   # real-user funnel from prod sessions (read-only, aggregate only)
pnpm e2e                      # real chrome walkthrough with a fake mic: 25 checks + screenshots
```

prod runs claude haiku 4.5 under a hard spend cap (`CLAUDE_BUDGET_USD`, checked before every call). gemini works too (`LLM_PROVIDER`, see `.env.example`).
