# phone-ui-spec: messaging simulator skins + explainability UI

researched 2026-09-27. values in CSS px at a **390 px wide reference screen** (1 pt / 1 dp ~= 1 px). scale everything by `W/390` for other widths (use a `--u` custom prop: `--u: calc(var(--screen-w) / 390)`).

confidence tags: **[src]** = taken from a cited primary/secondary source. **[est]** = best-evidence estimate from screenshots/prior app knowledge, verify against a real device screenshot before shipping. most per-pixel app values are NOT published by Apple/Google/Samsung; Figma community kits hold them but aren't text-fetchable.

version note: iOS 27 shipped Sept 2026 but per iDownloadBlog lists no visual Messages changes vs iOS 26, so the iOS 26 Liquid Glass look is still current. Google Messages got its M3 Expressive chat screen in Aug 2025 plus 2026 tweaks (read receipt circle, floating long-press menu, single-line field, bigger header avatar).

---

## 0. shared device-frame numbers

| item | iPhone (iOS 26) | Pixel (Android 16) | Galaxy (One UI 8) |
|---|---|---|---|
| reference viewport | 393x852 (iPhone 16) / 402x874 (iPhone 17) [src useyourloaf] | 412x915 (Pixel 9/10 class) [est] | 360x780 (S25) / 384x824 (S25 Ultra) [src viewpo] |
| screen corner radius @390 | 55 (iPhone 14 Pro-16), 62 (16 Pro, 17 family) [src ScreenCorners] -> use **55** | **44** [est] | **40** [est] |
| status bar height | 54 [src]; safe-area top 59 (16) / 62 (17) [src] | **44** (punch-hole devices) [est] | **40** [est] |
| cutout | Dynamic Island capsule **126x37**, top **11**, radius 999 [est, widely quoted 126x37.33] | centered punch-hole **dia 12**, top **14** [est] | centered punch-hole **dia 11**, top **12** [est] |
| time position | left ear, centered in the ear's width, "9:41", SF Pro Semibold 17 [est] | left, 16 inset, "9:41", Google Sans 14 medium [est] | left, 18 inset, "9:41", SamsungOne 14 medium [est] |
| right icons | cellular bars, Wi-Fi, battery pill (27x13, radius 4, no %) [est] | Wi-Fi, cellular, battery (vertical-ish pill) + optional % [est] | cellular, Wi-Fi, battery with % "87%" to the left of glyph [est] |
| bottom | home indicator **134x5**, radius 3, bottom **8**, #000 light / #fff dark; safe-area bottom 34 [src insets; bar est] | gesture handle **108x4**, radius 2, bottom **8**, rgba(0,0,0,.85)/#fff; nav area 24 [est] | gesture handle **120x4** OR 3-button bar 48 tall (default on many Galaxy = gestures since One UI 6) [est] |

frame CSS: outer bezel `border-radius: calc(screen-radius + bezel)`, bezel 12 px, color #1c1c1e; screen `overflow:hidden; border-radius: var(--screen-r)`. status bar is `position:absolute` over content (iOS content scrolls under it with a scroll-edge fade).

---

## A1. iMessage skin (iOS 26 Liquid Glass) - light + dark, follows the page theme

### colors

| token | light | dark | note |
|---|---|---|---|
| screen bg | #FFFFFF | #000000 | [src HIG systemBackground convention] |
| sent iMessage bubble | **#0088FF** | **#0091FF** | = iOS 26 systemBlue (HIG: 0,136,255 / 0,145,255) [src HIG]. real bubbles shade by screen height (measured top #00B4FE -> bottom #017EFE press, #2599FB -> #0E8FFD device); we paint flat systemBlue, see fidelity pass |
| sent SMS/RCS bubble | **#34C759** | **#30D158** | systemGreen [src HIG] |
| sent text | #FFFFFF | #FFFFFF | |
| received bubble | **#E9E9EB** | **#262628** | light measured (3 refs agree); dark derived, no real iOS 26 dark thread found (see fidelity pass) |
| received text | #000000 | #FFFFFF | |
| secondary label (timestamps, Delivered) | #8A8A8E | #8D8D93 | [est ~ secondaryLabel] |
| link in bubble | underline, same color as text in sent; #0088FF in received | | [est] |
| destructive red (calls) | #FF383C | #FF4245 | [est, iOS 26 systemRed] |

### typography
font stack: `-apple-system, "SF Pro Text", "SF Pro", system-ui, "Helvetica Neue", Arial, sans-serif` (on non-Apple web: Inter at 16.5px with `letter-spacing:-0.2px` is the closest free match).

| use | size/leading | weight | source |
|---|---|---|---|
| bubble text | **17/22** (Body) | 400 | [src HIG type table] |
| header name | 11-12/13 in glass capsule | 600 | [est] |
| date separator | 11/13 (Caption 2) - "Today" 600 + " 9:41 AM" 400 | | [src sizes; format est] |
| Delivered / Read | 11/13, 600 for label, 400 for time | | [est] |
| link preview title | 15/20 600; domain 13/18 400 secondary | | [est] |

### header (iOS 26: no opaque bar; floating glass controls over content with a top scroll-edge blur)
| element | value |
|---|---|
| back | glass circle **44x44** at left 16, top = statusbar+4; SF chevron.left 17 pt semibold, color label. unread count badge may sit right of the chevron inside a capsule [est] |
| avatar | centered, **50** circle, top = statusbar+2 [est] |
| name | directly below avatar in a glass capsule (h 28, px 12), **15/600**, followed by a small gray `>` chevron (measured: "2 People" pill 98x29 pt in apple press) |
| right | FaceTime video glass circle 44x44, right 16 [est] |
| total header height | ~ statusbar + **96** = 150 at 390 [est] |
| glass material CSS | `background: rgba(255,255,255,.55); backdrop-filter: blur(20px) saturate(180%); border: .5px solid rgba(255,255,255,.6); box-shadow: 0 1px 3px rgba(0,0,0,.08), inset 0 1px 0 rgba(255,255,255,.7)`; dark: `rgba(40,40,42,.55)`, border rgba(255,255,255,.12) [est] |
| scroll-edge effect | content under header fades: `mask-image: linear-gradient(to bottom, transparent 0, #000 150px)` on a blurred overlay (not a hard edge) [est] |

