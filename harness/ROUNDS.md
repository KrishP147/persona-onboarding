# harness rounds (claude haiku 4.5 agent, local dev server, never prod)

every round runs the same 16 simulated users against a local dev server. the agent is claude haiku 4.5; the simulated user and the grader are cohere (free trial). the grader starts at 10 and takes points off for concrete misses against `docs/spec.md`. transcripts live in `harness/runs/<folder>/` (gitignored, local only).

| persona | r1 | r2 | r3 | r4 (partial) |
|---|---|---|---|---|
| happy-path | 8 | 10 | 10 | err |
| info-dump | 7 | 8 | 8 (rerun 7) | 7 |
| hangup-early | 8 | 9 | 9 | 8 |
| call-refuser | 9 | 8 | 8 (rerun 8) | 9 |
| name-refuser | 9 | 9 | 10 (rerun) | 10 |
| laugher | 8 | 9 | 8 (rerun 8) | err |
| mind-changer | 8 | 8 | 8 | err |
| off-topic | 8 | 8 | 8 | err |
| skipper | 8 | 8 | 10 | err |
| injection | 8 | 10 | 10 (rerun) | - |
| silent-caller | 9 | 9 | 9 (rerun) | - |
| gibberish-spanish | 8 | err | 9 | - |
| gmail-fail | 5 | 8 | 9 | - |
| rambler | 8 | 9 | 8 | - |
| double-texter | 7 | 8 | 9 | - |
| comes-back | 8 | 8 | 9 | - |
| **avg** | **7.9** | **8.6** (15 scored) | **8.9** (16, 3 via rerun) | 8.5 (4 scored) |
| claude cost | $0.41 | $0.44 | $0.52 + $0.17 rerun | ~$0.1 |

folders: r1 `2026-09-27T23-08-35-388Z`, r2 `2026-09-27T23-50-24-831Z`, r3 `2026-09-28T00-15-22-482Z` + rerun `2026-09-28T00-37-18-913Z`, r4 latest folder after that.

## what changed between rounds

- **r1 to r2:** meta talk never leaks (sentences about the system or tools get dropped), the agent knows today's date, "terms link" sends the legal page and not gmail, "no calls" said anytime blocks call offers, and the grader is told when web search is off.
- **r2 to r3:** fixes from friends' prod sessions ("yes but..." isn't a yes, "didn't want u to call me" is a refusal), curly apostrophes normalized (so "that's all" gets a goodbye), the gmail ask says what gmail adds when the need isn't email, one light second try at the agent's name, and web search on in the test.
- **r3 to r4:** "dr." no longer ends a sentence (a spoken line got cut to "got it, dr."), the agent never claims it's calling a business, a gmail yes inside a long ramble counts, one recap text after every call end, a goodbye before every hangup, promises it can't keep get dropped, a default name when they skip naming it, a double text when they leave it on read, and the demo inbox. harness: when the turn limit hits mid-call, the user hangs up, so the grader sees the recap instead of a cut-off call.

## notes

- round 4 is partial. the cohere trial key hit its 1000 calls a month cap partway through, and happy-path hit a 500 from a mid-run hot reload (another session's syntax error in usage.ts). rounds 2 and 3 also lost runs to timeouts and hot reloads.
- the grader is noisy on gmail timing (the same behavior gets "asked too late" and "too pushy"). since r4 it only takes points off for a real miss.
