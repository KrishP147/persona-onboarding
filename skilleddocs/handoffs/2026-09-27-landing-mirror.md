# handoff: landing mirror (/ and /start)

branch `krish/landing-mirror` (worktree `C:\Users\User\_worktrees\persona-onboarding-landing`), base a8d1d62. not pushed, no pr.

## done
- `/` mirrors yourpersona.com: hero (phone + landscape + looping 2-script imessage anim), band, privacy (certs + 4 expandable cards + arrows), footer card + ghost wordmark, fixed scroll ruler (lg only). markup/classes lifted from the original's ssr html.
- `/start` mirrors yourpersona.com/start: primary "Continue on the web" -> `/chat`, quieter "Continue with iMessage" row with the original `sms:` href, back link -> `/`. no auto sms redirect.
- mid-task change from caller: hero "Get Started", footer "Start on iMessage" and footer "Persona App" link straight to `/chat` (`/start` off the main path).
- client components only: `src/components/landing/{HeroPhone,PrivacyCarousel,ScrollRuler}.tsx`. shared svgs in `svgs.tsx` (generated from the original markup), landing-only css in `landing.css` (imported by `src/app/page.tsx`, inside `@layer components`). globals.css untouched. no new deps.
- reduced motion: initial/ssr state is the finished first script; the loop never starts, css anims off.

commits: 63c74eb, bcf1f5d, 862c394, 379fec6, abb9afa (+ this handoff).

## checks
- `pnpm typecheck` pass (needs `.next/types` from a dev/build run for `LayoutProps`, pre-existing).
- `pnpm lint` pass.
- `pnpm build` FAILS in this worktree only: turbopack panics "Symlink node_modules ... points out of the filesystem root" (node_modules is a junction). `next build --webpack` passes, all routes static. dev likewise needs `next dev --webpack`. should be fine in the main checkout.

## screenshots (scratchpad, not repo)
`C:\Users\User\AppData\Local\Temp\claude\C--Users-User\961a65b6-d705-45c6-be9b-384e16d33ce3\scratchpad\verify\`: desk-00..03.png (1440 sections), anim-sheet.png (loop frames), desk-card-open/next.png, desk-reduced-motion.png, mob-full.png (390 full page), start.png, start-mob.png. scripts: shoot.cjs, sheet.cjs.

## known diffs vs reference
- band: static png instead of the original's canvas frame sequence; crop slightly differs. no scroll reveal on band/privacy (original fades in).
- bubble tails: css hook approximation, not apple's mask svgs (not available).
- font: inter fallback on windows vs original's segoe fallback on /start, so /start headings a touch wider.
- carousel: no mouse drag-to-scroll (arrows + native scroll/snap only).
- ruler: near ticks darken to #6e6e73 (guess; original colors set at runtime).
- footer "Web preview." line adds ~18px.

## next step
verifier: review diff `a8d1d62..HEAD`, eyeball screenshots, confirm build in main checkout (turbopack).

## suggested skills
- `update-progress` (with this doc), `code-review` on the branch diff.

## Board status
- no issue/card; task came from a kickoff brief (landing lane). status: complete.
- deviations: cta targets changed to `/chat` per caller mid-task; build verified via `--webpack` only (worktree junction breaks turbopack).
- ideas: the hero component could accept scripts as props to reuse in `/chat` empty state.
