# handoff: /chat redesign, map + dark mode (items 1-3 of 5)

branch krish/map-darkmode (worktree C:\Users\User\_worktrees\persona-onboarding-map), base 533ae70. not pushed.
full restart notes: skilleddocs/HANDOFF.md (done list, how to run, next step). brief/spec: scratchpad\map\BRIEF.md + SPEC.md (with ADDENDUM for item 4).

## state
- done: item 1 layout flip (57a61b8), item 2 reasoning map (95cfbc1), item 3 unknown-sender chrome (9a5a597), menu row aligned to master (cff436f), HANDOFF (e4623a4).
- not done: item 4 fidelity pass (light+dark, side-by-sides, spec doc section), item 5 theme toggle + dark tokens + real dark skins, journal 17, journal 14/15 corrections, full screenshot set in dark.
- tests after item 3: typecheck, lint, smoke, stress-matrix (STRESS_TESTS.md unchanged), next build --webpack: all pass.

## suggested skills
- session-handoff at the end of the next session (wraps handoff-auto).
- run (to launch/screenshot the app) if the scratchpad scripts are unavailable.

## Board status
- issue/card: none (free-text task from the caller, no board item). nothing moved.
- status: partial. stopped on the context budget rule, not blocked.
- deviations: per-bubble why affordances, the annotate switch, WhySidebar and WhySheet removed entirely (caller confirmed user wants none); mobile map entry is a MenuSheet row with canReason/onReasoning to match master 669d27e.
- ideas: the Stage flip helper is generic (any item set); milestone track could later show declined slots with the turn they were declined at.
