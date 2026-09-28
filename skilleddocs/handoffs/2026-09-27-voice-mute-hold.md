# handoff: voice mute / hold / dead-mic false alarm / turn end (2026-09-27)

branch `krish/voice-mute-hold` (worktree `C:\Users\User\_worktrees\persona-onboarding-voice2`), base `e2a5df1`. not pushed, no PR.

## done (one commit each)

- `275f40d` dead mic false alarm. cause: the watchdog read the processed stream (ec/ns/agc). chrome ns outputs exact zeros in a quiet room, so rms<1e-4 for 4s fired on silent users. now: ended track = dead at once; track.muted must last 4s; exact zeros (peak<1e-6) on the processed stream for 4s only open a ~1.2s raw capture (same deviceId, ec/ns/agc off); raw hears anything = quiet person, no recheck for 30s; raw zero too = dead; raw can't open = no nag. journal: `docs/journal/16-dead-mic.md` ("what that got wrong").
- `bcb73f7` mute: deepgram MediaRecorder paused + sends gated (socket kept alive), web speech fallback aborted and not restarted, silence timer not armed while muted; unmute re-arms. agent speech keeps playing. watchdog already rested on mute.
- `cc85a5c` hold: button beside mute on iphone/pixel/galaxy (pause glyph, label + aria-label Hold/Unhold), status line "on hold · m:ss", captions hidden. hold cuts tts, mic + stt off, silence/turn/filler timers cleared, late replies not spoken, end_call on hold deferred (final end hangs up on unhold, ordinary goodbye dropped), pending 400ms hangup cancelled. unhold speaks "i'm back, go ahead." via the normal client speak path (same as fillers), then fresh silence window. client only. touches `Phone.tsx` (3 prop lines) and `skins/types.ts` (3 props): merge touchpoints with the layout lane.
- `b47f258` stop intent (coordinator add): STOP_WORDS + sh+/shush/enough/quiet/pause ("hold on" was already covered; no conflict with the button, which is ui only). no thinking filler after a bare stop. after a cut-off, a reply that is empty, <=3 chars or pure backchannel (mm, mhm, ok, okay, sure, yeah, yep, got it) is not spoken; real replies play.
- `e6d405e` turn end (coordinator add, prod bug "...so i'm just" / "curious."): classifier moved to `src/app/chat/turnEnd.ts`; TRAILING extended per request; trailing period ignored for that check; unpunctuated deepgram finals count as unfinished; midphrase wait 850 -> 1800ms, complete stays 700. UtteranceEnd messages were already ignored (only SpeechStarted/Results handled), so nothing forces an early send. continuation: speech starting within 1.5s of a send while the reply is in flight or playing cuts tts and resends previous + continuation as one interrupted turn (the stale reply's speech is dropped by useChat's voiceTurnRef guard). check: `npx tsx scripts/turn-end.ts` (11 pass).

SILENCE_MS / ladder constants untouched.

## verification (keys blanked)

typecheck ok, lint ok, smoke 153 pass / 0 fail, stress-matrix 15 rows + `git diff --exit-code STRESS_TESTS.md` clean, turn-end 11/11, `next build --webpack` ok (after stopping dev).

headless (scripts + png in `C:\Users\User\AppData\Local\Temp\claude\C--Users-User\961a65b6-d705-45c6-be9b-384e16d33ce3\scratchpad\voice2\`, `call.cjs <mode> <phone>`, needs dev on :3700): tone/quiet no prompt in 8s; zero prompt at 5.1s; ended prompt at 0.16s; mute 25s no requests, recognizer aborted, 0 restarts, silence event after unmute; hold 15s no requests, tts cut, "on hold · 0:15", unhold spoke "i'm back, go ahead." with no session/chat request; stop cut tts, turn sent interrupted, "mm." not spoken, real reply spoken. screenshots muted-/hold- × iphone/pixel/galaxy.

## gaps / not done

- raw probe opens the mic twice with different processing; untested on real hardware whether it disturbs the main track's echo cancelling for that second. "no audio frames at all" is not detected separately.
- continuation merge has no headless check; server history keeps the first half + its unspoken reply (src/lib not touched).
- TRAILING now includes words that often end complete answers ("maybe.", "i like that.", "log in."): those wait 1.8s instead of 0.7s.
- unhold line goes through /api/voice/tts when cloud tts is live (same voice); not a model or session call.
- no github issue / board card for this work.

## next step

review + merge `krish/voice-mute-hold` (coordinator wants it fast: prod dead-mic popup). resolve `Phone.tsx` / `skins/*.tsx` against the layout lane if it merged first. then try the raw probe and hold on real chrome with a real mic.

## suggested skills

- `code-review` on the branch diff before merge
- `update-progress` with this doc

## Board status

- no issue or card: this came from a brief, not an issue. board not touched.
- status: complete for items 1-3 + the coordinator's stop-intent and turn-end adds. gaps are above.
- beyond the original brief: stop-intent and turn-end commits (coordinator asked for them); the classifier moved to its own module with a script check.