### bubbles
| prop | value |
|---|---|
| padding | **7px 12px** (single-line bubble height 36) [est] |
| radius | **18** all corners [est]; iMessage does NOT flatten inner corners for grouped bubbles (unlike Android) |
| max width | **~70% of screen** (272 at 390) [est] |
| side inset | 16 from screen edge (tail tip reaches ~11) [est] |
| gap same sender, grouped | **2** [est; Kraft uses 2] |
| gap between groups / sender change | **8-10** [est] |
| tail | only on the LAST bubble of a consecutive run; bottom-right for sent, mirrored bottom-left for received |
| emoji-only (1-3 emoji) | no bubble, emoji at ~48 px [est] |
| timestamp per bubble | hidden; revealed by swipe-left drag (bubbles slide ~60 px, time right-aligned 11/13 gray) |

**tail, SVG (preferred; works over wallpapers/backgrounds).** place a 20x20 svg absolutely at `bottom:0; right:-5px` (sent). bubble box keeps radius 18; the svg overlaps the bottom-right corner and fills it.

```html
<svg class="tail" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
  <!-- x=15 is the bubble's right edge; y=20 bubble bottom. covers the rounded corner, adds hooked tip. -->
  <path d="M0 0H15V8C15 14 16.5 17.5 20 20C16 20.5 11.5 19.8 8 17.5C6.5 19 4 20 0 20Z" fill="currentColor"/>
</svg>
```
```css
.b{position:relative;border-radius:18px;padding:7px 12px;max-width:70%;}
.b.sent{background:var(--sent);color:#fff;align-self:flex-end;}
.b.sent .tail{position:absolute;right:-5px;bottom:0;color:var(--sent);}
.b.recv .tail{position:absolute;left:-5px;bottom:0;transform:scaleX(-1);color:var(--recv);}
```
[est geometry; tune tip curvature against a screenshot]. CSS-only alternative: Samuel Kraft's two-pseudo-element trick (`:before` colored 20x25 with `border-bottom-left-radius:16px 14px`, `:after` bg-colored 26x25 with radius 10) [src samuelkraft] - only works on solid backgrounds, breaks on iOS 26 custom backgrounds; avoid. For gradients, use `mask` of bubble+tail on a full-height gradient layer (iMessage gradient is viewport-fixed, so bubbles higher up are slightly different blue) [est].

### separators, receipts, typing
| item | spec |
|---|---|
| date/time separator | centered, 11/13, gray; shown when gap between messages > ~1 h [est]. formats: `Today 9:41 AM`, `Yesterday 8:02 PM`, `Monday 8:02 PM` (within 7 days), `Sat, Sep 20 at 8:02 PM` (older) [est]. first word semibold. margin 14 top/8 bottom |
| iMessage/SMS label | first message of an SMS/RCS thread shows `Text Message • SMS` / `Text Message • RCS` centered separator [est] |
| Delivered | under LAST sent bubble only, right-aligned to bubble edge (right 20), 11/13 gray, margin-top 2. Read: `Read 9:43 AM` ("Read" 600) [est] |
| typing indicator | received-colored bubble **~58x36**, radius 18, three dots dia **8**, gap 4, color #8E8E93 (dark #9A9AA0); dots pulse opacity .35->1 staggered 0/150/300 ms, 1.2 s loop; "thought" tail = two circles dia 8 and 4 bottom-left (instead of the normal tail) [est] |

