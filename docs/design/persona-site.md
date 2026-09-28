# persona site teardown

pulled apart yourpersona.com on 2026-09-27 so our landing page and the chrome around the sim can speak the same language. everything below came from their shipped css bundle, the page html, computed styles in headless chrome at 1440 and 390, and pixel samples from screenshots. values marked "est" are eyeballed.

## the feel in one line

apple product page, but quieter. pure white, one near-black ink, one grey, and blue used only as a highlight. almost no borders, big soft radii, and motion that eases out long (cubic-bezier .16,1,.3,1). the phone in the hero does the selling; the type just sits there calmly.

## color

| token | hex | where it shows up |
|---|---|---|
| canvas | `#ffffff` | page ground, theme-color meta |
| alt | `#f5f5f7` | privacy cards, arrow buttons, section wash |
| step-200 | `#ededf0` | subtle fills |
| step-300 | `#d2d2d7` | hairlines, "get started" border |
| plus-button | `#e0e0e4` | round "+" on cards (sampled) |
| ghost | `#f0f0f3` | giant "persona" wordmark under the footer (sampled) |
| ink | `#1d1d1f` | headings, body, dark pills |
| ink-black | `#070707` | hero section text, near-black |
| ink-mute | `#6e6e73` | secondary copy, footer links, "log in to the dashboard" |
| ink-faint | `#8e8e93` | captions |
| tick | `#c7c7cc` / `#6e6e73` | scroll ruler ticks (idle / active) |
| blue | `#0a84ff` | ios system blue: the hero imessage bubble, send button |
| card-blue | `#1f6fe5` | privacy card headlines ("independently audited.") |
| icon-blue | `#71a2ec` est | card line icons (anti-aliased sample, true value is card-blue) |
| green | `#34c759` est | the imessage app icon on every cta |
| warm | `#f7f7f5` | /start page ground |
| hairline-warm | `#e5e5e1` | /start row borders (from their inline css comment) |
| label-60 | `rgba(60,60,67,.5)` | ios secondary label inside the hero phone |

no dark mode on the marketing site. `theme-color` is white.

## type

- stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, "Helvetica Neue", Arial, sans-serif`. so apple devices see sf pro and everyone else sees inter (variable, 100 to 900, loaded via next/font). we copy this exactly.
- weights: 400 body, 500 for every display heading (never bold), 600 for small headings and labels.
- tracking goes negative as size goes up.

| role | size / line-height | weight | tracking | example |
|---|---|---|---|---|
| hero h1 | 56 / 56 (clamp 38 to 56) | 500 | -0.84px (-0.015em) | your personal intelligence |
| band h2 | 80 / 84 (clamp 44 to 80) | 500 | -1.2px | persona band |
| privacy h2 | 60 / 62.4 (clamp 31 to 60) | 500 | -1.5px (-0.025em) | the most personal ai is the most private one. |
| band subline | 28 / 35 (clamp 19 to 28) | 500 | -0.14px | personal intelligence, on your wrist. |
| card headline | 25 / 28.75 | 600 | -0.55px (-0.022em) | blue line + ink line |
| footer headline | 20 / 30 | 600 | -0.3px | create your persona today. |
| button (learn more) | 17 / 25.5 | 500 | 0 | |
| button (get started) | 18 est | 500 | 0 | |
| body / card detail | 15 / 23.25 (1.55) | 400 | 0 | ink-mute |
| footer link | 15 / 24 | 400 | 0 | ink-mute |
| small link | 14 / 21 | 500 | -0.07px | log in to the dashboard |
| caption / legal | 12.5 / 18 | 400 | 0.0625px | © 2026 persona |
| eyebrow | 12.5 / 18 | 600 | 1.125px (0.09em), uppercase | security & privacy |
| wordmark | ~22 hero, ~26 section | 600 | -0.01em est | mark + "persona" |

## shape, depth, motion

- radii: 68px (get started pill), 999px (learn more), 40px (footer card), 32px, 28px (privacy cards), 26px (start on imessage pill), 16px (/start channel row), 12px (icon tiles). the phone svg uses container-query units (4.98cqw) so it scales as one piece.
- shadows are rare and soft: footer card `0 1px 2px rgba(19,21,21,.03), 0 24px 70px -40px rgba(19,21,21,.12)`; the dark imessage pill has a neumorphic pair `5px 5px 12px rgba(19,21,21,.22)` plus a white highlight; social icon tiles `0 3px 3px rgba(0,0,0,.06), 0 1px .5px rgba(0,0,0,.12)`; floating app bubbles in the og image use an inset glassy stack.
- borders: basically only the get started pill (`rgba(0,0,0,.24)` est) and the /start row (`#1e1e1e`).
- spacing base 4px (`--spacing: .25rem`). sections breathe: 120px bottom padding on the band section, 80px above the footer.
- easing: `--ease-house: cubic-bezier(.16,1,.3,1)` for reveals; `cubic-bezier(.32,.72,0,1)` 140ms for presses (/start); default tailwind 150ms `cubic-bezier(.4,0,.2,1)` elsewhere.

## page structure

1. **hero**, two columns. left: iphone 17 pro silver svg sitting on a misty tree photo that's feathered into white with a big inset white shadow. inside the phone a looping imessage demo: text types into the composer char by char, sends as a blue bubble, "delivered", a heart tapback lands, typing dots, then a grey reply ("three subscriptions, $34 a month. cancel them all?"). the thread fades and a second script plays ("book me a dentist appointment, mornings only"). right: mark + wordmark, h1, white "get started" pill with the green imessage icon, "log in to the dashboard" under it. far right edge: a vertical scroll ruler of ~40 hairline ticks that lengthen near the current scroll position.
2. **band**: three bands product shot (leather, black knit, bone silicone, each with a glowing ring), "persona band", subline, black "learn more" pill.
3. **privacy**: small wordmark, two-line h2, three cert seals top right (soc 2 type i, aes-256, esof) with 12.5px captions, then a horizontal carousel of 400 x 282 alt-grey cards: blue line icon, blue headline + ink subline, round "+" that expands into the detail copy. prev/next round buttons under the right edge.
4. **footer**: one big rounded white card with a soft shadow. left: wordmark, "create your persona today.", two muted lines, dark "start on imessage" pill, mail / x / instagram tiles, copyright + "made in miami, usa." middle: product and resources columns. right: security & privacy eyebrow, seals, "report a security issue →". under the card a giant ghosted mark + "persona" bleeding off the bottom of the page.
5. **/start**: warm grey page, centered mark, "start texting your persona" (22/600, -0.015em), muted 15px subline, one 68px channel row (white, 1px near-black border, radius 16, 40px icon tile) that opens `sms:` with "hey, what's a persona?" prefilled.

## voice

short declaratives with a period. "made to get it done." "gone means gone." two-line headlines where line two turns the first. no exclamation marks, no emoji.

## what we changed for our build

- every "get started" / "start on imessage" goes straight to /chat (the sim), one click. /start is mirrored too, with "continue on the web" → /chat as its first row and the real sms row kept as a quieter second option.
- the sim page chrome (background, buttons, the "why it said that" panel, the phone picker) uses these tokens. the phone screen itself does not: each skin (iphone, pixel, galaxy) keeps its own os colors and type, because the point is that it feels like your phone.
