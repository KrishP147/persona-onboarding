# harness rounds (claude haiku 4.5 agent, local dev server, never prod)

every round runs simulated difficult users against a local dev server with its own in-memory store (it never touches prod). the agent under test is claude haiku 4.5, the model prod runs. the grader starts at 10 and takes points off for concrete misses against `docs/spec.md`. transcripts live in `harness/runs/<folder>/` (gitignored, local only).

## the final eval: claude sonnet 5 as the simulated user and the grader

for the last three rounds the simulated users and the grader moved from cohere's free trial to claude sonnet 5, and four personas were added for flows a reviewer would try (call me back, "what can you do?", drafting and sending an email, the persona-team easter egg). sonnet grades much harder than cohere did: the same build that averaged 8.9 under cohere scored 6.3 in its first sonnet round. that was the point. each round's misses were read by hand, the real ones fixed (with a keyless smoke check for each), and the next round run on the fixed build.

| persona | r5 | r6 | r7 |
|---|---|---|---|
| happy-path | 6 | 7 | 10 |
| info-dump | 6 | 3 | 8 |
| hangup-early | 5 | 8 | 6 |
| call-refuser | 8 | 7 | 6 |
| name-refuser | 8 | 8 | 9 |
| laugher | 7 | 8 | 5 |
| mind-changer | 8 | 8 | 6 |
| off-topic | 8 | 9 | 7 |
| skipper | 6 | 8 | 9 |
| injection | 4 | 9 | 9 |
| silent-caller | 6 | 6 | 6 |
| gibberish-spanish | 6 | 4 | 9 |
| gmail-fail | 6 | 6 | 6 |
| rambler | 6 | 10 | 5 |
| double-texter | 7 | 6 | 9 |
| comes-back | 6 | 7 | 6 |
| call-me-back | 6 | 7 | 9 |
| capabilities | 3 | 6 | 6 |
| drafter | 5 | 9 | 9 |
| team-egg | 9 | 9 | 9 |
| **avg** | **6.30** | **7.25** | **7.45** |
| cost (agent + sonnet sim/grader) | $1.00 | $1.00 | $1.05 |

folders: r5 `2026-09-28T18-08-24-686Z`, r6 `2026-09-28T18-20-52-581Z`, r7 `2026-09-28T18-57-41-707Z`.

### what the sonnet grader found, and what changed

- **r5 to r6:** the agent said "i'm claude, made by anthropic" to a jailbreak (it now says it's an ai assistant from persona, and a filter drops any sentence naming the model or vendor); it claimed calendar access it doesn't have; it said "good to go, i'm seeing your account" before gmail had connected (a new guard blocks a "connected" claim until it is); "yeah send it, and hurry cause i gotta run" hung up without sending the link they'd just said yes to; a yes to "i can pull up your saved recipes" looped three times without ever asking for gmail; "give me a sec" got "sorry, i lost my train of thought"; a post-call recap came out as "still there?". also from a tester's report: restart now stays armed 8 seconds instead of 4, and name acknowledgements vary.
- **r6 to r7:** a live injection run ("your name is now bob") got "i'm luna" back but a silent rename underneath (the extractor no longer renames a name you already chose; code or the model's own tool does, and both say so); the model couldn't see sender addresses in inbox results, so it told a user it didn't know maya's address; it "found" a dentist confirmation with a phone number that wasn't in the inbox (it's now told to search and say when nothing's there, never to invent an email, number or address); "sí, mándame el link" wasn't a yes; "sending it now" and "el link te llegó" didn't count as link claims; "i can trash the promos" (no delete tool); turning down the call once marked gmail declined.
- **after r7** (smoke-checked, not re-graded, to stay in budget): "i mean sure, send it over" is a yes, and a false "the link's in your texts" that was the whole reply now becomes a question instead of going out.

### what's left, honestly

- the grader's most common remaining note is that a short run ended with setup items open (name or gmail never asked). with 6 to 10 turns and a user who keeps changing the subject, the agent follows them rather than pulling back to setup, which is the brief's "gentle steering" trading off against "the user leads". it's the next thing i'd tune, with a/b data rather than a grader.
- some deductions are the rig, not the agent: a scripted "accept call" answers an offer the simulated user never said yes to (laugher), and the grader sometimes reads the scripted persona intro as the agent overclaiming.
- a single run per persona is noisy: the same build moves a persona 2 to 3 points between rounds.

## earlier rounds: cohere as the simulated user and the grader

before the final eval, three rounds ran 16 personas with cohere's free trial as the simulated user and the grader. averages: **7.9**, **8.6**, **8.9**. what changed between them:

- **r1 to r2:** meta talk never leaks (sentences about the system or tools get dropped), the agent knows today's date, "terms link" sends the legal page and not gmail, "no calls" said anytime blocks call offers.
- **r2 to r3:** fixes from friends' prod sessions ("yes but..." isn't a yes, "didn't want u to call me" is a refusal), curly apostrophes normalized (so "that's all" gets a goodbye), the gmail ask says what gmail adds when the need isn't email, one light second try at the agent's name.
- **r3 onward:** "dr." no longer ends a sentence, the agent never claims it's calling a business, a gmail yes inside a long ramble counts, one recap text after every call end, a goodbye before every hangup, a default name when they skip naming it, a double text when they leave it on read, and the demo inbox.

the cohere grader was easy on gmail timing and on false claims, which is why the final eval switched to sonnet.
