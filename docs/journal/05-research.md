# 05. what the research changed

*sept 27, 2026*

i spent a chunk of today reading actual studies instead of blog advice, on four questions: how to redirect people without sounding scripted, how to ask for something as big as gmail access, how much you can really read into short texts, and how long a voice agent should wait. some of it confirmed what i'd already built. some of it made me change numbers i'd picked by gut.

## 1. redirecting without sounding scripted

the solid finding here is about concreteness. in packard and berger's study of real service calls, agents who used more concrete language got noticeably happier customers, and customers read concrete language as a sign the agent was actually listening. a related paper found agents saying "i" did better than agents saying "we", while leaning on "you" did little or even hurt.

the practitioner rules that line up with that: one empathy phrase per response, max, because stacking them sounds robotic. and a test i love: read the sentence back and ask whether it could have been sent to anyone else. if it could, it's a script.

so the pattern i gave the agent is: a few words that name their actual point, a bridge, then one concrete next step, and a promise to come back to their topic if i'm parking it. "good question, i'll come back to that right after this." the "playback" move ("so you want x, right?") is in there too for when it's not sure what they meant.

**changed in code:** a "steering back" section in `src/lib/prompt.ts` (concrete, "i" not "we", one empathy phrase, the could-this-go-to-anyone test, playback).

## 2. asking for gmail

brown and levinson's politeness theory weighs a request by social distance, relative power, and how big the imposition is. inbox access, from something you met two minutes ago, is about as big as it gets. that calls for what they call negative politeness: be a little indirect, give reasons, minimize the imposition, make it easy to say no.

what the evidence says about which of those actually matter:

- **give a reason.** in tan et al.'s study of 772 smartphone users, approval of permission requests went up when an explanation was shown. the uncomfortable part: the content of the explanation didn't seem to matter, so a vague reason "works" as well as an honest one. i'm not leaning on that. earlier work found people were more comfortable when the purpose was explained, and comfort is what stops them from revoking access later. so the agent says exactly what it'll do and why.
- **make no easy.** give a real alternative, so declining doesn't end the conversation: "or you can just paste an email here instead."
- **minimize only if it's true.** "just" is a minimizing move. fine for honest scoping, not fine for making a broad permission sound small. my app asks for read only gmail, so the honest version is "it's read only, and i won't send anything without asking", not "i'll only peek at one thread".
- **hedge lightly, don't apologize.** heavy indirectness isn't always seen as more polite, and clarity is part of politeness. one "can i" or "want to" is plenty. apologies make the ask feel bigger.

the line this adds up to: "so i can pull up those recruiter threads and draft replies, i'd need read access to your gmail. it's read only and i won't send anything without asking. want to connect it, or just paste an email here instead?"

**changed in code:** an "asking for gmail" section in `src/lib/prompt.ts`.

## 3. reading mood from short texts

the sobering baseline: in kruger et al. (2005), people reading emails got the tone (sarcastic or not) right only about half the time, basically chance, while believing they were right about 90% of the time. if people are that bad at it, my little regex gauge has no business being confident.

what the studies do support:

- a period on a one word reply ("ok.", "nope.") reads as less sincere or more abrupt (houghton, upadhyay and klin 2018). but only on short replies; in a long message a period is just grammar.
- exclamation marks read as more sincere (gunraj et al. 2016).
- letter stretching ("sooo", "noooo") signals strong feeling but not which direction; the word itself carries that (brody and diakopoulos 2011).
- emoji are weaker than they look. people disagree on whether the same emoji is positive, neutral or negative about a quarter of the time, more across platforms (miller et al. 2016).
- "k", a lone "?", all caps: no controlled studies, so i treat them as heuristics. "k" after a long message from me probably means rushed or checked out. a lone "?" probably means confused. all caps only counts as annoyance if it isn't an acronym or a single emphasized word.
- short replies should be judged against that person's own usual length, because some people always text short.

**changed in code:** `src/lib/mood.ts` was rewritten. it now scores weighted signals, compares brevity to the user's own baseline, ignores acronyms and single emphasized words as shouting, gives emoji a tiny weight, treats stretching as intensity only, and outputs a confidence that is "low" unless several signals agree. the agent sees it as a "low confidence guess" and is told to trust their words over the guess. new smoke checks cover one emoji not flipping the mood, "OK that's HUGE" not being shouting, a lone "?" reading confused, and "nah" staying low confidence.

## 4. voice timing

this one changed my numbers the most.

across ten languages, most gaps between turns land between 0 and 200 ms (stivers et al. 2009). gaps of around 600 to 700 ms and up start to signal hesitation or a "no" coming (kendrick and torreira 2015), and jefferson proposed about one second as a "standard maximum" silence in conversation. my 1.3 second end of turn wait was about six times the human norm. it avoided cutting people off, but it would make the agent feel slow and unsure.

