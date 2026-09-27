# Persona Onboarding

Adaptive text + voice onboarding simulator for a Persona-style personal assistant. Collects an agent name (text), the user's name, a connected Gmail, and something they need help with, over a phone-style chat plus a simulated call, while staying conversational and robust to users who don't follow the script.

## Run

```bash
pnpm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY (without it: mock mode)
pnpm dev                      # http://localhost:3000
pnpm harness                  # stress test (dev server running, needs key)
pnpm harness hangup-early     # one persona
```

## Architecture

```
browser (phone UI, call screen)
   │  /api/chat   (user text / voice transcript)
   │  /api/session (events: open, call_started, call_ended, silence, gmail_connected, …)
   ▼
engine ── policy (deterministic: next slot, nudge budget, call offers, graduation)
   │   └─ LLM (Claude) writes the words + calls tools: set_slot, decline_slot,
   │      offer_call, start_call, send_gmail_link, end_call, graduate
   ▼
session store (one record shared by text + voice)
```

- **Server owns state, not the model.** Text and voice read/write the same session, so a dropped call continues in text with nothing lost.
- **Events are code.** Hangups, silence, mic denial, and OAuth results arrive as events; the recap text after a hangup is guaranteed, not left to the model to remember.
- **Nudge budget.** Max 2 asks per item, max 2 asks in a row before giving value; then the item is deferred.
- **Graduation.** Once the user states a need, the agent helps with it and hands off; "Skip setup" is always one tap away.

## Edge cases (tracked)

| Case | Behavior |
|---|---|
| Hang up mid-call | Server gets `call_ended`; agent texts a recap + one missing item |
| Duplicate hangup / tab closed mid-call | Idempotent; `pagehide` reports the hangup; reload marks call dropped |
| Decline call | Continues over text, offers the call at most twice |
| Silence on call | Check-ins, then "I'll text you" and hang up after 3 strikes |
| Mic denied / unsupported browser | Falls back to text |
| Everything in one message | All slots extracted; nothing re-asked |
| Rename agent / user | Slot overwritten; contact card updated in place (no duplicate contact) |
| Refuses name | Declined, never asked again |
| Off-topic / injection | Brief answer, stays in character, never mentions internals |
| Refresh / second tab | Session resumes from server; no duplicate greeting |
| Rapid double-send | Per-session turn lock |
| Gmail fails / cancelled | Reassure, optional, don't push |

## Status

- [x] State machine, API, phone UI, interim browser voice (Web Speech), harness
- [ ] Pipecat voice pipeline (Deepgram STT, Cartesia TTS, barge-in), voice matched to agent name
- [ ] Google OAuth + Gmail read + sample-inbox fallback
- [ ] Media parsing: voice notes (Groq Whisper), video (Gemini), images (Claude vision ✓)
- [ ] Upstash store + deploy
