# 03. principles: serve, don't sell

*sept 27, 2026*

the brief says onboarding should "show how we can provide value." the easy mistake is to read that as a sales pitch: tell them what persona can do, then ask for their stuff. i think it's the opposite. the experience should be so helpful, so quickly, that handing over a name or connecting gmail feels like part of being helped. nobody should feel sold to.

this entry is where i collected the ideas that shaped the bot, where they come from, and where they live in the code. a principle only counts if it changes a behavior, so each one points at something real.

## the core idea

**daniel h. pink, *to sell is human* (2012).** pink's argument is that most of us spend our days moving other people, and the old pushy model of selling doesn't work anymore because people have as much information as we do. what works is his abc: **attunement** (see it from their side), **buoyancy** (stay steady through rejection), and **clarity** (help them see their situation in a new way, and find the right problem, not just solve the stated one). he also talks about serving: make it personal, make it purposeful.

in the bot:
- attunement is the mood gauge (`src/lib/mood.ts`). every turn, a cheap read of how the person is showing up (cooperative, rushed, curious, resistant, confused, playful) changes the agent's approach. a rushed person gets compressed and offered a skip. a resistant person gets space and something useful with no strings attached.
- buoyancy is the refusal handling. if someone declines the call or won't give their name, the agent doesn't sulk, repeat itself, or guilt them. it notes it, never asks again, and keeps being helpful (`decline_slot`, and the max two asks rule in `src/lib/policy.ts`).
- clarity is the "help with it now" move. once we know what they need, the agent does a small real piece of it instead of describing features.

**rob fitzpatrick, *the mom test* (2013).** written for founders interviewing customers, but it's the best guide i know for asking people useful questions. the three rules: talk about their life instead of your idea, ask about specifics in the past instead of opinions about the future, and talk less and listen more. also: compliments and "sounds cool!" are not signal.

in the bot:
- the need question is about their life, not our product. "what ate your time this week?" beats "would you use an assistant for email?" (system prompt, "how you treat people").
- one question per message, short turns, especially on calls, so they do most of the talking.
- it pulls answers out of whatever they say instead of making them answer our questions in our order.

## how people like to be treated

**dale carnegie, *how to win friends and influence people* (1936).** old, but it holds up because it's about people, not technology.

| carnegie | in the bot |
|---|---|
| a person's name is to that person the sweetest and most important sound in any language | uses their name once it has it, naturally, not every message |
| talk in terms of the other person's interests | every ask is framed by what they get ("so i can catch those recruiter emails for you") |
| let the other person do a great deal of the talking | one question at a time, short spoken turns |
| begin in a friendly way, get them saying yes early | opens with the easiest, most fun ask: naming the agent |
| never tell someone they're wrong | name changes and typos get "luna it is", never a correction |
| if you're wrong, admit it quickly | dropped call: "looks like i lost you, my bad" |
| let the other person feel the idea is theirs | graduation is offered, never forced |

**chris voss, *never split the difference* (2016).** voss is a former fbi hostage negotiator, and his core idea is tactical empathy: show you understand how someone feels before you ask anything. the tools i borrowed: labeling a feeling out loud ("totally fair"), calibrated what and how questions instead of yes or no traps, and what he calls an accusation audit, which is naming the objection before they have to. gmail is the obvious place for that one: "you might be wondering why an assistant wants your email" goes a long way.

**robert cialdini, *influence* (1984).** i'm using two of his principles and deliberately skipping the rest. reciprocity: give value first, so asking feels fair. commitment and consistency: a small easy yes (naming the agent) makes the next step feel natural. what i'm not using is scarcity or pressure. "only 2 spots left" energy is exactly what makes something feel like a sale.

## what onboarding is actually for

**samuel hulick, *the elements of user onboarding* (2014)**, and **kathy sierra, *badass: making users awesome* (2015).** both make the same point from different angles: people don't want your product, they want to be better at something in their own life. onboarding isn't a tour of features, it's the first moment the person gets a little more capable. that's why graduation exists. if someone shows up knowing what they need, the best onboarding is getting out of the way and helping.

**matthew dixon, nick toman, rick delisi, *the effortless experience* (2013).** their research on customer service found that reducing effort drives loyalty more than trying to delight people. for us: never make someone repeat themselves, never re-ask something we have, carry context from text to call and back, and anticipate the next question (they call it next issue avoidance). the recap text after a call is exactly that: it answers "wait, what happens now?" before they ask.

**will guidara, *unreasonable hospitality* (2022).** from running eleven madison park. the distinction that stuck with me: service is getting the technical part right, hospitality is how you make someone feel. a bot can collect four fields correctly and still feel cold. the goodbye before hanging up, using their name, owning a dropped call: those are hospitality.

## how conversation works

**h. p. grice, "logic and conversation" (1975).** grice's cooperative principle says good conversation follows four maxims: say as much as needed and no more (quantity), say what's true (quality), stay relevant (relation), and be clear (manner). the short bubble rule, never claiming something it didn't do, and answering off topic questions before steering back all come from here.

**cathy pearl, *designing voice user interfaces* (2016).** practical voice design: when there's no input, escalate gently instead of repeating the same prompt, confirm what matters, let people interrupt, and don't make them hold options in their head. that's where the silence ladder comes from ("you still there? no rush" then a simpler rephrase then "i'll text you instead", then a real goodbye).

**clifford nass and scott brave, *wired for speech* (2005).** their research showed people respond to computer voices socially, the way they respond to people, and that consistency between a voice and its personality matters for trust. a voice that changes gender halfway through, or doesn't match the name you just chose, quietly breaks that. hence the locked voice.

## a little on habits

**nir eyal, *hooked* (2014).** his model ends with investment: people value what they've put something into. naming your agent is a tiny investment, which is probably why persona asks for it first. i kept that order.

## the line i keep coming back to

stop asking "how do i get their info" and ask "what would a great human assistant do on day one?" they'd introduce themselves, ask what you want to call them, ask what's stressing you out, start helping right away, ask before touching your stuff, and never just disappear mid conversation. everything in this project is trying to be that person.

## where to find it in the code

- system prompt with the principles: `src/lib/prompt.ts`
- mood gauge and what each mood changes: `src/lib/mood.ts`
- nudge budget, call offers, graduation: `src/lib/policy.ts`
- guaranteed goodbye and recap, silence ladder: `src/lib/engine.ts`
- full reading list: [../reading-list.md](../reading-list.md)
