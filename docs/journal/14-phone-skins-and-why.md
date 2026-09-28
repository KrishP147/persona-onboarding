# 09. phone skins and "why it said that"

*sept 27, 2026*

two things bugged me about the web sim. it only ever looked like one phone (a dark google messages), and the "why" panel was a list glued to the side that you had to match up with the chat by eye. persona lives in your texts, so the sim should look like *your* texts, and the reasoning should sit next to the reply it explains.

## three phones

the sim now wears three skins: iphone (imessage on ios 26, light), pixel (google messages, material 3 expressive, dark) and galaxy (samsung messages, one ui 8, light). the numbers are in docs/design/phone-ui-spec.md. it picks one from your device (iphone or ipad gets iphone, samsung gets galaxy, other android and desktop get pixel), remembers your pick, and takes `?phone=` so a link opens the right one. switching is instant, mid conversation.

each skin keeps its own os colors, type and quirks: the imessage tail only on the last bubble of a run, "delivered" and "read 9:41 pm" under your last text, the tapback in the corner, the "imessage" field with the round blue send; google's flattened inner corners and the little read circle; samsung's times beside the bubbles and the floating header pill. the call screens follow each phone too (ios round buttons, pixel pills and the slow scalloped avatar, samsung green on the left).

the behavior underneath is the same everywhere. i pulled all of it out of the page into one hook (pacing, receipts, voice notes, the call flow, the gmail popup, saving the contact, offline, errors), and the skins only draw. a skin can't change what happens, only how it looks.

the page around the phone now uses persona's own design language (docs/design/persona-site.md): white ground, one ink, pill buttons, the mark and wordmark top left. the phone screen does not. the point is that it feels like your phone, not like a website.

## why it said that

every agent message already carries the move code picked for it and where the idea comes from (src/lib/moves.ts). the question was how to show that without breaking the illusion of a real thread.

- **local, not global.** microsoft's hax guideline 11 asks you to "make clear why the system did what it did", and the useful version is a local explanation per output, tied to the input that caused it. so there's one card per reply, not an essay about the system.
- **partial and honest.** google's pair guidebook says to keep explanations partial and specific, and not to dress up confidence you don't have. each card says what it is: the move was traced (code picked it before the model wrote a word), the wording is the model's. no percentages.
- **two levels, no more.** nn/g on progressive disclosure: show the essentials, put the rest one step away, and never nest deeper than two levels. the card shows the move, a quote and the source; clicking opens the framework's one line reason. "how it decides" sits once at the top, folded.
- **on desktop, a margin.** cards sit level with their bubble, like comments in a doc, and push apart when they collide. hover a card and its bubble outlines; hover a bubble and its card lifts. j and k step through turns.
- **on a phone, a sheet.** there's no room for a margin, so each reply gets a small "why" (with a 44 point hit area, per apple's human interface guidelines) that opens a half height sheet: an ios grabber sheet on the iphone skin, a material sheet on the android ones. the chat stays visible above it and the explained bubble scrolls into view. swipe or tap the arrows for the next turn; focus goes back to the "why" when it closes. an "annotate" switch in the menu shows the move inline under every reply for people who want it all at once.

the research families are color coded, but never by color alone: every card and chip names its framework in text (mom test, attunement, reciprocity, permission, clarity, craft). there are no tooltips (they don't work on touch), nothing opens by itself, and motion drops to a fade when the system asks for reduced motion.

## sources

- microsoft, *guidelines for human-ai interaction*, g11 "make clear why the system did what it did" (amershi et al., chi 2019).
- google pair, *people + ai guidebook*, "explainability + trust".
- nielsen norman group, "progressive disclosure" (nielsen, 2006).
- apple, *human interface guidelines*: sheets, and layout (44 by 44 point minimum hit targets).
