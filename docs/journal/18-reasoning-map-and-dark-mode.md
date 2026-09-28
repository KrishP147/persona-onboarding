# 18. reasoning map and dark mode

*sept 28, 2026*

after testing prod, the page felt like a dashboard with a phone in it. a column of "why it said that" cards sat to the right of the chat whether you wanted it or not, every reply had a little "why" chip under it, and the page only had one look: white. this round makes the phone the whole page again, and moves the reasoning into something you open on purpose.

## one phone, then two

the chat phone sits in the middle of the page. when a call starts, a second phone with the call screen (same skin, same frame) slides in and the pair re-centers side by side. hanging up slides it back to one. it's a flip animation (measure, move, then let a transform play the gap back over about 400ms on persona's house curve), so nothing reflows mid motion, and with reduced motion it just snaps. under 1024px the call stays full screen like before; two phones don't fit on a phone.

## reasoning off means off

with reasoning off, nothing about it renders: no column, no header, no cards, no leftover space, no chips on bubbles. the only trace is a small "examine reasoning" pill left of the phone that glows once, softly, when a new reply lands (with reduced motion, a count badge instead). on narrow screens the pill moves into the top bar, and on phones it's a row in the menu.

## the map

turning it on opens a map to the right of the phone, and the layout glides to fit it. it's a graph, not a list:

- one node per agent reply: its move (the thing it was trying to do), a short framework tag, and the turn number. the checks that fired on that turn hang off it as small shield chips.
- edges run turn to turn. the call is its own lane, shaded green, and the gmail link and the "gmail connected" event sit on the line as waypoints.
- across the top, the onboarding milestones as a track: agent name, your name, call, what you need, gmail, graduated. reached ones are filled with the turn they happened on, a declined call is dashed, the rest are hollow. only turns that exist get nodes; the future is outlines.
- click a node and a small panel opens inside the map with the quoted message, the move, the framework's one line reason, its source, the checks, and "how it decides" one step further down. the bubble it explains lights up in the phone.
- keyboard: nodes are focusable, arrows or j / k step between them, enter opens, escape closes the node and then the map.

the map is sized to its content and only scrolls when it has to. when it does scroll to show an open node, it lands on a whole row and the top edge fades, so nothing looks sliced under the milestone track.

on phones the same map is a bottom sheet, opened from the menu.

this follows the same ideas as 14 (local explanations, two levels at most), with one more from shneiderman: overview first, zoom and filter, then details on demand (*the eyes have it*, 1996). the track is the overview, the graph is the zoom, the panel is the detail.

### why the per-bubble "why" is gone

14 put a "why" under every reply, and an "annotate" switch to show them all. both are gone, even with reasoning on. the user asked for it, and it holds up on its own: the map already ties each node to its bubble (click one, the other lights up), so a second entry point on every bubble was redundant, and it made the thread stop looking like a real thread. one entry point, and the phone stays a phone.

## "not in your contacts"

imessage showed a "report junk" link that did nothing. it's now "this sender is not in your contacts." with a dismiss that's remembered per session, and it hides itself once you save the contact card. google messages gets its card with add contact and dismiss, samsung its "add to contacts" row. only actions that work here made it in: add contact is the same save as the contact card, dismiss hides it. no report spam, no block, because they would be buttons that lie.

## light and dark

there's a sun / moon / system switch top right on the landing page and on /chat. it's one setting across both (stored once, default system), and a tiny script in the page head sets the theme before the first paint, so there's no white flash on a dark machine. next's own guide on preventing flash before hydration describes exactly this: an inline script plus `suppressHydrationWarning` on the element it changes.

persona has no dark site, so this one is their system turned over: a near-black ground, apple's dark greys for cards and hairlines, #f5f5f7 ink, the same blue. the mark and wordmark are drawn in the text color, so they flip with it. the landing hero phone stays a light imessage (it's a picture of a device), and the page around it goes dark.

the phones follow too, with their real dark modes, not an inverted light one. each skin keeps its colors in its own set of css variables with a light and a dark value, so the components don't know which theme they're in.

## fidelity pass

i went back to the real apps for every skin, light and dark, and put ours next to the reference at the same scale (the side by sides and the full diff -> fix list are in docs/design/phone-ui-spec.md, "fidelity pass"). the short version:

- **iphone.** apple's hig puts ios 26 system blue at #0088ff light and #0091ff dark, and that's what sent bubbles use now. received is #e9e9eb light (measured, three screenshots agree). i couldn't find a real ios 26 dark thread on a plain background, so dark received (#262628) is derived from apple's dark greys and said so. real sent bubbles shade by where they sit on screen; that's noted, not faked. tighter header gap, the name pill at its real size, 3px gaps inside a run and 10 between senders, the composer without its grey border, and a call screen closer to ios 26's glass buttons.
- **pixel.** dark now matches the user's own google messages screenshots to the hex (thread #131317, header, received and composer #1f1f23, sent #394668). it also has a real light mode now, on google's default blue scheme, where it used to be dark only. the header is lighter than the thread in dark (it was backwards), read receipts are the little circle on the bubble's corner, and the call screen follows the 2025 pixel phone app: timer over the name, oval buttons, a wide red end pill.
- **galaxy.** one ui 8 light and dark, with "read" stacked over the time beside your bubble. samsung messages is no longer shipped on new us galaxies (they use google messages), so this skin is the one ui look, not what every galaxy owner sees.

## sources

- ben shneiderman, "the eyes have it: a task by data type taxonomy for information visualizations" (ieee symposium on visual languages, 1996).
- apple, *human interface guidelines*, color (system colors for ios 26, light and dark).
- google, *material design 3*, color roles and the baseline scheme.
- next.js docs, "how to prevent flash before hydration" (node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md).
- paul lewis, "flip your animations" (2015).
- the user's own google messages screenshots, and the web references listed per skin in docs/design/phone-ui-spec.md.
