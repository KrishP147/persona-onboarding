# handoff: map + dark mode lane, round 2 (krish/map-darkmode)

lane complete. items 1-5 done on krish/map-darkmode (base 533ae70), not pushed, not rebased (caller rebases; expect conflicts in chrome.tsx / page.tsx / Thread.tsx with master 669d27e + typing-hints lane).

brief + spec: scratchpad\map\BRIEF.md, SPEC.md (session scratchpad C:\Users\User\AppData\Local\Temp\claude\C--Users-User\961a65b6-d705-45c6-be9b-384e16d33ce3\scratchpad\map).

## round 2 commits
- 4152836 theme plumbing: src/components/theme-script.ts (pre-paint script, key `persona-theme`, light/dark/system), src/components/ThemeToggle.tsx (toggle + useDark), dark --p-* tokens + tailwind `dark:` variant on html[data-theme] in globals.css, chat chrome flips (mark is currentColor svg).
- a53c1c5 + ecdc917 map review fixes: reveal snaps to whole rows, top fade when scrolled, milestone labels wrap with gaps; scroller is now the offset parent (fixed mobile sheet hiding the popover title); top bar fits 640-1024 (tight wordmark, glyph pill below md, mock badge lg+).
- 98e152a landing + /start dark, toggle top right (hero phone stays light imessage on purpose).
- 8cfab4f / e3856c7 / bf651de per-skin fidelity + real light/dark via per-skin css vars (.sk-ios / .sk-gm / .sk-sam in globals.css); skin.why removed. details, diff -> fix lists, color tables, sources: docs/design/phone-ui-spec.md "fidelity pass".
- ae49255 docs: docs/journal/18-reasoning-map-and-dark-mode.md (numbered 18: 17 is typing-presence on master); 14/15 corrected.
- 870ff5d skilleddocs/HANDOFF.md removed.

## verified (keys blanked, final code)
npx next typegen; pnpm typecheck ok; pnpm lint ok; pnpm smoke all passed; pnpm stress-matrix + git diff --exit-code STRESS_TESTS.md clean; npx next build --webpack ok.

## screenshots (scratchpad\map)
final-{one-phone,two-phones,pill-closed,map-open,skin-iphone,skin-pixel,skin-galaxy,mobile-sheet,landing,landing-mobile}-{light,dark}.png, final-tablet-map-light.png, fidelity-{iphone,pixel,galaxy}-{light,dark}.png, refs\NOTES.md (reference research + sources).

## gaps
- ios dark received #262628 derived (no real ios 26 dark thread on plain ground found); ios sent-bubble position gradient not done (translateZ breaks fixed attachment).
- pixel light uses gm3 baseline blue (user's dark is a purple dynamic scheme, so hues differ by mode); some dark states estimated; incoming call not rendered (needs server ring).
- galaxy received fills + dark sent blue estimated; composer layout and 6-control call panel not modelled (composer/call-row minimal-touch rules); samsung messages discontinued in us, documented.
- link preview images stay light in dark; pixel/galaxy have no header scroll fade (iphone does).
- seed2.py assigns moves round-robin, so some map popovers quote a bubble that doesn't match the move (seed artifact, not app code).
- landing dark: hero vignette photo reads murky.

## board status
- no issue/card: caller-driven lane (manager brief), no board to move. status: complete. deviations: item 5 plumbing landed before item 4 (fidelity needs dark mode to compare), skins' fidelity + dark combined per skin; journal numbered 18 per caller.

## suggested skills
- code-review (diff 533ae70..HEAD) before merge; pair/manager to rebase onto master and resolve chrome/page conflicts.
