# handoff: persona onboarding trial, run harness + real integrations

*2026-09-27. repo: `C:\Users\User\persona-onboarding` → github `KrishP147/persona-onboarding` (private, default branch `master`, head `d8f046b`)*

## what this is

48h job trial for persona (yourpersona.com). build an onboarding (web phone sim, text + voice call) that collects agent name (text only), user name, connected gmail, a help need; call attempts all but agent name; must survive user error (hangups etc); conversational, gentle steering, early graduation. user was told deadline ~2026-09-28. brief + interpretation: `docs/journal/01-reading-the-brief.md`.

**it's a design/ux challenge, not a feature build.** scope is spec-exact. do NOT add media parsing, twilio, a real main experience, or inbox features beyond the unread count.

## read first

- `README.md` (run commands, architecture, status checklist)
- `docs/journal/01..05` (reasoning, their onboarding's bugs, principles w/ book citations, voice + edge case table, research-driven changes)
- `AGENTS.md`: next 16 has breaking changes; read `node_modules/next/dist/docs/` before next-specific code

## state

done and pushed (see `git log`): engine/policy/mood/prompt in `src/lib/`, `/api/chat`, `/api/session` events, phone ui + browser web speech voice (`src/app/useVoiceCall.ts`), google oauth popup (`src/app/api/auth/google/*`, demo account when no client id), file/upstash store, offline + tab sync, 15 harness personas, `pnpm smoke` (25 keyless checks, all pass), typecheck/lint/build clean.

**user added all keys to `.env.local`** (anthropic, google oauth id+secret, deepgram, cartesia, possibly groq/gemini). never print or commit them. user's research is done and folded in.

**never exercised with real keys yet:** llm replies (only mock mode ran), harness, real google sign in, any voice in a browser (agent has no mic).

## next steps (in order)

1. ask user before starting `pnpm dev` (claude code killed it earlier for low memory). add `ALLOW_TEST_EVENTS=1` to `.env.local` if missing (harness needs it for gmail events).
2. `pnpm harness` (~$0.50/run, report cost), read `harness/runs/<ts>/SUMMARY.md` + transcripts, fix prompt/policy/engine, rerun until strong. first run will likely surface llm-path bugs (tool loop in `src/lib/engine.ts` `generate()`, model `claude-sonnet-5`, effort low).
3. verify real google oauth end to end (user must be a test user; redirect uri `http://localhost:3000/api/auth/google/callback`).
4. voice upgrade: browser-side deepgram streaming stt + cartesia tts w/ short-lived tokens from our api, keep server contract (text + events). keep web speech as fallback. voice style from agent name must stay locked per call.
5. deploy (vercel + upstash fine; user said host is flexible), add prod redirect uri in google console.
6. update journal (lowercase, no em dashes, cite sources), README status, then loom script for user.

## gotchas

- editing ts via python heredocs on this machine turned `\b` into backspace chars and `\n` into real newlines. prefer Edit/Write tools; check with `grep -lP '\x08' src` after scripted edits.
- sonnet 5: no prefill; thinking omitted = adaptive; forced tool_choice ok but we use auto.
- spend cap $50 total, ask before anything beyond harness runs. no twilio without explicit ok.
- user preferences: extremely concise replies; docs as lowercase journal entries, no em dashes; branches prefixed `krish/` (work so far is on master, fine for this solo repo).

## open questions for user

- voice retest results in chrome (long message, barge-in, silence, hangup, consistent voice)?
- recruiter reply re mock vs real + her google email for test users?

## suggested skills

- `claude-api`: before touching the anthropic calls in `engine.ts` / `harness/run.ts`
- `run`: launching the app to verify changes
- `code-review` (medium): before deploy
- `session-handoff` / `handoff-auto`: at end of next session