### composer (iOS 26)
| element | value |
|---|---|
| plus | glass circle **38** (measured 37.6), left 12, SF "plus" 17 pt, label color (was blue pre-iOS 26) |
| field | glass capsule, height **38** (measured), full pill radius, no visible border, left gap 8, right inset 12; placeholder **"iMessage"** (blue threads) / **"Text Message • SMS"** / **"Text Message • RCS"** (green), color tertiaryLabel (measured #BCBCBC-#D0D0D0 on white) |
| mic | inside field right: SF "mic" 17 pt gray; when text present replaced by send |
| send | filled circle **28-30** in bubble color (#0088FF or green), white `arrow.up` 15 pt bold, inside field at right 4 [est] |
| bottom padding | bar sits 8 above safe-area (34) -> field bottom at 42 from screen bottom with no keyboard [est] |

### rich content
| item | spec [all est] |
|---|---|
| link preview | bubble-shaped card width 264, radius 18, tail on bottom; image top (aspect 1.91:1 or square icon 40 left), footer bg #E9E9EB (light) / #262628 even for sent; title 15/20 600 black, domain 13/18 gray; no border |
| contact card | received/sent bubble 264 wide: 40 avatar + name 15/600 + chevron.right gray; footer row "View" (optional) |
| tapback | circle badge **30** dia at top outer corner of the bubble (received msg -> top-right, sent -> top-left), offset -12 x / -14 y; your reaction = blue #0088FF bg + white glyph; theirs = #E9E9EB bg gray glyph (dark #3A3A3C); 2 px border in screen bg color; small tail of two dots toward the bubble. any emoji allowed since iOS 18 |
| missed call | NOT native in Messages. simulator liberty: centered system row `Missed Call · 9:41 AM` 11/13 gray with phone.down glyph red; or render a FaceTime-style card |

### unknown number (iOS)
avatar: circle with gray gradient `linear-gradient(#A5ABB8,#858994)` + white person silhouette (glyph 60% of dia) [est]. header name = formatted number `+1 (416) 555-0134`. above composer: gray text row "This sender is not in your contacts. **Report Junk**" (blue link), 13/18 centered [est]. **sim:** Report Junk is dropped (it did nothing here); the blue action is **Dismiss** (hides the line for this conversation), and the line goes away once the contact card is saved. iOS 26 also filters into "Unknown Senders" list [src MacRumors].

### iOS 26 call screen (full-screen style)
| element | spec [est unless noted] |
|---|---|
| bg | contact poster OR blurred avatar/gradient; for unknown: dark gray gradient #2C2C2E->#1C1C1E |
| top | caller name 34/41 400 (Large Title, SF Pro Display) centered at ~y 120; subtitle "mobile" / "Unknown Caller" / city 17 gray-white 70% |
| unlocked incoming | two circles **75** dia: Decline red #FF383C left (x center 25%), Accept green #34C759 right (75%), glyphs phone.down.fill / phone.fill white 30; labels 13/18 white below, 8 gap. above them: two glass buttons "Remind Me" (clock) and "Message" (bubble) 44 circles with labels [src iDownloadBlog feature list] |
| locked incoming | "slide to answer" glass track 300x75 radius 38 with green knob 64 [src behavior per SlashGear/Apple Support; dims est] |
| in-call | 2x3 grid of glass circles **77** (measured; we use 76) with a 1 px light rim, ~42 pt apart: speaker, FaceTime, mute / more, **end (red)**, keypad; labels **15** below; timer "00:47" small ABOVE the name, name 34 bold [src apple press hold assist render] |
| iOS 26 new | "Hold Assist", "Call Screening" for unknown callers (Screen Unknown Callers asks for name/reason before ringing) [src 9to5Mac] - nice hook for an unknown-number demo |

---

## A2. Google Messages skin (Android 16, M3 Expressive) - light + dark, follows the page theme

dark = measured off the user's own Pixel (dynamic color, purple-gray seed); light = Google's GM3 baseline scheme (what Google apps show with no wallpaper seed). full table + reasoning in "fidelity pass > pixel" below. role rule (from the real screenshots): app bar, received bubble and composer pill share surfaceContainer; the thread is surface; light sent = primary + onPrimary, dark sent = primaryContainer + onPrimaryContainer.

| token | dark (measured) | light (GM3 baseline) |
|---|---|---|
| app bar / screen ground | **#1F1F23** | #F0F4F9 |
| thread container (rounded top) | **#131317** | #FFFFFF |
| sent bubble | **#394668** (text #FFFFFF) | **#0B57D0** (text #FFFFFF) |
| received bubble | **#1F1F23** (text #E3E2E7) | **#F0F4F9** (text #1F1F1F) |
| primary (send button, links) | #B7C4F2 on #202F55 [est] | #0B57D0 on #FFFFFF |
| secondary text, icons, placeholder | **#C5C6D0** | #444746 |
| voice button | **#513F66** (glyph #EFDBFF) | #D3E3FD (glyph #041E49) |
| error | #F2B8B5 | #B3261E |

### typography
font stack: `"Google Sans Text", "Google Sans", "Roboto Flex", Roboto, system-ui, sans-serif`. Google Sans is not licensed for web embedding; ship **Roboto Flex** (Google Fonts) or **"Google Sans Flex"** only if licensed. [est]

| use | size/leading | weight |
|---|---|---|
| bubble text | **16/24** (the user's phone shows ~18: pinch-zoomed chat text; we keep the default) | 400 |
| header name | 22/28 (title-large) [est] | 400 (500 in M3E) |
| date separator | 12/16 [est] | 500 |
| timestamp/status | 12/16 [est] | 400 |

### header + thread container
| element | value |
|---|---|
| app bar | height **64** below status bar, bg = app bg; back arrow 24 icon in 48 touch target at left 4 [est] |
| avatar | **40** circle (bigger since 2026 per 9to5Google) left 56 [src size change; value est] |
| name | 22/28, one line ellipsis; subtitle none by default (optional "RCS" chip) [est] |
| right | phone 24, videocam 24, more_vert 24, each 48 target [src 9to5Google] |
| thread container | below app bar, `border-radius: 20px 20px 0 0` (measured ~52 px at 1080 = 20 dp) |
| wallpaper | solid colors (bubbly wallpaper removed) unless Chat theme set [src 9to5Google] |

### bubbles
| prop | value [est] |
|---|---|
| padding | **9px 16px** (single-line height 42; measured 41.5) |
| outer radius | **20**; grouped inner corner **4** |
| grouping corners (sent, right side) | single: 20/20/20/20. first: TL20 TR20 BR4 BL20. middle: TL20 TR4 BR4 BL20. last: TL20 TR4 BR20 BL20. mirror for received (left side) |
| gap grouped / between groups | **3** / **16** (measured) |
| max width | **~82%** of the thread width (measured 851 of 1038 px) |
| side inset | **8** both sides (measured 21 px at 1080); 1:1 threads show no avatar beside received bubbles |
| tails | none |
| timestamps | hidden; swipe-left reveals per-message times; tap bubble shows "9:41 AM" under it [src swipe gesture 2026] |
| date separator | centered `Today • 9:41 AM`, or `Sat, Sep 20 • 8:02 PM` [est format] |
| read receipt | small **16** circle at bottom-right corner of the last sent bubble (outside, overlapping by 4) - check_circle glyph for delivered, contact's avatar mini for read [src "circle at bottom-right corner" 2026; details est] |
| typing | received bubble 56x36 with 3 dots dia 6, bounce translateY -3 px staggered 160 ms, 1.4 s loop, avatar shown left [est] |
| long-press | floating menu, background blurred (2026) [src] |

### composer (2025 redesign + 2026 single-line)
| element | value |
|---|---|
| plus | circle **40** outside/at left of field, `add` icon 24, bg surface-container-high [src ordering; size est] |
| field | pill, height **52** (measured), full radius, bg = received bubble color; placeholder **"RCS message"** or **"Text message"** (an experiment showed "(RCS)"/"(Text)") [src Android Police/9to5Google] |
| inside right | emoji/sticker (add_reaction) 24 + gallery (image) 24 [src] |
| mic -> send | separate circle **52** right of field (measured), gap 8, filled tertiaryContainer in the user's scheme (#513F66); mic icon, morphs to send (arrow/paper-plane) when text present, 150 ms scale+fade [src behavior; size est] |
| bottom padding | 8 above gesture area (24) [est] |
| plus menu | pill-shaped monochrome containers in a grid (Gallery, Camera, GIFs, Stickers, Files, Location, Contacts, Schedule send...) [src 9to5Google] |

### rich content [est]
| item | spec |
|---|---|
| link preview | card radius 20, bubble color, image top full width (max 240 h), title 14/20 500 two lines, domain 12/16 secondary |
| contact (vCard) | bubble with 40 avatar + name + "View contact" text button in primary |
| reaction | emoji chip, height 24, px 6, radius 12, bg surface-container-highest (#33373E dark), 2 px ring in container bg, overlapping the bubble's bottom outer corner by 8; count "2" 12/16 if multiple |
| missed call | not native; use centered row with `phone_missed` 16 icon in error color + "Missed call · 9:41 AM" 12/16 |

### unknown number
avatar: 40 circle, **#FCC934** yellow with a dark `person` glyph (measured, user's screenshot 195145). header shows number `+1 416-555-0134` [est]. banner card above composer, radius 16: "Unknown sender" + **Report spam** / **Not spam** tonal buttons; links disabled until marked safe [est; long-standing GM behavior]. **sim:** card keeps only working actions: **Add contact** (the contact card's save) and **Dismiss**.

### Pixel Phone call screen (M3E)
| element | spec |
|---|---|
| avatar | M3E **"scalloped"/cookie shape** that slowly rotates (~20 s/rev) , dia ~ 120, top ~ 180 [src shape+rotation Android Police/9to5Google; dims est] |
| text | status line above the name (in-call: call glyph + timer), name 36-40, "Mobile +1 ..." 16 secondary below, then the photo [src 9to5google renders] |
| answer | swipe mode: pill track with a white cookie knob. tap mode: two ovals ~84x68, Decline #ED665A left / Answer #5ABA75 right, dark glyphs, labels 16 below (measured, 9to5google). **sim: tap mode** |
| in-call | controls sit in a rounded-top panel (surfaceContainer); buttons **oval 80x64** (measured) darker than the panel, rounded-square + light fill when on; labels 14 below; end call **pill 168x64** #ED665A, dark glyph |
| bottom | "Message" text button (reply with SMS) [est] |

---

## A3. Samsung Messages skin (One UI 8) - light

| token | light | dark [for completeness] |
|---|---|---|
| app bg | **#F6F6F8** [est] | #000000 |
| sent bubble | **#D2E3FC** pale blue, text **#111111** [src "pale blue with dark text" (secondary blog); hex est]; One UI 8 color palette may tint it muted slate/green [src Samsung Community] | #1E3A5F text #FFFFFF [est] |
| received bubble | **#FFFFFF**, text #111111 [est] | #262626 text #FAFAFA [est] |
| secondary | #7B7B7B | #8F8F8F [est] |
| accent (send, links) | **#3E91FF** [est: One UI accent blue] | #5AA2FF |
| decline red | #F14B4B [est] | |
| accept green | #2FB65A [est] | |

typography: SamsungOne / "One UI Sans" (not web-licensed) -> `"SamsungOne", "Samsung Sans", Inter, Roboto, system-ui, sans-serif`. Inter at 15.5-16 px matches its x-height best [est].

| use | size/leading [est] |
|---|---|
| bubble | **16/22** 400 |
| header name | 19/24 600 |
| header sub (number) | 13/18 400 secondary |
| time beside bubble | 11/14 |
| date separator | 12/16 600 |

### header (One UI 8 / 8.5)
| element | value [est unless noted] |
|---|---|
| layout | back `<` 24 icon (48 target) left; avatar 36 circle; name + number stacked; right icons: call, video, more (3 dots) |
| background | transparent over content with gradient fade at top; buttons are **filled floating** circles; avatar+name float in their own pill container (8.5) [src SammyGuru] |
| height | 64 below status bar |

### bubbles [all est]
| prop | value |
|---|---|
| padding | 10px 14px |
| radius | **22** all corners; grouped inner corners reduce to **6** (same pattern as Google table) |
| max width | ~72% |
| tails | none |
| gap grouped / groups | 3 / 14 |
| time | small `9:41 AM` next to the LAST bubble of a group, outside, bottom-aligned (left of sent bubble, right of received), 11/14 gray; RCS status word above time: "Read" / "Delivered" |
| date separator | centered `Saturday, September 27` 12/16 600 gray, no lines |
| typing | received bubble with 3 dots dia 6 wave |

### composer [est]
| element | value |
|---|---|
| plus | circle 40, outline-less, `+` 24 gray, left 8 |
| field | pill h 44 radius 22 bg #FFFFFF (on #F6F6F8) ; placeholder **"Enter message"** (older), current builds show **"RCS message"/"Text message"** depending on chat type - pick "Enter message" for SMS era look |
| inside right | emoji 24, (voice) mic 24 |
| send | circle 40 accent #3E91FF with white arrow/paper-plane; disabled grey when empty; long-press send = schedule |
| bottom | 8 above gesture area |

### rich / unknown / call [est]
- link preview: white card radius 18, image top, title 14/600, url 12 gray.
- reactions: emoji pill under the bubble's bottom corner, white bg, 1 px #E3E3E3 border, h 22.
- missed call: Samsung Messages doesn't log calls in thread; use centered gray row like above.
- unknown number avatar: circle with light tinted bg (#E3E8F0) + gray person silhouette; header shows number as title; Samsung/Hiya "Suspected spam" red label possible under number. real unknown-number bar under the header: "Add to contacts | Block". **sim:** "Add to contacts" (the contact card's save) + a close (x) that dismisses; block is dropped.
- Samsung Phone incoming (One UI 8): name 32/600 center at ~y 180, number 16 gray, "Mobile · Canada" 13; bottom row: **green circle (accept) left, red circle (decline) right**, each dia 72, swipe outward any direction; bottom center pill "Send message" 13. In-call: 3x3 grid of 56 circular icon buttons (Record, Video call, Bluetooth, Speaker, Mute, Keypad, Hold, Add call...), end button red circle 72 centered bottom.

---

## A4. cross-skin implementation notes
- model bubbles as `{sender, text, ts, status, reactions[], kind}`; compute group position (`single|first|middle|last`) once, then skins map it to corners/tails/avatars.
- break a group when sender changes OR gap > 60 s (Apple) / 60 s (Google) [est].
- `backdrop-filter` needs `-webkit-` prefix for Safari; fall back to opaque `rgba(...,.92)` when `@supports not (backdrop-filter: blur(1px))`.
- respect `prefers-color-scheme` only if the skin allows; keep skin mode explicit in state.
- never use real brand fonts via hotlink; self-host free fallbacks.

---

## B. explainability UI: "why the AI said that"

### principles (from sources)
- HAX G11 "Make clear why the system did what it did": offer **local explanations** per output (G11-A), map input attributes to outputs (G11-D), **what-if** (G11-G); warn: explanations can drive over-reliance [src HAX].
- PAIR: prefer **partial, specific** explanations tied to the user's action; show confidence as **categories** or **N-best alternatives** rather than raw % unless users understand probability [src PAIR].
- NN/g progressive disclosure: **max 2 levels**; label the trigger so it sets expectations [src NN/g].
- HIG sheets: medium detent for progressive disclosure, grabber visible and tappable (cycles detents, VoiceOver-accessible), swipe down to dismiss [src HIG].
- source-presentation study (n=394): hover cards / sidebars get more hovering but few clicks; high visibility can *reduce* knowledge gain unless the content is worth opening; sidebar uniquely shifted agreement [src arXiv 2512.12207] -> keep explanations **substantive and scannable**, not decorative, and don't claim more than the trace supports.
- Perplexity pattern: inline numbered markers + hover preview card + source list [src]. Copilot "references"/code-citation: a post-hoc "matched public code" disclosure. Google Docs/Medium: margin notes anchored to text, highlighted anchor on hover.

### explanation card content (same data on both surfaces)
```
{ turn: 7, speaker: "agent", bubbleId, summary: "<=90 chars why",
  framework: {id, label, color},   // e.g. "SPIN", "Motivational interviewing", "Policy: KYC"
  signals: ["user said X at T5", ...],   // G11-D input->output mapping, quote + turn link
  sources: [{title, excerpt, url?}],      // retrieval / playbook passages
  alternatives: [{text, whyNot}],         // N-best, max 2
  confidence: "high|medium|low",          // categorical per PAIR
  fidelity: "model-stated" | "traced" }   // be honest: rationale text vs logged tool/retrieval trace
```
level 1 (compact) = turn chip + framework tag + summary + confidence. level 2 (expanded) = signals, sources, alternatives, what-if. no level 3.

### desktop (>= 1024 px): phone + anchored timeline sidebar
layout: `grid-template-columns: minmax(360px, 420px) 1fr` with phone centered in col 1 and sidebar width **380-440**; or phone left, sidebar right. sidebar = vertical timeline, one card per AI turn (skip human turns; show them as thin 1-line "context" ticks for orientation).

| element | spec |
|---|---|
| card compact | h ~64, padding 12 14, radius 12, 1 px border `--line`; left 3 px color stripe = framework color; row 1: turn chip `T7` (mono 11/600, bg tint), framework label 12/500, confidence dot+word right; row 2: summary 14/20, 2-line clamp |
| card expanded | inline accordion (not modal); sections with 12/600 small-caps labels: Signals, Sources, Alternatives, What if; each signal quote is a button that scrolls the phone to that turn |
| framework colors | max 6 categorical hues + always a text label; e.g. #2563EB, #059669, #D97706, #DB2777, #7C3AED, #0891B2 (tint 12% for chip bg). never color-only |
| anchoring | sidebar scroll is synced to phone scroll: card's top aligns to its bubble's y when space allows (Google Docs comment model); cards stack/push down on collision with 8 px gap; draw a 1 px connector (SVG path, framework color, 40% opacity) from bubble edge to card only for the hovered/active pair |
| hover bubble | bubble gets 2 px outline in framework color (outline-offset 2) + card gets raised shadow; 120 ms ease-out |
| click bubble / card | sets `active` (persistent), expands card, smooth-scrolls the other pane (`scrollIntoView({block:'center', behavior: reduced ? 'auto':'smooth'})`), 600 ms one-shot pulse ring on the bubble |
| filters | top of sidebar: segmented "All / by framework"; toggle "Show human turns"; density toggle compact/comfortable |
| keyboard | sidebar is a `role="list"`; each card a `<button aria-expanded aria-controls>`; `j/k` or arrow up/down move active turn; `Enter` expand; `Esc` collapse; focus follows active; bubble has `aria-describedby` = card summary id |
| live | when the sim is streaming, new card slides in 180 ms, sidebar autoscrolls only if user is at bottom (don't yank) |

### mobile (page IS the phone, < 640 px): drop the fake frame and status bar mock entirely
| element | spec |
|---|---|
| per-bubble affordance | small **"why" badge** 18 dia (sparkle or `i` glyph 12) placed just outside the AI bubble's bottom outer corner (opposite the tail), framework-colored ring; hit area padded to **44x44** (HIG) / 48 (M3) via transparent pseudo-element; `aria-label="Why this reply, turn 7"`. only on AI turns. subtle, 70% opacity until focused |
| tap badge | opens **bottom sheet at medium detent (~50% height)**, grabber 36x5 radius 3 (iOS) / 32x4 (M3), top radius **28** (M3) / ~38 on iOS 26 floating sheet with 8 px side inset [est]. chat stays visible above; the explained bubble is scrolled into the visible top half and outlined |
| sheet content | header: `Turn 7 of 12` + framework tag + close (44 target); body = level-1 summary, then level-2 sections as collapsible rows; drag to large detent to see everything |
| swipe between turns | horizontal swipe inside sheet (scroll-snap carousel, `scroll-snap-type:x mandatory`) moves to prev/next AI turn; chat scrolls in sync behind; also visible `‹ ›` buttons (swipe must never be the only way) and dots/`7/12` pager |
| dismiss | swipe down, tap scrim (scrim rgba(0,0,0,.32) only at large detent; none at medium so the chat remains interactive), Esc, close button |
| annotations mode | toolbar toggle "Annotate": inline margin chips under each AI bubble (framework tag + 1-line summary, 12/16, max 2 lines), tap chip = open sheet. off by default |
| a11y | sheet `role="dialog" aria-modal="true"` at large; at medium use `aria-modal="false"` + `role="region"` label; focus moves to sheet heading on open and **returns to the badge** on close; carousel slides `aria-roledescription="slide"` + `aria-live="polite"` announce "Turn 8 of 12" |

### motion
| event | timing |
|---|---|
| hover highlight | 120 ms ease-out |
| card expand/collapse | 200-240 ms `cubic-bezier(.2,0,0,1)` (M3 standard) height+opacity |
| sheet open | 350 ms `cubic-bezier(.32,.72,0,1)` (iOS-like) translateY; M3 skin: 400 ms emphasized decelerate `cubic-bezier(.05,.7,.1,1)` |
| sheet close | 250 ms `cubic-bezier(.3,0,.8,.15)` |
| turn swipe | native scroll-snap; programmatic 280 ms |
| bubble pulse | 600 ms, 1 iteration |
| reduced motion | `@media (prefers-reduced-motion: reduce)`: all to 0-80 ms opacity only, no pulses, no smooth scroll |

### what NOT to do
- no tooltips for explanations (unreachable on touch, lost on focus change, too small for sources).
- don't auto-open explanations or put rationale text inside the chat bubbles (it breaks the realism of the sim and competes with the conversation).
- don't exceed 2 disclosure levels; no nested modals; no sheet-on-sheet.
- don't color-code without labels; don't use >6 framework colors; don't reuse the skin's sent-bubble blue as a framework color.
- don't show a precise % confidence ("87.3%") unless calibrated; use high/med/low.
- don't present model-generated rationale as ground truth: mark `model-stated` vs `traced` fidelity visibly.
- don't let the sidebar scroll-jack the phone while the user is reading elsewhere; sync only on explicit selection or when follow-mode is on.
- don't cover the explained bubble with the sheet; don't use a full-screen modal for level 1.
- don't hide the per-bubble badge behind long-press (undiscoverable).

---

## fidelity pass (2026-09-27)

each skin checked against real screenshots in light and dark. colors live as css vars on a per-skin class in `src/app/globals.css` (light on the class, dark under `html[data-theme="dark"]`); components only read `var(--<skin>-*)`, and the screen root takes its ground/ink as tailwind classes (`bg-[var(..)]`) so they stay in the utilities layer. side-by-sides (real left, ours right) are build artifacts, not in the repo.

### iphone (iMessage, iOS 26)

vars: `.sk-ios` on the chat screen root and on the call screen root, `--ios-*`. follows the page theme (was light only). references: apple newsroom iOS 26 press renders (thread, hold assist call), an idownloadblog device screenshot (light), macrumors device screenshots (dark, aurora chat background). **no real iOS 26 dark thread on a plain black ground was found** (searched apple support, macrumors, 9to5mac, idownloadblog); dark values are HIG dark system colors plus prior-iOS measurements, flagged below.

diff -> fix

| what differed | fix |
|---|---|
| hard-coded light colors everywhere (bubbles, glass, status bar ink, scroll-edge fade, banners, cards, rich theme) | all moved to `--ios-*`; real dark palette added; home indicator follows the theme (`DeviceFrame` in Phone.tsx reads `useDark()` unless `dark` is forced, as the call phone does) |
| ~45 pt dead gap between header and first date stamp | thread top pad `sb+112` -> `sb+76`: "iMessage / Today" tucks under the name pill like the ref |
| name pill 12 pt in a 24 pt capsule | 15/600 in a 28 pt capsule (measured) |
| grouped gap 2, sender-change gap 9 | 3 and 10 (measured 4 / 10-11 pt) |
| composer 36 pt, field with a gray border, placeholder secondaryLabel | 38 pt, no border (faint rim), placeholder tertiaryLabel |
| sent bubble per-bubble `linear-gradient(#1A93FF,#0088FF)` with a flat tail (seam) | flat systemBlue shared by bubble + tail (`.sk-ios-sent`); the tail is now a clip-path box so it can share any fill |
| call: timer under the name, 72 circles, 12 pt labels, no rim | timer above the name, name semibold, 76 circles + 1 px rim, 15 pt labels, 40 gap. button rows unchanged |

left, and why

- **sent gradient by screen height**: tried `background-attachment: fixed`. the phone screen is transformed (`translateZ(0)`, for the rounded clip), so chrome paints fixed as scroll and every bubble got its own banded gradient. doing it right needs a scroll-driven offset per bubble; not worth it for a ~15% lightness shift.
- call background stays a dark gray gradient in both themes (real iOS paints the poster / blurred avatar; no default-poster reference). end button stays systemRed; the press render reads darker (#AC0401) through the glass tint.
- header right button stays a phone (the ref shows FaceTime video) because it starts our voice call.
- SF Pro is not on non-Apple machines; the stack falls back to Inter, which sets a touch wider.
- link-preview / gmail card image areas stay light in dark (they are images).

colors

| token | light | dark | source |
|---|---|---|---|
| `--ios-bg` | #FFFFFF | #000000 | HIG systemBackground |
| `--ios-ink` | #000000 | #FFFFFF | label |
| `--ios-gray` (stamps, receipts, typing dots) | #8A8A8E | #8D8D93 | secondaryLabel over the ground (#3C3C43 / #EBEBF5 at 60%) |
| `--ios-placeholder` | rgba(60,60,67,.3) | rgba(235,235,245,.3) | tertiaryLabel |
| `--ios-blue`, `--ios-sent` | #0088FF | #0091FF | HIG systemBlue (2025) |
| `--ios-recv` | #E9E9EB | #262628 | light measured; dark **derived**: between systemGray5 #2C2C2E and systemGray6 #1C1C1E, equal to the long-measured iOS 13-18 value (#262629), 15:1 with white text |
| `--ios-red`, `--ios-green` | #FF383C, #34C759 | #FF4245, #30D158 | HIG 2025 |
| `--ios-glass` | rgba(255,255,255,.62) | rgba(44,44,46,.62) | est; dark matches the macrumors dark header buttons |
| `--ios-field` | rgba(255,255,255,.92) | rgba(36,36,38,.86) | est |
| `--ios-sep` | rgba(60,60,67,.18) | rgba(84,84,88,.6) | separator |
| `--ios-info-bg` / `-ink` | #F2F2F7 / #3C3C43 | #1C1C1E / rgba(235,235,245,.75) | systemGray6 |
| `--ios-err-bg` / `-ink` | #FFF1F0 / #C4271F | #3A1715 / #FF6961 | est |
| `--ios-call-*` | same in both themes | | the call screen is dark in both |

sources

- HIG color (2025 values): https://developer.apple.com/design/human-interface-guidelines/color
- apple newsroom iOS 26 (thread + hold assist renders): https://www.apple.com/newsroom/2025/06/apple-elevates-the-iphone-experience-with-ios-26/
- idownloadblog device screenshot: https://www.idownloadblog.com/2025/11/19/fix-imessage-background-not-changing/
- macrumors dark screenshots: https://www.macrumors.com/guide/ios-26-messages-app/ (images.macrumors.com/article-new/2025/06/messages-live-translation.jpg, 2025/07/ios-26-messages-select-copy-paste.jpg)
- 9to5mac typing indicator: https://9to5mac.com/2026/01/12/ios-26s-messages-app-adds-five-great-new-group-chat-features/

### pixel (Google Messages, M3 Expressive + Pixel Phone)

vars: `.sk-gm` on the chat screen root, the status bar and the call screen root, `--gm-*`. follows the page theme (was dark only, with generic GM3 dark values). references: the user's own Pixel screenshots (Google Messages dark, dynamic color from a purple-gray wallpaper; measured pixel-exact from PNG), 9to5google light + dark thread renders (blue dynamic scheme) and Pixel Phone captures (dark in-call, dark tap-to-answer, light incoming photo).

**light choice.** there is no real light capture of the user's scheme. we use Google's **GM3 baseline** (the blue `--gm3-sys-color-*` set Google apps use when no wallpaper seed applies), not the purple M3 baseline (#6750A4), because that is what Google Messages itself falls back to. roles copied from the dark screenshots and the 9to5google light render: header = received bubble = composer pill (surfaceContainer, one step darker than the thread), thread = surface, sent = primary with white text. so light and dark share structure but not hue: dark is the user's purple-gray scheme, light is Google blue.

diff -> fix

| what differed | fix |
|---|---|
| dark only, with GM3 baseline dark values (#111318 app, #2B2F36 received, #004A77 sent with #C2E7FF text) | all colors moved to `--gm-*`; dark = the user's measured scheme, light = GM3 baseline |
| app bar darker than the thread (inverted) | app bar surfaceContainer (#1F1F23), thread surface (#131317), like the real app |
| gesture bar forced white on pixel | follows the theme (`DeviceFrame` in Phone.tsx); the pixel call phone is no longer forced dark, its status bar follows too |
| thread radius 28, side inset 16, bubble max 78% | 20, 8, 82% (measured) |
| bubble padding 10/14, leading 22, gaps 2 / 12 | 9/16, leading 24, gaps 3 / 16 (measured) |
| composer pill 48 and voice button 48 in sent blue, strip in container color | 52 + 52 (measured), voice button tertiaryContainer #513F66 with #EFDBFF glyph, strip = thread surface; icons + placeholder onSurfaceVariant |
| unknown avatar light blue #7FCFFF | yellow #FCC934 (measured) |
| receipt dot 6 px off the corner | sits on the bubble's bottom-right corner (-4), ring in the thread color |
| call: "Call" label above the photo, name, timer below; dark gradient; buttons 96x64; red pill 96x64 white glyph; tap-answer pills with labels inside | status line (call glyph + timer) above the name, "Mobile +1 ..." below, then the cookie photo; controls in a rounded-top surfaceContainer panel; buttons 80x64 darker than the panel; end pill 168x64 #ED665A with a dark glyph; incoming = two 84x68 ovals with labels below (measured). button rows keep their structure |

left, and why

- **chat text size**: the user's phone renders bubble text ~18 (pinch-zoomed chat text). we keep the app default 16.
- dark primary (send button, "seen" receipt, contact Save) is **estimated** (#B7C4F2, primary tone 80 of the measured seed); none of the screenshots show it.
- the composer does not float over the thread (the real one lets bubbles scroll under it); a solid strip in the thread color reads the same when not scrolling.
- 3-button nav in the user's screenshots; our frame shows the gesture bar (Pixel default).
- call: the real in-call row has Keypad / Mute / Speaker / More and an Audio Emoji bar; we keep only working controls. swipe-to-answer track not built (tap mode). the call-end red is the dark measurement in both themes (no light in-call capture).
- the "Tap to load preview" link card, scroll-to-bottom FAB and smart-reply chips are not modelled.
- Google Sans is not web-licensed; Roboto Flex fallback sets ~5% wider.

colors

| token | light (GM3 baseline) | dark (measured unless est) | role |
|---|---|---|---|
| `--gm-app` | #F0F4F9 | #1F1F23 | surfaceContainer: status bar, app bar |
| `--gm-surface` | #FFFFFF | #131317 | surface: thread, composer strip |
| `--gm-recv` / `-ink` | #F0F4F9 / #1F1F1F | #1F1F23 / #E3E2E7 | received bubble, composer pill |
| `--gm-sent` / `-ink` | #0B57D0 / #FFFFFF | #394668 / #FFFFFF | light primary; dark primaryContainer |
| `--gm-ink` | #1F1F1F | #E3E2E7 | onSurface |
| `--gm-mute` | #444746 | #C5C6D0 | onSurfaceVariant: icons, placeholder, stamps |
| `--gm-primary` / `on-` | #0B57D0 / #FFFFFF | #B7C4F2 / #202F55 (est) | send button, links, seen receipt |
| `--gm-fab` / `-ink` | #D3E3FD / #041E49 | #513F66 / #EFDBFF | voice button (light primaryContainer; dark tertiaryContainer) |
| `--gm-high` | #E9EEF6 | #2A2A2E (est) | banners, unknown notice, reaction pill |
| `--gm-unknown` | #FCC934 | #FCC934 | default contact avatar |
| `--gm-error`, `--gm-err-bg`/`-ink` | #B3261E, #F9DEDC/#410E0B | #F2B8B5, #601410/#FFDAD6 | M3 error roles |
| `--gm-call-bg` / `-panel` / `-btn` | #F8FAFD / #E9EEF6 / #FFFFFF | #131317 / #1F1F23 / #0E0E12 | call ground, control panel, off buttons |
| `--gm-call-on` / `-ink` | #0B57D0 / #FFFFFF | #D9E0FA / #202F55 (est) | toggled button |
| `--gm-end`, `--gm-answer` | #ED665A, #5ABA75 | same | measured (9to5google dark), dark glyphs |

sources

- user's Pixel screenshots: `persona context/Screenshot_20260926-195145.png`, `-203314.png`, `-203331.png` (not in repo)
- Google Messages M3E chat redesign (light + dark renders): https://9to5google.com/2025/08/26/google-messages-chat-redesign/
- 2026 read-receipt circle: https://9to5google.com/2026/09/07/new-google-messages-features/
- Pixel Phone M3E (in-call, incoming, light photo): https://9to5google.com/2025/08/21/google-phone-material-3-expressive-redesign/ , https://9to5google.com/2025/06/19/google-phone-material-3-expressive/
- GM3 baseline tokens (`--gm3-sys-color-*`, as served by Google web apps; e.g. surface-container-high #E9EEF6): https://material-web.dev/theming/color/ , https://m3.material.io/styles/color/roles

---

## sources
- iPhone 16 sizes/insets: https://useyourloaf.com/blog/iphone-16-screen-sizes/
- iPhone 17 sizes/insets: https://useyourloaf.com/blog/iphone-17-screen-sizes/
- display corner radius list: https://github.com/kylebshr/ScreenCorners
- HIG color (iOS 26 systemBlue/Green values): https://developer.apple.com/design/human-interface-guidelines/color (data: https://developer.apple.com/tutorials/data/design/human-interface-guidelines/color.json)
- HIG typography table: https://developer.apple.com/design/human-interface-guidelines/typography
- HIG sheets: https://developer.apple.com/design/human-interface-guidelines/sheets
- iOS 26 Messages changes: https://www.macrumors.com/guide/ios-26-messages-app/
- iOS 27 Messages (no visual change): https://www.idownloadblog.com/2026/08/18/new-features-messages-ios-27/
- iOS 26 Phone app: https://9to5mac.com/2025/08/19/heres-everything-new-for-the-phone-app-in-ios-26/
- iPhone incoming call behavior: https://support.apple.com/guide/iphone/answer-or-decline-incoming-calls-iph3c9947bf/ios , https://www.slashgear.com/1832274/iphone-calls-two-ways-decline-slide-to-answer-options-explained/
- Liquid Glass usability critique: https://www.nngroup.com/articles/liquid-glass/
- iOS CSS bubble tail technique: https://samuelkraft.com/blog/ios-chat-bubbles-css
- Google Messages M3E chat screen: https://9to5google.com/2025/08/26/google-messages-chat-redesign/
- Google Messages M3E rollout: https://9to5google.com/2025/08/19/google-messages-material-3-expressive-redesign/
- Google Messages text field 2025: https://9to5google.com/2025/03/25/google-messages-text-field-redesign-2025/
- Google Messages RCS/Text placeholder test: https://www.androidpolice.com/google-messages-updated-text-field-indicator-rcs-sms/
- Google Messages 2026 features (read receipt circle, swipe timestamps, floating menu, bigger avatar): https://9to5google.com/2026/09/27/new-google-messages-features/
- Pixel Phone M3E call screen: https://www.androidpolice.com/google-phone-app-is-getting-a-visula-makeover/ , https://9to5google.com/2025/11/17/google-material-3-expressive-redesign/
- Material 3 shape / bottom sheets: https://m3.material.io/styles/shape/corner-radius-scale , https://m3.material.io/components/bottom-sheets/specs
- Samsung Messages One UI 8.5 floating header: https://sammyguru.com/samsung-messages-one-ui-8-5-update-makeover/
- One UI 8 muted bubble palette: https://us.community.samsung.com/t5/Galaxy-S23/One-UI-8-0-Color-Palette-Restriction-and-Muted-Color-Defaults/td-p/3539812
- Samsung pale-blue sent bubble (secondary): https://usefuldrawer.com/blog/samsung-text-bubble-colour
- Galaxy viewports: https://viewpo.io/tools/device-viewports/samsung-galaxy-s25/ , https://viewpo.io/tools/device-viewports/samsung-galaxy-s25-ultra/
- HAX G11: https://www.microsoft.com/en-us/haxtoolkit/guideline/make-clear-why-the-system-did-what-it-did/
- PAIR explainability + trust: https://pair.withgoogle.com/chapter/explainability-trust/
- NN/g progressive disclosure: https://www.nngroup.com/articles/progressive-disclosure/
- source presentation study: https://arxiv.org/abs/2512.12207
- Perplexity citation patterns: https://www.aiuxplayground.com/gallery/perplexity-citations/ , https://www.aydesign.ai/blog/ai-citation-source-ui-patterns-2026

## open gaps (verify with screenshots)
- iMessage: dark received gray (derived, not measured); sent gradient endpoints; unlocked incoming call (no capture).
- Google Messages: dark primary (send button, seen receipt) estimated; light values are GM3 baseline, not a real baseline-light capture; typing indicator not captured; light in-call not captured.
- all Samsung Messages values incl. current placeholder string.
- call-screen button sizes on all three.
