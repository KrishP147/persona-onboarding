# handoff: phone skins + "why it said that" (web sim)

branch `krish/phone-skins-why` (worktree C:\Users\User\_worktrees\persona-onboarding-skins), base 338d4f4 (krish/persona-site-redesign). not pushed, no PR.

## done
- skins: `src/app/chat/skins/{types.ts,shared.tsx,iphone.tsx,pixel.tsx,galaxy.tsx,index.ts}`; `useSkin` = `?phone=` > localStorage > UA; instant switch.
- logic moved verbatim to `src/app/chat/useChat.ts`; layout in `page.tsx`, `Phone.tsx` (device frames, zoom-to-fit, call second phone), `Thread.tsx`, `chrome.tsx` (persona top bar, picker, mobile menu sheet).
- why: `src/app/chat/why/{frameworks.ts,WhySidebar.tsx,WhySheet.tsx}`; desktop anchored cards (lg+), phone "why" badge + half sheet, annotate toggle in menu.
- css tokens/keyframes in `src/app/globals.css`; Roboto Flex added in `src/app/layout.tsx`.
- journal: `docs/journal/14-phone-skins-and-why.md`. spec: `docs/design/phone-ui-spec.md`.
- tests: typecheck, lint, smoke pass; `pnpm build --webpack` passes.

## not done / known gaps
- turbopack dev/build panics in this worktree (node_modules junction "points out of filesystem root"); used `--webpack`. env issue, not code.
- voice-call turns have no bubble, so their sidebar cards stack after the last anchored card and can fall below the visible lane.
- no connector line between card and bubble; no bubble pulse; no "human turns" ticks or framework filter from spec B.
- iphone skin shows no dark mode; pixel light mode not built.
- decorative non-functional icons kept for realism (pixel emoji/gallery, galaxy emoji/more, iOS "Report Junk" text).
- base branch rebase will add `useIdleNudge`: slot it into `useChat.ts` before `const thread` (comment marks the spot).
- e2e (`pnpm e2e`) not run (hits models); selectors kept: data-role, input[aria-label=Message], sent/delivered/seen labels, Accept/Decline/Hang up, header Call, data-caption.

## next step
review screenshots in scratchpad `skins/` dir, then rebase onto krish/persona-site-redesign and wire useIdleNudge.

## suggested skills
- `code-review` on the branch diff; `run` to eyeball the sim.

## Board status
- no github issue/card for this task (brief-driven); board step skipped.
- status: complete (A, B, C), gaps above.
- deviations: A/B and C landed in one commit after skins (why pieces were intertwined with the page split); sheet renders inside the phone screen; sidebar shows from lg (1024) not only xl, "why" badges show below lg.
- ideas: cards for call turns could anchor to the call screen's caption on desktop.
