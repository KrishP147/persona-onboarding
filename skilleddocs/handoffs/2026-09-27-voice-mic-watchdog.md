# handoff: voice mic watchdog (2026-09-27)

branch `krish/voice-mic-watchdog` (worktree `C:\Users\User\_worktrees\persona-onboarding-voice`), base 062bd96. not pushed, no PR.

## done

- `19e28c5` src/app/chat/useVoiceCall.ts: dead-mic watchdog (one AudioContext + AnalyserNode per call, rms every 100ms, <1e-4 for 4s = trouble; track mute/ended flag, unmute clears; paused while muted; skipped while ctx not running), `swapInput(deviceId?)` shared by picker + devicechange (reacquire with same constraints, apply mute, rewire analyser/track listeners/deepgram recorder, stop old tracks, 2.5s toast), devicechange follows vanished input or moved OS default (only when user hasn't picked one). (round 2 replaced the same-socket recorder restart, see below.) cleanup in teardown + unmount. hook returns `micTrouble, micToast, inputId, swapInput`.
- `beb69a5` src/app/chat/MicTrouble.tsx (new) + 2 lines in Phone.tsx: card "can't hear you. switch mic or text instead?" with mic select + "switch to text" (hangUp("user_hangup")), and toast.
- `efb9bda` docs/journal/16-dead-mic.md.
- round 2 `93cde2e`: swapInput with deepgram live opens a fresh deepgram session on the new stream (opener ref'd in accept), then stops the old one; null -> stop old + web speech. stale results (newer stream, hangup, old socket dropped meanwhile) are stopped. startDeepgram back to `{ stop }`. only the live session's drop triggers web speech fallback.
- round 2 `4eda7be`: startDeepgram reads optional `keyterms: string[]` from token JSON (filters non-strings/blank) and appends `keyterm` params.

## verify (all pass)

typecheck, lint, smoke (blank keys), `next build --webpack` (blank keys). fresh worktree needed `npx next typegen` once for `LayoutProps` (generated type, not a code issue).
headless scripts in scratchpad `voice/` (mic.cjs, swap.cjs, ctx.cjs), dev server with all model/voice keys blanked (confirmed via @next/env loadEnvConfig that blank shell vars win over .env.local). mock mode reached 'active' with no product changes (token 503 -> web speech; tts 502 -> speechSynthesis).

## not done / gaps

- fresh-session swap untested against real deepgram (no spend); brief overlap of two sockets during swap (extra token fetch per swap).
- web speech fallback ignores picked mic.
- real devicechange (plug/unplug, OS default move) not testable headless; only a no-op devicechange dispatch was checked.
- card sits at top of call screen, covers avatar/name while shown (both skins).

## next step

manual check on a real machine with deepgram key (user approval needed for spend): mute mic at OS level mid-call, pick another mic, plug headset; confirm transcription continues after swap.

## suggested skills

- `update-progress` with this doc; `code-review` on the branch diff.

## Board status

- no issue/card number in the brief; no board card touched, nothing moved.
- task complete per brief; gaps above.
- deviation: none from brief. idea (superseded by round 2 fresh session, kept for reference): route the mic through the existing AudioContext into a MediaStreamDestination and record that stream once, so swaps only reconnect a source node and the container never restarts.
