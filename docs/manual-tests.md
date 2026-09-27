# manual test scripts: voice + text

run these in chrome with a real mic, ideally with headphones for the first pass and speakers for the barge-in tests (speakers are the harder case: the agent hears itself). hit **restart** (top right, or ⋮ on a phone) before each script.

each step says **type** (in the text box), **say** (out loud on the call), or **do** (tap something). **expect** is what should happen. note anything that feels slow, robotic, pushy, or wrong: the exact line and roughly when.

---

## 1. the happy path (text → call → text)

1. **expect:** intro bubbles, the legal link and its preview, then "What do you want to call me?"
2. **type:** `Julia`
   - **expect:** "Julia it is. save my contact card…" then "want me to call?", then the card with a **save** button. your message shows ✓ then ✓✓, filled once read.
3. **do:** tap **save**
   - **expect:** the header changes from the number to Julia with the persona logo.
4. **type:** `sure`
   - **expect:** "calling you now.", then the phone rings a few seconds later (a second phone on wide screens).
5. **do:** accept. **expect:** a short hello with its name and one easy question (probably your name). the caption appears as it speaks, not before.
6. **say:** `hey, i'm [your name]`
   - **expect:** it uses your name and asks one light question about your week or what's been eating your time.
7. **say:** something real, e.g. `i keep missing replies to recruiters`
   - **expect:** at most one follow-up about the last time it happened, or a playback of what you said. no pitch, no list of features.
8. **expect** (at some point): it mentions a link in your texts. check the text thread: a written ask ("read only, i never send anything without asking") plus the google card.
9. **say:** `ok sounds good, bye`
   - **expect:** a real goodbye with your name, then it hangs up. a short text follows that remembers what you talked about.

## 2. talk over it (barge-in)

1. restart, name it, accept the call.
2. when it starts a sentence, **say** over it: `wait wait, actually`
   - **expect:** it stops talking within about a second and responds to you, not to its cut-off line.
3. repeat once on speakers (no headphones).
   - **expect:** it doesn't cut itself off from hearing its own voice.

## 3. silence

1. restart, name it, accept the call. **say nothing.**
   - **expect:** ~6s: a gentle check-in (not "still there?"). next: an offer to just text instead. then a spoken goodbye ("i'll text you instead…") and it hangs up. a text follows that does **not** say "we got cut off".

## 4. hang up on it

1. restart, name it, accept, let it start talking, then **do:** hang up mid-sentence.
   - **expect:** within a few seconds, one short text ("got cut off, no worries…") that mentions anything you'd already said. it does **not** call you back.

## 5. no calls please (text)

1. restart. **type:** `Max`
2. **type:** `no, text is fine`
   - **expect:** easygoing, stays on text, doesn't offer the call again.
3. keep chatting a few turns. **expect:** no more call offers, and no ring.
4. **type:** `ok actually you can call me now`
   - **expect:** "calling you now." and a ring. it calls only once you ask.

## 6. decline the ring

1. restart, name it, **type:** `sure`, then **do:** decline (red) when it rings.
   - **expect:** a short "no worries, texting works" type line. no question pile-up, no second ring.

## 7. rename mid-call

1. restart, name it `Julia`, save the card, accept the call.
2. **say:** `actually, call yourself Max`
   - **expect:** it accepts the new name. the **voice stays the same** for this call. the contact card updates in place (no second card).
3. hang up, **type:** `call me`, accept.
   - **expect:** the new call uses the voice for the new name.

## 8. gmail during the call

1. restart, name it, accept, and tell it about something email related.
2. **expect:** a written ask plus the google card in the texts, and on the call just "i sent you a link in our texts".
3. **do:** tap the card while still on the call and sign in (or close the google window).
   - **expect:** it doesn't nag you with silence prompts while you're signing in (about 30s of patience). connected: it mentions at most **one** email that can't wait, with a reason, and says the rest can wait. cancelled: "no worries", no push.

## 9. spelling things out

1. on a call, **say:** `my email is k r i s h at gmail dot com` slowly, with pauses between letters.
   - **expect:** it waits for you to finish instead of jumping in after the first pause.

## 10. the rambler

1. on a call, **say** a long, meandering answer (30+ seconds, with small pauses) that has your need buried in the middle.
   - **expect:** it doesn't cut you off at the first short pause. afterward it picks out the need and plays it back in a sentence.

## 11. off topic

1. on a call or by text, ask: `who's your ceo?` then `what's the weather?` then `tell me a joke`
   - **expect:** short, honest answers (ceo zach yadegari, cto tanay singh; it can't check live weather). it steers back lightly at most every other turn, not after every answer.

## 12. rude or annoyed

1. **type:** `this is so annoying, why do you even need a name`
   - **expect:** a relaxed, non-defensive reply. no lecture, no silence. it can skip the name.

## 13. skip setup

1. by text after naming it: **type:** `can we just skip this, i want you to find me a sushi place`
   - **expect:** it lets you skip, and doesn't make up restaurant results. it says what it'll do once set up.
2. on a call: **say:** `let's skip the rest`
   - **expect:** a quick goodbye, it hangs up, and setup counts as done after the call.

## 14. reload mid-call

1. on a call, reload the page.
   - **expect:** the thread comes back with no duplicate greeting. the call shows as ended, and a short text follows.

## 15. no mic

1. in chrome site settings, block the microphone, then name it and accept the call.
   - **expect:** "looks like your mic isn't available… we can do this over text", and it stops offering calls.

## 16. your own name first

1. restart. to "What do you want to call me?", **type:** `i'm dana`
   - **expect:** it takes Dana as **your** name and lightly asks again what to call itself. no contact card named "I'm Dana".

## 17. the occasional gif

1. have a normal back and forth for 4 or 5 messages, then **type:** `haha` (when its last message wasn't a question).
   - **expect:** a gif instead of words, rarely. if you **type** `haha` again right away, no second gif.

## 18. on a phone

1. open the link on your phone and do script 1.
   - **expect:** during the call, "← messages" takes you to the texts, and a green "on a call · tap to return" bar takes you back.

---

## what to write down

- the step number and the exact line that felt off
- speed: anything that took more than ~2 seconds to start replying, or cut you off
- voice: any change of voice mid-call, robotic reads, captions out of sync
- anything it claimed to do that it didn't
