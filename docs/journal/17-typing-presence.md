# 17. checking who's actually there

*sept 27, 2026*

two small things about presence in the /chat texts: the typing dots, and the left-on-read nudge from journal 13. both claim to know whether you're "there". worth checking they actually do.

## the dots

`(typing || revealing) && <S.Typing />` sits once in `Thread.tsx`, so all three skins (iphone, pixel, galaxy) show the same dots off the same two flags: `typing` is true from just after you send until the reply lands, `revealing` is true while the reply's bubbles are still being paced out one at a time. one place, one rule, so a fix to the pacing can't leave one skin's dots out of step with the other two. read through send → reply and the reveal loop in `useChat.ts`: nothing skin-specific gates it. this one was already right.

## the nudge that could jump the gun

`useIdleNudge` waits for a while after the agent's last text, then asks the server for a double text. "busy" (typing, revealing, a call, a draft) resets that clock. but the clock's actual target time was always `agent's message timestamp + delay`, not `now + delay` recomputed each time busy clears. so: type for a couple minutes (busy stays true the whole time, `draft.trim()` is truthy), then delete it all. busy flips false, the effect reruns, and the wait it computes is `delay - (now - message.ts)` — and since minutes have already passed, that's negative, clamped to a 1 second floor. the nudge fires almost immediately, right after you were visibly present and typing. keystrokes never told the clock you were still there; only the current, instantaneous state of the draft box did.

fix: `useChat` now tracks `lastKeystroke` (a timestamp, bumped on every `setDraft` call — real typing and the "edit" prefill from the what-i-know card both count) and `useIdleNudge` takes it as a new argument. the wait is measured from `max(message.ts, lastKeystroke)` instead of just the message. clearing a draft you were just typing into now gets the full 45s (or the second nudge's 3 minutes) from the moment you stopped, not from whenever the agent last spoke.

## same shape, a different feature

the stuck-hint placeholder (this session's other change: an example fills the composer's placeholder when a question sits unanswered a few seconds) has this exact bug shape built out of the box, because it re-derives from `draft` on every render rather than trusting a stale target time — typing and clearing it just re-arms its own effect. no separate fix needed there; it was the reference for spotting what was wrong with the older nudge code.

## checked

`pnpm smoke`'s existing left-on-read cases still pass (no double text seconds after its own text, the 45s/3min stepped delays, quiet after the second one). the keystroke case itself isn't covered by smoke (it's a browser timing thing, not a server behavior), so it was checked by hand in a running tab: type into the composer for a while after the agent asks something, delete it, and confirm the nudge waits out a fresh interval instead of firing in about a second.
