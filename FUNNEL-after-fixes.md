# onboarding funnel

**sessions since 2026-09-28 03:00 utc**, after the fixes below. still a small sample: friends trying it, possibly some of our own checks.

generated 2026-09-28 20:07 utc by `pnpm funnel --since ...` (read-only over prod sessions, aggregate only).

## headline

- **median 3.3 min from opening the chat to the first real help** (inbox triage or a draft), across the 4 sessions that got there.
- **drop-off: took a call** (lost 19, 79% of those who reached the step before)
  - fix: call asks are benefit-first with texting as an equal yes, an unanswered offer gets "no pressure, texting works just as well" (ef635c0, 8ff806f); "no calls" said anytime stops offers and rings (9d0ca20); "yes but..." is not a yes (9094426); "lol ok" rings (8ff806f)
- **drop-off: named the assistant (or took the default)** (lost 4, 13% of those who reached the step before)
  - fix: skip the name and it goes by "persona" (renameable) instead of stalling the whole flow (ef635c0, 8ff806f); a light second try with a suggestion (7b4c634); insult names get a laugh, not a lecture (9094426)
- **drop-off: said what they need help with** (lost 2, 50% of those who reached the step before)
  - fix: the post-hangup pass fills a need said on the call but missed (9e600f9); "the user leads" follows their topic instead of digging (journal 12)

## funnel

n = 30 sessions that sent at least one message. another 5 only opened the page (refreshes, link previews, a look without typing) and aren't in the funnel. 217 e2e test, empty or pre-cutoff sessions left out.

| step | reached | of those who texted | from previous step | dropped here |
|---|---|---|---|---|
| sent a first text | 30 | 100% | - | - |
| named the assistant (or took the default) | 26 | 87% | 87% | 4 |
| was offered a call | 24 | 80% | 92% | 2 |
| took a call | 5 | 17% | 21% | 19 |
| told us their name | 4 | 13% | 80% | 1 |
| said what they need help with | 2 | 7% | 50% | 2 |
| connected gmail (real or demo) | 2 | 7% | 100% | 0 |
| finished setup or graduated early | 2 | 7% | 100% | 0 |
| (opened only, never texted) | 5 | not in the funnel | - | - |

| metric | value |
|---|---|
| median time to first value (chat opened to inbox triage or a draft) | 3.3 min (4 sessions got there) |
| median turns per session | 5 |
| calls | 9, 7 ended by the user before a goodbye |
| took the default name ("persona") | 7 |
| gmail via the demo inbox | 2 of 2 |
| graduated early (skipped the rest) | 2 |
| $ per session (where metered) | $0.0319 over 29 |
