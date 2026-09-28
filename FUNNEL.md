# onboarding funnel

**development-period baseline, before today's fixes.** prod sessions from the last 7 days: our own testing and debugging plus a few friends, with no reliable way to tell them apart. read it as a baseline, not as how real users behave.

generated 2026-09-28 02:16 utc by `pnpm funnel` (read-only over prod sessions, aggregate only).

## headline

- **median 50s from opening the chat to the first real help** (inbox triage or a draft), across the 23 sessions that got there.
- **drop-off: took a call** (lost 37, 44% of those who reached the step before)
  - fix: call asks are benefit-first with texting as an equal yes, an unanswered offer gets "no pressure, texting works just as well" (ef635c0, 8ff806f); "no calls" said anytime stops offers and rings (9d0ca20); "yes but..." is not a yes (9094426); "lol ok" rings (8ff806f)
- **drop-off: named the assistant (or took the default)** (lost 29, 23% of those who reached the step before)
  - fix: skip the name and it goes by "persona" (renameable) instead of stalling the whole flow (ef635c0, 8ff806f); a light second try with a suggestion (7b4c634); insult names get a laugh, not a lecture (9094426)
- **drop-off: connected gmail (real or demo)** (lost 20, 61% of those who reached the step before)
  - fix: the ask says what gmail adds for their specific need (7b4c634); google's test-user wall no longer dead-ends: a demo inbox is one tap away and offered once after a failed connect (9be09db)

## funnel

n = 126 sessions that sent at least one message. another 64 only opened the page (refreshes, link previews, a look without typing) and aren't in the funnel. 25 e2e test or empty sessions left out.

| step | reached | of those who texted | from previous step | dropped here |
|---|---|---|---|---|
| sent a first text | 126 | 100% | - | - |
| named the assistant (or took the default) | 97 | 77% | 77% | 29 |
| was offered a call | 85 | 67% | 88% | 12 |
| took a call | 48 | 38% | 56% | 37 |
| told us their name | 42 | 33% | 88% | 6 |
| said what they need help with | 33 | 26% | 79% | 9 |
| connected gmail (real or demo) | 13 | 10% | 39% | 20 |
| finished setup or graduated early | 13 | 10% | 100% | 0 |
| (opened only, never texted) | 64 | not in the funnel | - | - |

| metric | value |
|---|---|
| median time to first value (chat opened to inbox triage or a draft) | 50s (23 sessions got there) |
| median turns per session | 6 |
| calls | 77, 33 ended by the user before a goodbye |
| took the default name ("persona") | 0 |
| gmail via the demo inbox | 0 of 13 |
| graduated early (skipped the rest) | 10 |
| $ per session (where metered) | $0.0085 over 1 |

the fixes above shipped after almost all of these sessions, so their effect shows in [FUNNEL-after-fixes.md](FUNNEL-after-fixes.md) (`pnpm funnel --since <iso date>`), not here.
