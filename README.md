# persona onboarding

[![CI](https://github.com/KrishP147/persona-onboarding/actions/workflows/ci.yml/badge.svg)](https://github.com/KrishP147/persona-onboarding/actions/workflows/ci.yml)

an onboarding for a persona style personal assistant, built as a phone simulator in the browser: a text thread plus a voice call. it tries to learn four things (a name for the agent, a name for the user, a connected gmail, and something they need help with), gets the agent's name over text, and tries the rest over a call. mostly though, it tries to feel like meeting a genuinely helpful person, and to hold up when people don't play along.

live: https://persona-onboarding-omega.vercel.app (chrome or edge for the call)

if you only read one thing, read the journal. it's how my understanding of this challenge changed, and why the bot behaves the way it does.

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
- [reading list](docs/reading-list.md)

## running it

```bash
pnpm install
cp .env.example .env.local   # add GEMINI_API_KEY (or ANTHROPIC_API_KEY). with neither, it runs in a mock mode
pnpm dev                      # http://localhost:3000 (chrome or edge for the voice call)
pnpm smoke                    # checks the safety nets, no key needed
pnpm harness                  # 15 simulated difficult users vs the live bot, graded (dev server running, ALLOW_TEST_EVENTS=1). prints its cost
pnpm metrics                  # latest harness run as one table: p50/p95 latency, $ per onboarding
pnpm e2e                      # real chrome walkthrough with a fake mic: 25 checks + screenshots in harness/e2e/
# with a real mic: docs/manual-tests.md (19 voice + text scripts)
```

## how it fits together

```
browser: phone ui, text thread, call screen
   │  voice: mic → deepgram (short lived token from /api/voice/token), speech ← cartesia (/api/voice/tts)
   │         both fall back to the browser's own speech apis
   │  /api/chat      what the user said (typed or spoken)
   │  /api/session   things that happened (call started, hung up, silence, gmail connected...)
   ▼
engine
   ├─ policy (plain code): what's missing, how many times we've asked, when to offer a call, when to graduate
   ├─ mood gauge (plain code): how the person seems right now, which changes how the agent talks
   └─ llm (gemini by default, claude optional): writes the words, uses a few tools (save a name, send the gmail link, start or end a call, graduate)
   ▼
one session per person, shared by text and voice
```

models: gemini 2.5 flash by default, walking a chain of gemini models when one is out of free quota, with an optional capped claude fallback (`LLM_FALLBACK=anthropic`, see `.env.example`). the free tier is small (some models allow 20 requests a day), so don't run the full harness on the key the demo uses.

the short version of the philosophy: the model talks, code decides. anything that must always happen (a goodbye before hanging up, a text after every call, never asking the same thing three times) lives in code, not in a prompt.

## where things are

- `src/lib/prompt.ts`: who the agent is and how it treats people
- `src/lib/policy.ts`: the onboarding rules
- `src/lib/mood.ts`: reading the user
- `src/lib/engine.ts`: turns, tools, events, the goodbye and recap safety nets
- `src/lib/llm.ts`: the model layer (gemini or claude)
- `src/lib/triage.ts`: what in their inbox deserves an interruption, and logging whether it was acted on
- `src/app/useVoiceCall.ts`: turn taking on the call (pauses, interruptions, silence, locked voice), deepgram and cartesia
- `src/app/api/voice/`: speech token and text to speech routes
- `harness/`: the difficult users and the grader
- `scripts/smoke.ts`: keyless checks

## numbers

from the last full harness run (`pnpm metrics`, claude haiku 4.5 as the agent):

| metric | value |
|---|---|
| p50 latency | 2.0s |
| p95 latency | 4.8s |
| $ / onboarding | $0.0152 |
| $ / reply | $0.0030 |

that run predates the turn meter, so latency there is turn time read from transcripts (their text to our next one, extractor included), a little high. new sessions record real model latency and $ per turn in `session.metrics`.

## status

- [x] text thread, call screen, shared session, events
- [x] silence ladder, guaranteed goodbye and recap, interruptions, locked voice, mood gauge
- [x] keyless smoke test, stress harness
- [x] run the harness with a real key and tune from the results (journal 06)
- [x] google sign in for gmail in a popup so the call survives it (demo account when no client is configured)
- [x] offline retry, multi tab sync, call me back, deploy ready session store
- [x] better voice: deepgram streaming speech to text, cartesia text to speech, one fixed voice per style
- [x] deploy (vercel + upstash, auto deploys from master)
- [x] persona's own flow: scripted intro with the legal link, name first, save contact card, "calling you now", call on a second phone
- [x] feels like texting a person: instant send, read receipts, typing pace, 👀 on long messages, the occasional gif
- [x] research as code: one conversation move per turn, shown in the "why it said that" panel (journal 03)
- [x] inbox triage: interrupt only when waiting costs them something (journal 07)
- [x] browser end to end test with a fake mic (`pnpm e2e`)
- [ ] a real voice call with a real mic, tested by a person
- [ ] loom walkthrough
