# loom script: the approach (about 5 minutes)

open https://persona-onboarding-omega.vercel.app in chrome on a wide screen (the "why it said that" panel shows at 1280px and up). use the mute button on the call whenever you talk to the camera.

## 0. the thesis (20s)

- "onboarding is the first conversation with your assistant. if it feels like a form, you've already lost them. so i built it around two things: making it **human**, and making it a **good conversationalist**."
- "human is how it feels: timing, emotion, silence, a voice that fits. good conversationalist is what it says: acknowledging you, asking the right one or two questions, and making the ask at the right moment. the model writes the words; code guarantees the moves."

## 1. human (90s)

show it on a call while you say each point.

- **timing.** a normal gap between turns is about 200 ms (stivers et al., 2009). it answers fast when you sound finished, and waits longer when you trail off or spell something out.
- **thinking out loud.** when a reply is actually slow, it says "hmm" or "let me think that through for a second", like a person does (clark & fox tree, 2002). a fast reply gets no filler.
- **comfortable with silence.** it doesn't fill quiet. after 20 seconds it checks in once, and if it's still quiet it says "i'm going to hang up now, i'll text you" and does. say "hold on" and it waits a minute and a half.
- **interruptions.** talk over it and it stops right away. it also knows which part of its line you actually heard, so it never says "as i said" about the part you cut off.
- **emotional cues.** it reads your mood from what you type or say (rushed, confused, resistant, curious), with a confidence level, and adapts: shorter when you're rushed, slower when you're confused. it reflects how you feel before it fixes anything ("ugh, that sounds exhausting").
- **a voice that fits.** the voice is chosen from the name you gave it, locked for the whole call, and the same next time. persona's own julia had a masculine voice.
- **warm when you reach out.** call it yourself and it says "really good to hear from you. what's going on?" no agenda, and it doesn't bring up old topics unless you do.
- **honest.** it sounds human but never claims to be one. ask, and it says it's an ai. google duplex drew a backlash in 2018 for passing as human.

## 2. good conversationalist (90s)

point at the "why it said that" panel. every message shows the move it made and the source behind it.

- **acknowledge first.** it plays your own words back before it moves on (voss, 2016), and uses your name the way carnegie says people like (1936).
- **the mom test, but only a little.** one question about a real recent moment ("what did missing that interview actually look like?") (fitzpatrick, 2013). after that it stops asking. this is onboarding for someone who already signed up, not customer discovery. more questions just make it a form (journal 09).
- **give before you ask.** some real help comes first, then the gmail ask (cialdini, 1984).
- **ask while it hurts.** the gmail offer comes on the call, right when you're describing the problem, with the reason tied to what you said: "want me to text you a link to connect your gmail, so i can actually help with the recruiter emails?" if you ask "what can you do?", it offers straight away.
- **sales, the good kind.** pink's *to sell is human* (2012): attunement (it's their topic, not yours), clarity (one specific next step), and offramps (an easy yes, and an easy no). declining is always fine, and it never asks twice.
- **clarify, don't assume.** if what you said could mean two things, it asks one specific question ("the recruiter emails, or the interview scheduling?") (clark & brennan, 1991).
- **it does real things, honestly.** it looks things up on the web, reads your inbox, and drafts and sends email, but only after you've seen the draft and clearly said "send". before gmail is connected it tells you plainly it's not sent.

## 3. what's better than persona's real onboarding (60s)

i went through their onboarding myself first (journal 02). the gaps were all at the seams, so that's where the work went:

| persona today | this version |
|---|---|
| after i hung up, nothing came. it never knew the call ended | hangups are events. a recap text always follows the call, written by code if the model fails |
| no goodbye before the call ends | it always says a real goodbye, with your name and what happens next |
| named julia, but the voice was masculine | the voice is picked from the name and locked |
| renaming made a second contact card | one card, updated in place |
| long, hedging answers to meta questions | short bubbles, never talks about its own internals |
| the gmail link just showed up mid-call | a spoken ask with a reason, at the moment you describe the problem, and the link lands in the texts |
| it wouldn't call until you saved its contact | no gate. it asks permission, and no is an easy answer |
| it said it could do things it couldn't | it only promises what its tools can do right now, and "sent" means actually sent |

## 4. how i know it holds up (30s)

- stress tested: people who won't give a name, hang up, go silent, change their minds, or just say "haha". fifteen simulated difficult users, graded by a strict model (`pnpm harness`), a real browser walkthrough with a fake mic (`pnpm e2e`), and 23 manual scripts.
- the reasoning and the sources are in the journal (docs/journal, 01 to 10).