the catch is that people predict when a turn is ending from what's being said, and a timer can't. the industry answer is a short wait plus some awareness of content: openai's realtime api defaults to 500 ms of silence, assemblyai waits about 400 ms when it's confident a turn is done and longer when it isn't, and they recommend waiting longer while people spell out emails or numbers.

for the silence check-in, koudenburg et al. (2011) found four seconds of silence after a statement made people feel rejected, even when they didn't consciously notice it. that was a group setting, so it doesn't transfer directly, but it suggests 4 to 6 seconds is where silence starts to mean something. 10 seconds after a simple question is long. and when i've asked them to go do something (sign in to google), even 10 seconds is impatient.

**changed in code** (`src/app/useVoiceCall.ts`, `src/lib/engine.ts`):
- end of turn is now about 0.7 s when they sound finished, 1.5 s when they trail off mid phrase ("and my...", "so", "um"), and 2 s while spelling things out (digits, "at", "dot", "my email is").
- the first silence reprompt comes at about 6 s instead of 10.
- while they're doing the gmail sign in during a call, the silence window stretches to 30 s so the agent doesn't nag.
- the first reprompt no longer says "still there?", which checks up on them. it offers help: "take your time. want me to say that again?"
- the spoken "mm, one sec" filler stays. there's a hypothesis that fillers make the silence that follows more acceptable, which fits, but it's not settled.

## what i'm taking away

the pattern across all four: be specific, be honest, and don't over-read people. a bot that's concrete, gives real reasons, holds its guesses loosely, and matches human timing will feel more human than one with a clever personality.

## sources

redirecting
- packard and berger (2021) and packard, moore and mcferran (2018), summarized at https://helply.com/blog/customer-service-phrases
- https://supportbee.com/blog/customer-service-phrases-and-sayings
- https://www.talaera.com/industry-specific-english/customer-service-speaking-skills/

politeness and permission requests
- penelope brown and stephen c. levinson, *politeness: some universals in language usage* (cambridge university press, 1987)
- negative politeness strategies list: https://merwinspy.org/journal/index.php/jeltlal/article/download/411/243 and http://awinlanguage.blogspot.com/2016/08/negative-politeness-strategies-brown.html
- joshua tan et al., "the effect of developer-specified explanations for permission requests on smartphone user behavior," chi 2014: https://dx.doi.org/10.1145/2556288.2557400 (pdf: https://people.eecs.berkeley.edu/~daw/papers/perm-chi14.pdf)
- politeness strategies in a smart display for older adults: https://arxiv.org/pdf/2203.15767
- https://www.universalclass.com/articles/business/communication-studies/politeness-theory.htm

reading tone in text
- justin kruger et al. (2005), "egocentrism over e-mail," summarized at https://amanet.org/articles/the-miscommunication-medium
- houghton, upadhyay and klin (2018), periods in text replies: https://www.sciencedirect.com/science/article/abs/pii/S0747563217306192
- gunraj et al. (2016): https://www.sciencedirect.com/science/article/abs/pii/S0747563215302181 and https://phys.org/news/2015-12-text-messages-period-sincere.html
- samuel brody and nicholas diakopoulos (2011), word lengthening: https://aclanthology.org/D11-1052/
- hannah miller et al. (2016), emoji interpretation: https://www.brenthecht.com/publications/ICWSM2016_emoji.pdf

voice timing
- tanya stivers et al. (2009), "universals and cultural variation in turn-taking in conversation," pnas: https://www.pnas.org/doi/10.1073/pnas.0903616106
- kobin kendrick and francisco torreira (2015): https://eprints.whiterose.ac.uk/id/eprint/116177/1/Kendrick_and_Torreira_2015_.pdf
- stephen levinson and francisco torreira (2015): https://pmc.ncbi.nlm.nih.gov/articles/PMC4464110/
- gail jefferson, on the "standard maximum" silence: https://liso-archives.liso.ucsb.edu/Jefferson/standard_maximum_silence.pdf, and the fillers hypothesis: https://link.springer.com/chapter/10.1007/978-3-031-06523-1_3
- namkje koudenburg et al. (2011), four second silence, summarized at https://psmag.com/social-justice/the-deep-pain-of-awkward-silences-26246/
- openai realtime vad defaults: https://developers.openai.com/api/docs/guides/realtime-vad
- assemblyai turn detection: https://assemblyai.com/docs/streaming/turn-detection and https://www.assemblyai.com/blog/turn-detection-endpointing-voice-agent

two things had no source behind them: the brown and levinson weighting is from general knowledge of the 1987 book, and my readings of "k", a lone "?", and all caps are heuristics.
