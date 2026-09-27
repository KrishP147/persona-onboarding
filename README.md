# persona onboarding

an onboarding for a persona style personal assistant, built as a phone simulator in the browser: a text thread plus a voice call. it tries to learn four things (a name for the agent, a name for the user, a connected gmail, and something they need help with), gets the agent's name over text, and tries the rest over a call. mostly though, it tries to feel like meeting a genuinely helpful person, and to hold up when people don't play along.

if you only read one thing, read the journal. it's how my understanding of this challenge changed, and why the bot behaves the way it does.

- [01. reading the brief (and then reading it again)](docs/journal/01-reading-the-brief.md)
- [02. trying their onboarding](docs/journal/02-trying-their-onboarding.md)
- [03. principles: serve, don't sell](docs/journal/03-principles.md)
- [04. voice, and all the ways people break things](docs/journal/04-voice-and-edge-cases.md)
- [reading list](docs/reading-list.md)

## running it

```bash
pnpm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY. without it, it runs in a mock mode
pnpm dev                      # http://localhost:3000 (chrome or edge for the voice call)
pnpm smoke                    # checks the safety nets, no key needed
pnpm harness                  # simulated difficult users vs the live bot (dev server running, key needed)
```

## how it fits together

```
browser: phone ui, text thread, call screen, voice (speech in, speech out)
   │  /api/chat      what the user said (typed or spoken)
   │  /api/session   things that happened (call started, hung up, silence, gmail connected...)
   ▼
engine
   ├─ policy (plain code): what's missing, how many times we've asked, when to offer a call, when to graduate
   ├─ mood gauge (plain code): how the person seems right now, which changes how the agent talks
   └─ claude: writes the words, uses a few tools (save a name, send the gmail link, start or end a call, graduate)
   ▼
one session per person, shared by text and voice
```

the short version of the philosophy: the model talks, code decides. anything that must always happen (a goodbye before hanging up, a text after every call, never asking the same thing three times) lives in code, not in a prompt.

## where things are

- `src/lib/prompt.ts`: who the agent is and how it treats people
- `src/lib/policy.ts`: the onboarding rules
- `src/lib/mood.ts`: reading the user
- `src/lib/engine.ts`: turns, tools, events, the goodbye and recap safety nets
- `src/app/useVoiceCall.ts`: turn taking on the call (pauses, interruptions, silence, locked voice)
- `harness/`: the difficult users and the grader
- `scripts/smoke.ts`: keyless checks

## status

- [x] text thread, call screen, shared session, events
- [x] silence ladder, guaranteed goodbye and recap, interruptions, locked voice, mood gauge
- [x] keyless smoke test, stress harness
- [ ] run the harness with a real key and tune from the results
- [ ] real google sign in for gmail (the button is a stand in right now)
- [ ] better voice (streaming speech to text, nicer text to speech)
- [ ] deploy
