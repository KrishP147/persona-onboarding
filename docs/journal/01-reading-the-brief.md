# 01. reading the brief (and then reading it again)

*sept 26 to 27, 2026*

the brief, boiled down: build an onboarding that gets a name for the agent, a name for the user, a connected gmail, and something the user could use help with. try to do all of it except the agent's name over a phone call. stay adaptive to text. people won't play by the rules, and they're going to stress test it. it shouldn't feel like a form. think about what onboarding is actually for, which is showing value, and let people "graduate" early if they already know what they want. a web simulator with voice is fine.

## first read: this is an engineering problem

my first instinct was to treat it like a systems build. i went straight to stacks: realtime voice apis, a python voice server, twilio for a real phone number, parsing images and videos and voice notes because the real persona does that. i priced everything out per minute. i had a 48 hour timeline with lanes.

none of that was wrong exactly, but looking back it was me answering "what could i build" instead of "what are they asking".

## second read: after trying the real thing

then i went through persona's actual onboarding on my phone (android, so rcs, not imessage). that changed things more than any amount of planning. the parts that bugged me weren't missing features. they were moments. i hung up the call and nothing happened, no text, nothing, and when i asked why, the agent told me it never got a signal that i'd hung up. i named it julia and it called me with a man's voice. i renamed it and ended up with two contacts. it answered some questions with long hedgy paragraphs about "documentation" that made it feel like a system instead of a someone. (more in [02](02-trying-their-onboarding.md).)

every one of those is a feeling problem, not a capability problem.

## third read: this is a design challenge

so i went back to the brief line by line and asked what each sentence is testing:

- "people won't play by the rules" and "i will be stress testing this": robustness. this is the only thing they said they'd test hands on, so it's the core.
- "it shouldn't feel like a form": conversation design. can i make an ai feel like a thoughtful person.
- "think about what the onboarding is trying to do, show how we can provide value": product judgment. do i understand why onboarding exists, beyond filling fields.
- "keep the user on track... gently steer them without being overbearing": the balance. firm on what matters, loose on everything else.
- "a web simulator with voice will suffice": permission to not overbuild.

that last one is the tell. they're not grading infrastructure. they're grading how it feels to be onboarded, and whether it survives someone trying to break it.

## what i cut, and why

- media parsing (images, video, voice notes): the real product does it, the brief doesn't ask for it.
- a real phone number: explicitly not needed. maybe later if everything else is solid.
- a full "main experience": graduation just needs to land somewhere real. the same agent, now in plain assistant mode, is enough.
- reading the inbox: connecting gmail is the ask. doing something with it is a nice touch, not the job.

what i kept but made invisible: a stress test harness that throws simulated difficult users at the bot and grades the transcripts. it's not product scope. it's how i hold myself to "withstand any sort of user error" instead of hoping.

## the one sentence version

the goal isn't to collect four fields. it's to make someone feel helped so quickly that giving us those four things feels like part of being helped, and to make sure nothing they do (hanging up, going quiet, changing their mind, talking over it, refusing) ever makes the experience feel broken.

that framing borrows a lot from daniel pink's point that most of us are in the business of moving people now, and the best way to move someone is to serve them, not pressure them (*to sell is human*, 2012). more on the books in [03](03-principles.md).
