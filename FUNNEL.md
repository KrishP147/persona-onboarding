# onboarding funnel (real users, prod)

generated 2026-09-28 02:11 utc by `pnpm funnel` (read-only over prod sessions, aggregate only). sessions expire after 7 days, so this is the last week. 25 test or empty sessions left out.

**n = 190 sessions**

| step | reached | of opened | from previous step | dropped here |
|---|---|---|---|---|
| opened the chat | 190 | 100% | - | - |
| sent a first text | 126 | 66% | 66% | 64 |
| named the assistant (or took the default) | 97 | 51% | 77% | 29 |
| was offered a call | 85 | 45% | 88% | 12 |
| took a call | 48 | 25% | 56% | 37 |
| told us their name | 42 | 22% | 88% | 6 |
| said what they need help with | 33 | 17% | 79% | 9 |
| connected gmail (real or demo) | 13 | 7% | 39% | 20 |
| finished setup or graduated early | 13 | 7% | 100% | 0 |

| metric | value |
|---|---|
| median time to first value (chat opened to inbox triage or a draft) | 50s (23 sessions got there) |
| median turns per session | 3 |
| calls | 82, 33 ended by the user before a goodbye |
| took the default name ("persona") | 2 |
| gmail via the demo inbox | 0 of 13 |
| graduated early (skipped the rest) | 10 |
| $ per session (where metered) | $0.0085 over 1 |

## biggest drop-offs

- **sent a first text**: lost 64 (34% of those who got to the step before)
  - what changed: left on read gets one relaxed double text after ~45s, then a lighter one, then quiet (ef635c0, journal 13); the scripted intro ends on one easy ask, "what do you want to call me?"
- **took a call**: lost 37 (44% of those who got to the step before)
  - what changed: call asks are benefit-first with texting as an equal yes, an unanswered offer gets "no pressure, texting works just as well" (ef635c0, 8ff806f); "no calls" said anytime stops offers and rings (9d0ca20); "yes but..." is not a yes (9094426); "lol ok" rings (8ff806f)
- **named the assistant (or took the default)**: lost 29 (23% of those who got to the step before)
  - what changed: skip the name and it goes by "persona" (renameable) instead of stalling the whole flow (ef635c0, 8ff806f); a light second try with a suggestion (7b4c634); insult names get a laugh, not a lecture (9094426)

most of these sessions predate the changes above, so their effect shows up in the next run of this script, not this one. "opened" also counts refreshes, link previews and our own checks, so the first drop-off reads worse than it is.
