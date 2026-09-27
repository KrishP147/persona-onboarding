# handoff: live testing fixes (2026-09-27)

continues [2026-09-27-harness-and-voice.md](2026-09-27-harness-and-voice.md). repo: `C:\Users\User\persona-onboarding`, branch master, auto-deploys to https://persona-onboarding-omega.vercel.app on push (`pnpm dlx vercel@latest` for env).

## where things stand

- spec: `docs/spec.md`. manual test scripts: `docs/manual-tests.md`. design notes: `docs/journal/01-08`.
- user tests by hand on prod; don't run harness/e2e against prod beyond a minimal check.
- latest commits (read `git log -12` for detail):
  - `91d2590` skip setup: `SKIP_SETUP` regex in `src/lib/engine.ts` graduates in code (text only, not on a call), answers the request in the same turn, no call/gmail push. prompt: help "from memory" instead of "after setup".
  - `e87058d` on calls, text-channel agent messages wait until the spoken line finishes (`speak()` in `src/app/useVoiceCall.ts` now returns a promise; `apply()` in `src/app/page.tsx` defers). reload mid-call resyncs twice so "call ended" + recap show. prompt: no promises it can't keep (weather, location, "i'll dig into").
  - `c4df239` read_inbox tool (server-only token secret `gtoken:{sessionId}`).
- checks: `pnpm -s typecheck && pnpm -s lint && pnpm -s smoke` all pass at `91d2590`. neither of the last two fixes has been verified live yet; ask the user how their next manual test went.

## llm + spend (hard rules)

- prod: Claude Haiku 4.5 (`LLM_PROVIDER=anthropic`, `AGENT_MODEL=FAST_MODEL=claude-haiku-4-5`), redis spend counter `float:claude-spend` capped by `CLAUDE_BUDGET_USD=1.75` (about $3.25 spent before haiku; user's total cap is $5).
- never spend money without explicit per-action approval (see memory `no-spend-without-approval`). Cohere key = testing only, never prod.
- never print/commit keys (`.env.local`).

## open decisions / next work

1. **internet access** (awaiting user answer): agent can't browse. recommended Browserbase Search API ($7/1k, fetch $1-4/1k, no provider-side cap), so add our own redis cap (e.g. 20/day, 100 total) as a `web_search` tool. alternative: Anthropic web_search tool ($10/1k + tokens, eats the $5 budget). needs user approval + `BROWSERBASE_API_KEY` in `.env.local` and Vercel before building. when added, update prompt lines about "can't browse" in `src/lib/prompt.ts` and the intro capability list stays as is.
2. **save to gmail drafts** (user approved, not started): add `gmail.compose` scope in `src/lib/google.ts` auth url, `save_draft` tool in engine (confirm draft text with user first, honest errors, never say "sent"), user must reconnect gmail once.
3. keep watching live sessions for: echo on speakers, call not ending, false claims. inspect latest session via Upstash REST (`KEYS session:*`, pick max `updatedAt`); set `PYTHONIOENCODING=utf-8` when printing (emoji in intro).

## gotchas

- python patch scripts in bash heredocs turn `\b` into backspace; run `scratchpad/fixbs.py <files>` after, or use the Edit tool.
- next.js 16: read `node_modules/next/dist/docs` before next-specific code (AGENTS.md).
- user prefs: extremely concise replies; docs as lowercase journal entries, no em dashes, cite sources.

## suggested skills

- `claude-api` if touching the anthropic tool layer (web search tool, budget).
- `session-handoff` / `handoff` at the end of the next session.
- `grill-me` only if the internet-access decision needs scoping with the user.
