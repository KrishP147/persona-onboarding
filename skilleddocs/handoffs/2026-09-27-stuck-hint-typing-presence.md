# handoff: stuck-hint composer placeholder + typing presence audit

branch `krish/stuck-hint` (worktree `C:\Users\User\_worktrees\persona-onboarding-hint`), base `e6562a3`. not pushed, no PR. brief-driven (no GitHub issue). commits: `git log e6562a3..HEAD`.

## done (two commits, task complete)

- `f24f274` **stuck-hint placeholder.** new `src/app/chat/useStuckHint.ts`: when the agent's last text message is a question (trailing `?`, or its move id is one that leads to a system-appended ask — `discover`/`dig`→helpNeed, `ask-gmail`→gmail, `ask-name`→userName, `name-me`/`intro`→agentName) and the composer has sat empty ~5s (measured from the message's `ts`, like `useIdleNudge`) with nothing else going on (not typing/revealing/on a call/recording/transcribing, draft empty), the resolved open slot's example fills the native `<input placeholder>` — never the value. Slot resolution: prefer the move-id mapping above; else the first slot still `"missing"` in `policy.ts`'s `ORDER.text` order (`agentName, helpNeed, userName, gmail`; that file doesn't export the const, so it's duplicated in the hook with a comment pointing back). Examples: `agentName` → "e.g. call you nova", `userName` → "e.g. call me sam", `helpNeed` → "e.g. my inbox is a mess", `gmail` → "e.g. sure, send the link".
  - Wired through `ComposerProps.hint` (`skins/types.ts`) → `Phone.tsx`'s `<S.Composer hint={chat.hint} />` → each skin's `Composer` (`placeholder={hint ?? "iMessage"/"RCS message"/"Enter message"}`).
  - `useChat.ts` computes `chat.hint` via the hook, gated by a new pref `usePref("persona-typing-hints", true)`.
  - Toggle: desktop `TopBar` (chrome.tsx) gets a `Pill` next to "Show reasoning"; mobile `MenuSheet` gets a switch row right under "Annotate replies" ("Typing hints" / "an example while you wait to reply"). Both read/write the same `persona-typing-hints` pref key from `page.tsx`, kept in sync by `usePref`'s cross-instance event.
  - Two React-Compiler lint rules shaped the implementation (see file comments): no `Date.now()` in the render path (derive via a `useEffect` + `setTimeout` that flips a `show` boolean, not a computed-at-render elapsed check), and no synchronous `setState` at the top of an effect body (the "reset to false" happens in the effect's **cleanup**, which fires when `eligible` flips false, not as a bare call in the body).

- `197d389` **typing presence audit + fix**, journal `docs/journal/17-typing-presence.md`.
  - (a) typing dots: verified fine as-is. `Thread.tsx` has one line, `(typing || revealing) && <S.Typing />`, shared by all three skins — no per-skin drift possible.
  - (b) idle nudge: confirmed the suspected bug. `useIdleNudge`'s wait was `after - (Date.now() - lastAgentMsg.ts)`; typing (which counts as "busy" via `!!draft.trim()`) never touched that target time, so typing for minutes then clearing the draft made the recomputed wait go negative → clamped to the 1s floor → near-instant nudge right after real engagement. Fix: `useChat` now has `lastKeystroke` state (bumped in the wrapped `setDraft`, which is what every consumer — the composer's `onChange`, `KnowCard`'s edit-prefill, — actually calls; the two purely-internal draft resets in `send()`'s success/failure paths use a new `setDraftState` directly instead, so a programmatic clear-after-send doesn't fake a keystroke). `useIdleNudge` takes `lastKeystroke` as a new param and measures from `Math.max(last.ts, lastKeystroke)`.

## verification (all green, in order)

- `pnpm typecheck` — clean (note: fails with `Cannot find name 'LayoutProps'` on a bare checkout until `.next/types` exists; a `next build`/`next dev` pass fixes it, confirmed this is pre-existing/unrelated by stashing and reproducing on base `e6562a3` too).
- `pnpm lint` — clean (0 errors, 0 warnings) after satisfying the two react-compiler rules noted above.
- `ANTHROPIC_API_KEY= GEMINI_API_KEY= GEMINI_API_KEY_TWO= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= BROWSERBASE_API_KEY= CLOUDFLARE_API_TOKEN= COHERE_API_KEY= pnpm smoke` — all passed, including the existing left-on-read cases (no regressions from the keystroke change).
- `pnpm stress-matrix` then `git diff --exit-code STRESS_TESTS.md` — 15 rows, no diff.
- `npx next build --webpack` — compiles, its own internal TypeScript pass is clean, all routes generate.
- `next dev` never re-dirtied the `AGENTS.md` auto-block during any of the above (checked `git status` after the build and after the dev-server screenshots).

## screenshots

Dev server on `pnpm dev --webpack -p 3500` with the same keys blanked (mock mode). Scripts + shots: `C:\Users\User\AppData\Local\Temp\claude\C--Users-User\961a65b6-d705-45c6-be9b-384e16d33ce3\scratchpad\hint\` (`seed.py` writes a session straight to `.data/sessions/<id>.json`, `g.cjs` is `grad/g.cjs` adapted to port 3500 and this worktree's `node_modules/puppeteer-core`).

- `hint-iphone.png` — iphone skin, fresh session, agent just asked "what do you want to call me?"; composer placeholder reads "e.g. call you nova" (agentName slot, via the `ORDER.text` fallback since there's no move id here).
- `hint-pixel.png` — pixel skin (dark), name given, agent asks "what's been eating up your time lately?" with `move.id: "discover"`; placeholder reads "e.g. my inbox is a mess" (helpNeed, via the move-id mapping).
- `hint-toggle-desktop.png` — 1440×900, shows the TopBar's three pills ("Show reasoning", **"Typing hints"**, "Restart") plus the iphone hint in the same shot.
- `hint-toggle-mobile.png` — 390×844, mobile menu sheet open, showing the "Typing hints" switch (on, green) directly under "Annotate replies".

Gotcha hit and worked around: seeding a session with an old timestamp (originally copied the 10-minutes-old pattern from `grad/seed.py`) to satisfy the hint's 5s delay also satisfies `useIdleNudge`'s 45s threshold on page load, which fires a real double-text through the mock chat pipeline and **persists** two new messages into the session file, clobbering the staged scenario. Fixed by seeding messages only ~8-30s old (past the hint's 5s floor, nowhere near the nudge's 45s) and — since real wall-clock time passes between separate tool-call round trips — always chaining `seed → screenshot` in one Bash invocation with a brand-new session id, never reusing an id across multiple manual page loads.

Test-only artifacts: `.data/sessions/h*.json` created during screenshotting were deleted before finishing (`.data/` is gitignored anyway, confirmed via `git status`). The port-3500 dev server was stopped (`Stop-Process`) before ending the session; confirmed via `netstat` that nothing is still listening.

## manager follow-ups

- 08deb3a typing hints pill shown at every desktop width (was lg-only; sm-lg had no toggle since the menu sheet is phone-only); journal 17 wording fixed + real check recorded.
- a428cdc coordinator ask: intro disclaimer "a trial demo by Krish, not the real product" under headline.
- the "concurrent edits" the implementer flagged were the manager's.

## not done / gaps

- Nothing outstanding from the brief. Two possible follow-ups if anyone wants to extend this later (not requested, not started):
  - No automated test covers the stuck-hint or the keystroke fix (both are browser-timing behavior; `pnpm smoke` doesn't drive a real browser). hint verified by screenshots; keystroke fix verified by manager with headless script `scratchpad/hint/nudge2.cjs` (`TYPE=1` to type) against dev with `NEXT_PUBLIC_IDLE_FIRST_MS=10000`: text_idle posted 10.0s after clearing a 15s draft.
  - `useStuckHint`'s move→slot table only covers the six moves that clearly ask for one of the four slots; everything else falls back to `ORDER.text`'s first open slot, which won't always match what the agent's text literally asked about (e.g. `steerBack`, `bridge`) — this is the behavior the brief specified, not a bug.

## suggested skills

- `code-review` on `git diff e6562a3..HEAD` if a second pair of eyes is wanted before this merges.
- `run` to eyeball `/chat` live rather than trust the seeded screenshots, if picking this back up.

## Board status

- No GitHub issue or kanban card: this session was driven directly by the coordinator's brief (task text in the session transcript), not by `next`/a board item. Board-move step (session-handoff §3) skipped, matching the same pattern as `skilleddocs/handoffs/2026-09-27-graduation-overlay.md`.
- Status: **complete**. Both requested commits are in place, all listed verification commands pass, and both requested screenshot categories (example placeholder × 2 skins, toggle × 1) are captured.
- Deviations from the brief: none substantive. Minor: the task's example screenshot names were `hint-iphone.png`/`hint-pixel.png` "plus one showing the toggle" (singular) — two toggle screenshots were captured (desktop `hint-toggle-desktop.png` and mobile `hint-toggle-mobile.png`) since the toggle has genuinely different UI in each breakpoint and both were cheap to verify.
- Ideas/innovations noticed but out of scope: none beyond the two "not done/gaps" follow-ups above.

## heads up: concurrent uncommitted edits in this worktree

Right at the end of this session, `git status` started showing three uncommitted, unstaged changes this session did **not** make:
- `docs/journal/17-typing-presence.md` — the "same shape, a different feature" paragraph reworded (em dashes removed, and the claim corrected: the stuck-hint hook actually *does* re-show the example immediately if you clear the draft long after the question, since it isn't debounced by a keystroke clock the way the nudge now is — the new wording says this; my original wording incorrectly implied "no separate fix needed" without explaining why). This correction looks accurate, so it was left in place rather than reverted.
- `src/app/chat/Intro.tsx` — a new disclaimer line added to the intro dialog ("a trial demo by Krish, not the real product"). Unrelated to this task.
- `src/app/chat/chrome.tsx` — the `hidden lg:block` wrapper this session put around the new "Typing hints" `Pill` was removed, so the toggle now shows whenever the desktop `TopBar` shows (`sm:` and up) instead of only at `lg:` and up. Arguably a *correction*: unlike the reasoning toggle (gated to `lg:` because the reasoning sidebar itself is `lg:`-only), the typing-hints feature affects the composer, which exists at every breakpoint the `TopBar` does — so gating its toggle to `lg:` was this session's own oversight.

None of this was committed by this session (both commits were built from explicit `git add <files>`, never `git add -A`), so `f24f274` and `197d389` are unaffected and exactly as described above. But it means **someone or something else is live-editing this exact worktree path concurrently** with whoever picks this up next — check `git status`/`git diff` before assuming a clean tree, and don't clobber those in-flight edits.

