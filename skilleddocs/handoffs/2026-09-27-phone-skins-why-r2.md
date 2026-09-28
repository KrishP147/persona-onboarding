# handoff: phone skins + why, round 2 (review fixes)

branch `krish/phone-skins-why` (worktree C:\Users\User\_worktrees\persona-onboarding-skins), rebased on krish/persona-site-redesign. not pushed, no PR. round 1: `skilleddocs/handoffs/2026-09-27-phone-skins-why.md`.

## done
- iphone tails (`src/app/chat/skins/iphone.tsx`): bubble/cards are `isolate`, tail svg is `-z-10`, so it paints over the bubble bg but under the text; hook sits outside the box. no glyph clipping for single/last runs, contact card, link/gmail cards.
- mobile 390: re-shot all 3 skins after the round-1 frame-width fix; gutters 16 (iphone, pixel) / 12 (galaxy, spec gives none), header + composer unclipped. no code change needed.
- why lane (`src/app/chat/why/WhySidebar.tsx`): lane is its own scroller; cards placed in thread content coords (bubble offsetTop x frame zoom), lane scrollTop follows thread scrollTop x zoom, wheel on lane drives the thread. lane may run ahead of the thread's end so trailing/call cards are reachable; newest card kept in view while thread sits at its end; j/k scroll the thread (not the page) and then bring the card into view. call turns stack in order after the last anchored card. bottom 24px fade.
- screenshots re-shot in scratchpad `skins/` (shot.cjs now hides the next dev badge, supports `keys=jk..`, `CALLWAIT` env; ring needs msgs "Max|call me now please" since agentName must be set).
- tests: typecheck, lint, smoke, `pnpm build --webpack` pass.

## not done / gaps
- call-turn cards not anchored to the call phone (stack in order instead); no connector line; follow-mode toggle from spec B not built (lane always syncs).
- when lane runs ahead of the thread end, cards and bubbles are briefly out of line until the thread scrolls up.
- active-card-wins can push earlier cards far above their bubbles for tall expanded cards.
- e2e not run.

## suggested skills
- `code-review` on `git diff 08f345e..HEAD`; `run` to eyeball /chat at 1440 and 390.

## Board status
- no issue/card (brief-driven); board step skipped.
- status: complete for findings 1-4; gaps above.
- deviations: finding 2 needed no code change (already fixed by 963776f), only verification.
- ideas: anchor voice cards beside the call phone's caption; a "follow" toggle so the lane stops syncing while reading.
