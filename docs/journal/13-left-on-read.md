# 13. left on read

*sept 27, 2026, late*

two things kept bugging me. one: if you open the chat and just... don't answer, nothing happens. the agent sits there forever. over text that's the most common thing a person does, and a friend wouldn't freeze. two: if you skip "what do you want to call me?", the call offer never shows up, because the whole flow waited on a name you weren't going to give.

and the tone still read a little like a careful assistant. i wanted it relaxed, a bit funny, and always pointing at something useful, with the reason being what *you* get out of it.

## what poke does

i looked at poke (the imessage assistant from the interaction company) because it's the smoothest texting agent i know of. not much of its real output is public, so most of this comes from its leaked prompt guidelines (unconfirmed by them, and maybe dated), plus press and reviews:

- mirror the user. lowercase if they do, match their length, and a few words in never gets a paragraph back.
- no emoji unless the user used one first.
- witty and a little sarcastic when it fits the vibe, "never force jokes".
- a banned phrase list: "how can i help you", "let me know if you need anything else", "i apologize for the confusion", "no problem at all". open with "what's up", not "how can i help you today".
- make an educated guess instead of asking the user to repeat themselves.
- proactive, but a "wait" tool quietly drops updates that would just be noise. reviewers still found about a third of its proactive texts unnecessary, which is the risk of double texting done wrong.
- the founders keep describing the goal as texting a friend: read receipts, typing indicators, being interruptible like a human.

i couldn't find how poke follows up when you leave it on read, so that part is mine.

## what changed

- **left on read.** after about 45 seconds of you not answering, the client asks the server for a double text (`text_idle`). the server picks what fits:
  - you never named it: "hey, looks like you skipped my name. i'll go by persona for now, you can rename me anytime", then the call offer, which now has somewhere to go.
  - an unanswered call offer: "no pressure on the call btw, texting works just as well."
  - the gmail link is out: "no rush on the google sign in btw." no question, you might be mid sign-in.
  - anything else: the model writes one relaxed line that either suggests a concrete next step (benefit first) or jokes about the silence. "just checking in" and "are you there" are filtered out.
  - a few minutes later, one more that asks nothing ("all good, no rush. i'm here whenever"). then quiet until you're back. two, then stop, is the line between a friend and a notification. pink calls the quality buoyancy: no is fine, keep the door open (*to sell is human*, 2012). a follow-up that asks nothing is the lowest imposition there is (brown & levinson, *politeness*, 1987).
- **skipped name in a reply.** if you answer the name question with something else ("i need help with my inbox"), it says "ha, you skipped my name. i'll go by persona for now, rename me anytime" and then answers you. i first had that bubble after the reply, but the reply already offered the call (the name unlocks it), so the order read backwards. also, "lol ok" to the call offer used to get "tap the call button whenever you're ready" (there is no button). the laugh is a reaction and the "ok" is the answer, so now it rings. a bare "hi" or "?" gets one more chance. a smart default beats a question you already dodged (thaler & sunstein, *nudge*, 2008), and "rename me anytime" keeps it yours.
- **tone.** 1 to 3 short bubbles instead of one careful paragraph. a little humor, never forced. poke's emoji rule and banned phrases. and every suggestion leads with what it gets you: "want me to give you a quick call to get you set up? way easier than typing it all out", "connect your gmail and i'll dig out the recruiter emails so you don't have to".

## checked

`pnpm smoke` has new checks for each branch: no double text seconds after its own text, the default name plus call offer, the second nudge asking nothing, quiet after that, a yes to the nudge's call offer ringing, no text nudges during a call, the skipped-name double text as the last bubble, "hi" getting another chance, and renaming the default later.
