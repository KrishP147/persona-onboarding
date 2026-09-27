# 08. the long polish

*sept 27, 2026, overnight*

the brief says it should feel conversational and survive people who don't play by the rules. by tonight the big pieces worked. what was left was a long list of small things that each made it feel a little less like a person: a reply that took five seconds, a goodbye that was never spoken, a question asked twice in a row. this entry is about those.

## sounding like persona, not like a chatbot

the real persona onboarding (journal 02) has a shape, and i copied it closely:

- the first text is theirs: who it is, what it can do, the legal line with the link, then one ask: what do you want to call me?
- once you name it, the reply is their line: "julia it is. save my contact card so you know it's me, and i'll walk you through setup on a quick call." this reply is now written by code, not the model, so it's instant and always right.
- the contact card has a save button. until you save it, the thread and the incoming call show a bare number, like a real phone. after, the persona logo and the name.
- "calling you now." then the phone rings a few seconds later, on a second phone beside the chat, so you can see both. a declined or hung up call is never followed by another one unless you ask.

## texting like a person

- your message appears the moment you send it, with receipts: one check sent, two delivered, two filled in when it's been read.
- the reply doesn't land instantly. there's a short read, then typing, and longer messages take a little longer. the time the server spends thinking counts toward it, so it never feels doubly slow.
- 👀 shows up only on long messages, as a sign it's actually reading.
- once in a while, when a whole reply would just be "okay" or "haha", it sends a gif instead. every gif was checked by hand, frame by frame, so nothing reads as sarcastic, and code limits how often.

## taking a back seat

the most repeated feedback was that the agent talked too much and asked too much. the fixes were mostly in code:

- after it asks something, the next turn just responds. no question.
- off to the side questions get answered and left alone if it asked recently.
- the "dig into the last time it happened" move from the mom test only fires when the need is still vague. if you already gave the details, asking more feels like a form.
- on a call it says one short thing and waits, and it listens with shorter pauses (deepgram tells it when you've stopped).

## honesty

the strict grader kept finding the same thing: the agent pretending to work. "calling the dentist now." made-up flight prices. "give me one sec" followed by nothing. some of that was my fault: an old prompt line literally suggested saying "give me one sec". now every turn carries a reminder that during setup it can't browse, check prices, or call businesses, and code keeps words and actions in sync: if it says a link is in your texts, the link gets sent.

## listening with a second pair of ears

the talking model sometimes said "julia it is" without saving the name, or missed "actually call me cj". now a second, small pass reads every message for names, needs, and refusals while the reply is being written, so it costs no extra wait. corrections win, and a refusal is recorded so it's never asked again.

## what a code review found

i had a separate agent review the client code cold. the worst finding: every goodbye the agent said on a call was silently dropped. the hangup was queued before the goodbye's audio, so the call just cut out, which is exactly the "vanishing" the whole design is against. the fix was one line (play speech before hanging up), and there's now a browser test that sits silent on a call and checks the goodbye is heard before the line drops.

it also found: a call you hang up while it's still connecting kept going, image sends always failed (a 64kb browser limit), a tab switch could wipe a message in flight, and on phones the call covered the texts with no way back. all fixed.

a second review, of the server logic, found the subtler ones:

- every question mark was counted as asking for whatever slot came next, so "want me to call?" three times could quietly use up the name ask. now a question is credited to what the move was actually about.
- almost any short reply to "what do you want to call me?" became the assistant's name, including "lol" and "i'm dana". now "i'm dana" is taken as their name (which is what they meant), and fillers aren't names.
- saying "yeah" to the agent's own "want to skip setup?" was refused. now it isn't.
- "no, text is fine" after a call offer wasn't remembered as a no. now it is, same as tapping decline.
- a model that said "calling you now!" alongside a call that code refused would send both. words written next to a failed action are dropped now.
- after the agent hung up on a silent call, the text said "got cut off", which blames the line for something it did itself.

## the night the quota ran out

halfway through the night, every reply turned into "sorry, i lost my train of thought". nothing was wrong with the code. gemini's free tier counts requests per model per day, and the limits are tiny: twenty a day for the newest flash models, five for one of them, five hundred for the light one. a single test run of fifteen simulated users is about three hundred requests. i'd spent the demo's whole day of quota testing it.

what changed:

- the agent walks a chain of models, fastest first, and remembers which ones are out of quota so a spent model never adds delay.
- background helpers (the second pair of ears, the voice picker) only use the light model's quota, never the agent's, and have offline fallbacks.
- test runs now use claude for the simulated users and the grader, paced one at a time.
- in production, if every gemini model is spent, claude answers instead, with a hard cap on turns per day and in total, so the demo keeps working and the cost stays bounded.

the lesson is an old one: the demo is the product. anything that can take it down, including my own testing, has to be treated like an outage.

## how it's tested now

- `pnpm e2e` drives real chrome with a fake microphone through the whole flow: 25 checks, from "your message appears instantly" to "the goodbye is spoken before hanging up".
- `pnpm harness` runs fifteen difficult simulated users. the agent runs on gemini; the simulated users and the grader run on claude, which is stricter and keeps gemini's free per minute quota for the agent. runs are paced, one user at a time.

## sources

- persona's real onboarding, tested sept 26 (journal 02)
- rob fitzpatrick, *the mom test* (2013): ask about specifics, but talk less and listen more
- h. p. grice, "logic and conversation" (1975): quantity, say as much as needed and no more
- cathy pearl, *designing voice user interfaces* (2016): silence handling and never leaving without a goodbye
- will guidara, *unreasonable hospitality* (2022): the small things are the hospitality
