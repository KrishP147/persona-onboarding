# handoff: reviewer overlay, graduation card, send undo

branch `krish/graduation-overlay` (worktree C:\Users\User\_worktrees\persona-onboarding-grad), base 12762bd. not pushed, no PR. commits: `git log 12762bd..HEAD`. story in `docs/journal/15-graduation-card.md`.

## done (one commit each)
- aa2fffb `usePref` hook (localStorage + memory fallback). c43e3da + 01ea459 depend on it.
- c43e3da intro overlay (`src/app/chat/Intro.tsx`): centered card >=640, bottom sheet below. esc / backdrop / X / "Start texting" close it, focus trap, role=dialog aria-modal. key `persona-intro-seen`; `?intro=1` forces. session boots underneath.
- 01ea459 reasoning lane collapsed by default, key `persona-show-reasoning`. mobile annotate was already off by default, untouched.
- 6bc8aad `Skin.RichCard` + `Skin.rich` palette per skin (`skins/types.ts`, iphone/pixel/galaxy). 276635c and f11e747 depend on it.
- 276635c `cards/KnowCard.tsx`: what-i-know card, edit prefills composer, forget confirms inline then POSTs `forget_slot` via new `chat.forgetSlot` (optimistic). placement: after the turn that graduated (anchor stored per session in localStorage `persona-grad-anchor:<sid>`), else pinned at the end of the thread.
- f11e747 `cards/DraftCard.tsx`: draft message rendered as confirm card when gmail filled + draft has `to`; send -> 5s bar + undo -> `chat.send("yes, send it")`; not yet collapses (review brings it back); unmount mid-countdown cancels; shows "Email sent" once `draft.sent`.
- 5f71c7c `why/metrics.ts`: "this session: n turns · $x · p50 yms" in how-it-decides (sidebar + sheet) if `session.metrics` exists (typed loosely).
- coordinator extras: 3b7df01 sidebar cards stack from top (bubble-level anchoring + lane/thread scroll sync removed; hover a bubble or j/k scrolls its card into view). 38430fa up to 3 alerts as "3 things i'd do first", draft card moves under the grad card after graduation, "setup m:ss" in footer when the anchor is known. dcc1986 `why/Guards.tsx` "checks that ran" chips (sidebar, sheet, annotate chip) from loose `msg.guards`, deduped.
- tests: typecheck, lint, smoke (all passed), `next build --webpack` all pass at 88dea42.
- screenshots: scratchpad `grad/` (overlay-desktop, overlay-mobile, reasoning-collapsed/expanded, know-{iphone,pixel,galaxy}, know-mobile-galaxy, forget-confirm, forget-done, draft-ask-*, draft-undo, draft-later, draft-sent, metrics, sidebar-top, sidebar-jk, guards-sidebar, guards-sheet). seeding: `grad/seed.py <id> [metrics]`, shots: `grad/g.cjs`.

## not done / gaps
- when grad card is pinned at the end (resumed session, no stored anchor) it sits after later texts too (seen after "yes, send it"). setup time is hidden in that case.
- fixed by manager (e147040): a pre-graduation draft moves under the grad card and its original bubble is hidden; a draft shown after graduation stays in place.
- not rebased on origin/master (65124f4, redesign merged): rebase was blocked for the manager. run `git rebase --onto origin/master 12762bd`; merge-tree shows no conflicts in our files. after: type guards via `Msg.guards` (now in src/lib/types.ts) instead of the loose cast, rerun typecheck/lint/smoke/`pnpm stress-matrix` + `git diff --exit-code STRESS_TESTS.md`/build.
- journal 14 still says why cards sit level with their bubbles; 15 notes the change.
- gmail "Edit" = reconnect popup (connectGmail); not tested against real oauth.
- e2e not run; no screen reader pass.

## suggested skills
- `code-review` on `git diff 12762bd..HEAD`; `run` to eyeball /chat at 1440 and 390 with `?intro=1`.

## Board status
- no issue/card (brief-driven); board step skipped.
- status: complete for tasks 1-5 plus coordinator items (top-align, A, B, C).
- deviations: RichCard infra and usePref split into their own commits, so tasks 1/2 need aa2fffb and 3/4 need 6bc8aad; draft card relocates under the grad card after setup (coordinator A).
- ideas: store the graduation transcript index server-side (`graduatedAt`) so placement + setup time work on resume; collapse the original draft bubble to a one-line stub when the card moves.
