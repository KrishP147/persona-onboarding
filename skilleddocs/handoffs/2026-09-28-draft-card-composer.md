# handoff: draft card composer (krish/draft-card-composer)

all 3 items from the kickoff brief done, base 529bacc, pushed to origin/krish/draft-card-composer.
not merged, not rebased onto anything newer (branch was current with master at start).

## commits
- a204886 useChat: draft_edit/draft_discard client actions (`chat.saveDraftEdit`, `chat.discardDraft`,
  optimistic like `forgetSlot`) + `chat.knowAskId` (captures the user-msg id when a turn's actions
  include `show_know`).
- 7aa7f59 know card: `useGradSlot` (src/app/chat/cards/KnowCard.tsx) rewritten to derive its anchor
  from `session.graduatedAt` (set once, server-side) instead of live phase-diffing + localStorage.
  Adds a second anchor from `chat.knowAskId`. Dropped the `at === -1` not-found fallback that used
  to re-show the card at the end whenever the stored anchor didn't resolve. `prefill`'s selector now
  matches the composer (`[aria-label='Message']`, textarea now, not `input`).
- ea270a3 composer (all 3 skins + `skins/shared.tsx` `useAutoGrow`/`onComposerKeyDown`): input ->
  textarea, grows to ~6 lines then scrolls, enter sends / shift+enter newline, char count once
  multi-line or >80 chars.
- 1cbff10 draft card (src/app/chat/cards/DraftCard.tsx, full rewrite): always renders for the
  current draft (removed the old `d.to && gmail filled` gate on `draftMsgId`); collapsed by default
  (to/subject/one-line snippet) with a "show full email" toggle; inline edit (auto-growing
  textareas, save posts `draft_edit`, cancel discards local edits); send disabled with a hint
  ("who's it to?" / "connect gmail to send") until both are set; discard via `chat.discardDraft`.
- 73a6ef2 Thread.tsx: dropped `draftUnder`/`moved` (draft card no longer moves under the know card);
  `m.discarded` renders as a muted "draft discarded" line (via `S.EventRow`); any earlier agent msg
  still matching `/^to:/i` that isn't the current draft renders as "earlier draft (updated below)".
  Know card renders at both `grad.at` and `grad.knowAt` (deduped via a `Set`, since they can collide
  or both be `-1`).

## design calls made without asking (flag if wrong)
- "Not yet" on the draft card just collapses the full-body view (`setExpanded(false)`); it doesn't
  fire any event. The brief said "Not yet (collapse, nothing sent)" but didn't specify whether it's
  a separate action from the "show full email"/"collapse" toggle -- I made it a synonym for
  collapsing rather than adding a third state machine.
- Send-hint priority: "who's it to?" wins over "connect gmail to send" when both are missing (brief
  listed gmail first, but recipient felt like the more fundamental blocker). One-line change in
  DraftCard.tsx (`sendHint`) if the other order is wanted.
- Know card can now show at *two* points in one long conversation (graduation, and each explicit
  "what do you know about me" ask) rather than exactly once ever. Read "(a) ... or (b) ..." in the
  brief as defining the closed set of valid triggers, not as mutually exclusive. `knowAskId` is
  in-memory only (not persisted), so a reload drops a show_know anchor that hasn't also graduated --
  only the graduation anchor survives reload, per the brief's explicit "not re-shown after later
  calls or reloads" requirement for that case.
- Composer textarea max-height picked per skin by feel (iphone 150px, pixel/galaxy 156px based on
  ~6 lines at each skin's line-height) -- not pixel-measured against a real device.

## verified
`pnpm -s exec next typegen` (fresh worktree via a node_modules junction to the main checkout, removed
before finishing), `pnpm -s exec tsc --noEmit` clean, `pnpm -s lint` clean, `pnpm -s smoke` all
passed, `pnpm -s fuzz 2000 42` all invariants held, `pnpm -s stress-matrix` + `git diff --exit-code
STRESS_TESTS.md` clean (engine untouched, table unchanged), `pnpm -s build --webpack` succeeded
(plain `pnpm -s build` / turbopack fails in this worktree with a symlink-outside-filesystem-root
panic, as flagged in the kickoff brief -- expected, not a regression).

**Not verified visually.** No dev server was started against this build (brief says don't run one
against prod / no harness/e2e). Nobody has looked at the collapsed/expanded card, the inline edit
fields, the composer's auto-grow or the char count on an actual rendered page, in any skin, in
light or dark. This is the biggest risk in the diff -- the CSS is plausible but unverified.

## suggested skills
- `run` (or a manual `pnpm dev`) to actually look at: draft card collapsed/expanded/editing/sent/
  discarded states, superseded-draft muted line, composer auto-grow + char count, and the know card
  appearing at both anchors -- across iphone/pixel/galaxy, light + dark.
- `code-review` on the diff (529bacc..HEAD) before merge, especially the two judgment calls above
  (know-card double-anchor semantics, send-hint order).

## board status
No GitHub issue or kanban card for this task -- `gh issue list` is empty for this repo, so this was
a direct kickoff brief, not board-tracked work. Nothing to move. Status: complete per brief scope
(all 3 numbered items implemented and verified per the required command list); visual verification
is the one open item, called out above.
