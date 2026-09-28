# HANDOFF: map + dark mode lane (krish/map-darkmode)

brief + spec (read both, incl. SPEC ADDENDUM for item 4):
C:\Users\User\AppData\Local\Temp\claude\C--Users-User\961a65b6-d705-45c6-be9b-384e16d33ce3\scratchpad\map\BRIEF.md, SPEC.md
stopped early: context past ~100k, items 4+5 are big (web research + all skins light/dark).

## done (commits on krish/map-darkmode, base 533ae70)
- 57a61b8 item 1 layout. src/app/chat/Stage.tsx: flip via WAAPI on `[data-stage]` items, offsetLeft/Top (ignores transforms), sig change animates, RO re-measures without motion, leaver = cloned ghost fading out. animate only lg+; call StageItem is `max-lg:contents` so mobile full-screen call untouched. also useMedia, useViewportWidth.
- 95cfbc1 item 2 reasoning. why/ReasoningMap.tsx (map, milestone track, node popover, ReasoningPill, MapGlyph). WhySidebar.tsx + WhySheet.tsx deleted, WhyBadge + annotate gone from Thread (WhyHooks now: on, byId, hoverId, activeId, setHover, select, sheetOpen). bubbles only link/highlight while on. pill: absolute left of phone at lg (full / glyph / hidden by margin math in page.tsx), in TopBar at sm..lg, menu row below sm. map = bottom sheet below lg. pulse = .rz-glow keyed on turns.length; reduced motion = .rz-count badge (globals.css). milestones from session.slots[k].updatedAt -> first turn with ts >= it; call = any voice turn; graduated = phase.
- 9a5a597 item 3 chrome. skins/types.ts UnknownNotice now required, props {onAdd, onDismiss}. iphone: text + Dismiss. pixel: card, Dismiss + Add contact. galaxy: "Add to contacts | x". Thread hides on session.contactSaved or dismissed (usePref key `persona-unknown-dismissed:<sessionId>`). phone-ui-spec.md notes added.
- cff436f menu row mirrors master 669d27e (MenuSheet props canReason/onReasoning).

## verified (after item 3, keys blanked)
typecheck ok (run `npx next typegen` first on a fresh tree), lint ok, smoke all passed, stress-matrix + `git diff --exit-code STRESS_TESTS.md` clean, `npx next build --webpack` ok.
shots in scratchpad\map: t1-one/t1-two/t1-end (layout, light only), t2-closed/t2-open/t2-mobile/t2-tablet (map), t3-*.png + t3-strip.png (unknown notice).

## not done
1. item 4 fidelity pass (SPEC ADDENDUM): research iOS 26 / Google Messages M3 / Samsung One UI light+dark (WebSearch/WebFetch via ToolSearch "select:WebSearch,WebFetch"; real Android RCS screenshots in "C:\Users\User\persona context\"). side-by-sides scratchpad\map\fidelity-<skin>-<light|dark>.png; "fidelity pass" section (diff -> fix) + sources in docs/design/phone-ui-spec.md. one commit per skin ok. note from Screenshot_20260926-195145.png (real GM dark): sent bubble slate blue ~#3B4A6B-ish, recv ~#202127, header shows yellow avatar + number, "RCS chat with <number>" line, composer "RCS message", purple voice fab (dynamic color). measure, don't trust these.
2. item 5 theme: toggle top right on / and /chat, localStorage key shared, light/dark/system default system, inline pre-paint script in src/app/layout.tsx setting html[data-theme] (read node_modules/next/dist/docs for script-in-layout guidance first). dark --p-* tokens in globals.css (near-black ground, #f5f5f7 ink, same blues), logo via currentColor (public/brand/persona-mark.svg is an <img> in chrome.tsx Wordmark + landing). skins: plan = move each skin's color constants (C.* / BLUE/RECV/GRAY, tailwind `text-[#..]` literals) to css vars per skin with light + dark values under html[data-theme=dark]; pixel gets a real light mode. keep composer internals minimal (stuck-hint lane edits placeholder), call button rows lightly touched (voice-mute-hold lane adds Hold).
   map/pill already use --p-* tokens (bg-canvas, bg-alt, border-step-*, text-ink*), so they flip for free; ReasoningMap node shadow rgba is fine.
3. then dark fidelity shots, all brief screenshots light+dark (one phone, two phones w/ call, pill+map closed, map open w/ node, each skin, mobile sheet, landing).
4. docs/journal/17-reasoning-map-and-dark-mode.md (lowercase journal, no em dashes, cite sources). fix journal 14 (says margin cards level with bubbles, per-bubble "why", sheet, annotate switch: all gone now) and 15 ("reasoning lane folded by default", "why card lists checks": now map nodes + popover). justification to record: per-bubble why dropped (user asked, and the map + tapping the bubble itself make it redundant; one entry point, thread stays a real-looking thread).
5. skin.why fields (types.ts + skins) now unused except nothing; can drop in item 4/5.

## how to run
- dev: `sh <scratchpad>\map\dev.sh` (blanks all keys incl deepgram/cartesia/groq/mistral/vercel oidc, port 3600, --webpack). kill by the PID listening on 3600 only.
- shots: `node <scratchpad>\map\g.cjs <name> <w> <h> "<query>" '<steps json>' '<init js>'`; waits for hydration (first load after an edit compiles slowly, a shot can come out blank otherwise). init `localStorage.setItem("persona-intro-seen","1")`, add `localStorage.setItem("persona-show-reasoning","1")` for map on. PAGE=... env for non-/chat pages (landing: PAGE= "" not supported, pass PAGE=/ path fix needed: g.cjs builds `localhost:3600/${PAGE||"chat"}?query`).
- seeds: `python <scratchpad>\map\seed2.py <id(>=6 chars)> [call] [metrics] [nodraft]` (real move ids, a call segment with guards, slot updatedAt). ids must be 6+ chars.
- call in shots: click `button[aria-label=Call]` (fake media flags already in g.cjs), hang up via `[data-stage=call] button[aria-label="Hang up"]`.

## gotchas
- python writes: use newline='' (repo is LF; a CRLF slip happened once and was fixed).
- do not rebase/merge master; caller rebases. master 669d27e overlaps Thread/page/chrome (why removal) — expected conflicts there.

## exact next step
start item 4: ToolSearch "select:WebSearch,WebFetch", pull iOS 26 Messages light/dark bubble + system colors (Apple HIG colors page), then build fidelity-iphone-light.png side-by-side.
