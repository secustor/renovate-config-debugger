# 067 — Keyboard UX: the run loop without the mouse

Milestone: M18 · Status: done (phases 1–3)

## Problem

The app is shaped like a keyboard tool — a text editor, a primary verb, and a
tight edit → Run → read → edit loop — and none of that loop is bound to a key.
Run is reachable only by pointer, or by tabbing out of the editor past the
file-name select. Nothing about that is a small omission: the whole product is
"type a config and watch what Renovate does with it", and the typing hand has
to leave the keyboard for every iteration.

Underneath the missing shortcut sit five concrete defects, each verified in the
current source rather than assumed:

- **Tab is trapped in the editor.** `@uiw/react-codemirror@4.25.11` defaults
  `indentWithTab` to `true` (`useCodeMirror.js:43`), and `ConfigEditor.tsx`
  does not override it. Tab indents, Shift+Tab outdents, and CodeMirror 6 ships
  no escape hatch of its own — so a keyboard-only user who focuses the editor
  cannot leave it without a pointer. That is WCAG 2.1.2 (No Keyboard Trap), and
  it is the single most consequential item in this document.
- **`Mod-Enter` is already taken.** `@codemirror/commands@6.10.4`'s
  `defaultKeymap` binds `Mod-Enter` to `insertBlankLine`
  (`dist/index.js:1789`), which `basicSetup` installs. "Cmd+Enter runs" is
  therefore not a free slot: it has to outrank an existing binding, and a
  naive `window` listener would run the pipeline _and_ insert a blank line.
- **The tab strip claims a pattern it does not implement.**
  `ResultsPanel.tsx` renders `role="tablist"` with `role="tab"` children, so
  assistive tech announces "tab, 3 of 8" and promises arrow-key navigation —
  but there is no key handling and no roving `tabindex`, so every tab is its
  own tab stop and the arrows do nothing. Eight tab stops to walk past before
  the panel content. (The panels themselves are `hidden`, which correctly keeps
  the inactive ones out of the tab order — that part is right and must stay.)
- **Escape has five owners and an ad-hoc referee.** The rule-evidence popover
  (`RuleEvidenceCard.tsx:228`), the session menu (`use-session-menu.ts:61`),
  the repo-load form (`RepoLoadForm.tsx:71`), glossary terms
  (`glossary.tsx:136`) and the
  simulator's return pill (`use-thread-nav.ts:89`) each register their own
  listener. Precedence is settled by the pill asking the DOM whether a popover
  happens to be mounted:
  `document.querySelector(RULE_POP_SELECTOR) === null`. It works, and it is a
  smell — the sixth layer will have to know about the other five.
- **Enter means two different things in two forms.** `RepoLoadForm` is a real
  `<form>` with `onSubmit`, so Enter loads the repo. The simulator's inputs
  (`SimulatorForm.tsx`) are bare `<label><input>` pairs and Simulate is a plain
  `<button type="button">` (`RuleSimulator.tsx:405`) — so Enter in a simulator
  field does nothing at all, in the one place users type the most.

Two smaller gaps complete the picture. A finished run announces nothing: only
the apply-fix toast is a live region (`App.tsx:1147`), and the post-run
scroll-into-view fires only on stacked viewports
(`ResultsColumn.tsx`, `STACKED_VIEWPORT_QUERY`). And every cross-link in the
app — provenance chip → preset node, message → rule, return pill → thread —
scrolls and flashes its target (`flashTarget`, `use-rule-focus`,
`use-thread-nav`) without moving focus, so a keyboard user is teleported
visually while their Tab position stays where it was.

Prior work already reasoned about parts of this and should not be re-litigated:
016 made Home/End scroll the page rather than a nested box
(`scroll-ergonomics.ts`), 021 gave simulator fields select-on-focus, 023 set
the "land on the consequence" rule for post-action navigation, and the
rule-evidence popover already restores focus to its anchor on close. This
document generalizes those into rules and fills the holes.

## Decision

**Six principles, then a deliberately small set of bindings.**

1. **One verb per instrument, and the platform does the rest.** Mod+Enter runs
   the pipeline; Enter submits the form you are typing in. No command palette,
   no chorded prefixes, no second keyboard language to learn.
2. **A bare key never fires while the user is typing.** Anything that must work
   from inside the editor carries a modifier. Everything else — the
   `e` / `r` / digit jump layer and `?` — is a bare key, because the modified
   space is a browser minefield and the bare space is not. Two predicates keep
   that safe: `isTextEditingTarget` (which counts a focused `<select>`, so the
   jump keys never eat its type-ahead) and `overlayKeyboardOwned()`, because a
   popover or menu drawn over the page is something no test of the FOCUSED
   element can see.
3. **Every binding has a visible home.** A shortcut that exists only in this
   document does not exist. It renders in the `title` of the control it
   duplicates, and — for Run — as a dim `<kbd>` inside the button itself.
4. **Escape has exactly one owner at a time**, decided by a layer stack, not by
   a DOM query.
5. **Nothing traps Tab.** Any surface that consumes Tab must offer a documented
   way out, or must not consume it.
6. **Focus follows the eye, never the network.** A programmatic jump the user
   asked for moves focus to its target; an async result the user did not just
   request never steals focus — it announces itself instead.

### The bindings

| Keys               | Scope                       | Action                                                           |
| ------------------ | --------------------------- | ---------------------------------------------------------------- |
| **Mod+Enter**      | global, editor included     | Run the pipeline                                                 |
| **Enter**          | simulator form fields       | Simulate — except in a combobox, where it accepts the suggestion |
| **Enter**          | repo-load form fields       | Load from repo — unchanged, this is the precedent                |
| **Escape**         | topmost transient layer     | Dismiss it (popover → session menu → return pill)                |
| **Tab**            | editor                      | Move focus out — it no longer indents (see below)                |
| **←/→ · Home/End** | results tab strip           | Move FOCUS between tabs (Enter selects); the strip is one stop   |
| **Mod+] · Mod+[**  | editor                      | Indent / outdent — already bound by `basicSetup`, now documented |
| **?**              | global, outside text fields | Open the shortcut sheet                                          |
| **⌘⇧⏎**            | global, editor included     | Run, then jump to the results                                    |
| **e** / **r**      | global, outside text fields | Jump to the config editor / the results                          |
| **1** – **9**      | global, outside text fields | Jump to that results tab, by position (range follows the strip)  |

The repo-load form and glossary terms keep their own element-scoped Escape
handlers rather than joining the ladder, since they only fire when focus is
already inside them. Getting that contract right took three rounds, and the
resolution is worth more than the rule it produced.

Rounds five and six both argued about **whether** the glossary card may claim
Escape. Round five gave it `stopPropagation()`, which fixed the pill it was
destroying and broke the repo-load form, whose own Escape-to-close sits on an
ancestor of a `<Term>` it renders — one press, and the panel the user asked to
cancel stayed open. Round six found the argument was about the wrong thing: the
defect was **how** it claimed, not whether.

The ladder reads exactly one signal, `defaultPrevented`. So `preventDefault()`
claims precisely that listener and nothing else, while `stopPropagation()`
claims the ladder _plus_ every React ancestor — React dispatches from the root
container, and the synthetic call forwards to the native event. With
`preventDefault`, one press hides the card, closes the panel and leaves the pill
alone, and the contract's two directions become independent: `preventDefault`
governs what is BELOW the card, `overlayKeyboardOwned()` what is ABOVE it.

The `overlayKeyboardOwned()` half is the fourth review's rule: **a surface that
opened ITSELF is not a layer.** Hover cards open on focus (and on hover), so
without it, Tabbing onto a chip inside a rule-evidence popover made Escape
dismiss the tooltip and leave the popover standing — and registering the card as
a real ladder layer would be worse, since the pointer merely resting on a badge
would start arming Escape.

`Mod` is ⌘ on Apple platforms and Ctrl elsewhere, rendered accordingly by a
single `formatShortcut()` helper — never hardcoded in copy.

**Mod+Enter is always Run, everywhere, including inside the simulator.** The
tempting alternative — "Mod+Enter does whatever the instrument you are in
does" — was rejected: a key whose meaning depends on invisible focus context is
a key users stop trusting, and the simulator gets plain Enter instead, which is
both more discoverable and more conventional. Making the simulator form a real
`<form>` is what buys that, and it fixes an inconsistency that exists today
regardless of shortcuts.

Inside the editor, Mod+Enter must be registered as a CodeMirror keymap at
`Prec.highest` whose command returns `true` — that both outranks
`insertBlankLine` and stops the event, so the pipeline runs and no blank line
appears. The handler reads the current `onRun` through a latest-ref, the same
idiom `ConfigEditor` already uses for `presetHoverRef`, so the extension is
built once and the editor never remounts to pick up a fresh callback.

### Tab, in the editor

**Decided: `indentWithTab={false}`.** Tab moves focus, Shift+Tab moves it back,
and indentation stays available on `Mod+]` / `Mod+[`, which `basicSetup` binds
already. This is what CodeMirror's own guidance suggests for an editor embedded
in a page rather than filling one, and it matches how this box is actually used
— configs arrive pasted or fetched far more often than they are hand-indented,
and the editor is one control in a column of controls, not the application.

The alternative — keep Tab as indent and bind Escape to release focus — was
considered and rejected: it costs a second key, an invisible mode, and a
conflict with the Escape ladder below. It is the right call only if
hand-authoring ever comes to dominate this box, and if it is adopted then
Escape-in-editor must keep `simplifySelection` behavior while a non-empty
multi-range selection exists and release focus otherwise.

**The fifth review raised the cost of this and it stands.** Removing Tab-to-
indent leaves `Mod+]` / `Mod+[` discoverable only through the `?` sheet, which
is a real loss for anyone hand-authoring JSON here. It is accepted rather than
fixed, on three grounds: the trap it removed was a WCAG 2.1.2 failure with no
keyboard workaround at all, the sheet is a visible home rather than no home
(principle 3), and this is the deliberate, recorded decision above. Restoring
Tab-to-indent means taking the trap back, and that trade is not close.

Either way, Escape inside the editor is the editor's own and never reaches the
page ladder.

### The Escape ladder

A small `useEscapeLayer(active, onEscape, priority)` hook backed by one
module-level stack in `lib/`. The winning layer consumes the key; nothing else
sees it.

**The rank is explicit, not mount order.** The first cut used push order alone,
on the reasoning that the layer registered last is the one the user opened last.
The 2026-08-11 review found the case that breaks: open a rule-evidence popover
from a thread body, then keyboard-activate that thread's step link, and the
return pill registers _after_ the card drawn over it — so Escape killed the pill
and left the popover standing, the exact inversion the deleted
`document.querySelector(RULE_POP_SELECTOR)` check existed to prevent. Layers now
state what they ARE (`ESCAPE_PRIORITY`), and push order only breaks ties inside
a rank:

1. `popover` — rule-evidence card and the hover cards: drawn over everything
2. `menu` — the session menu, anchored to its trigger
3. `ambient` — the simulator's return pill, which the reader can read past

Three things the ladder does NOT own. A **modal `<dialog>`** (the `?` sheet) takes
the keyboard via `claimModalKeyboard()` while it is up: the browser is already
the topmost Escape owner, and a ladder that claimed the key with
`preventDefault` suppressed the dialog's own close request — one press dismissed
an invisible layer and left the sheet open. That claim turned out to be the
answer to a second question too, so it is named for what it means rather than
for the ladder: `modalKeyboardOwned()` is also what stops the 016 Home/End page
scroll from scrolling the inert page behind an open sheet. It is this app's
`keysLive`, for the two listeners that cannot reach App's state.

The second thing is **a special case that was written twice and then deleted**,
which is the most useful entry in this document.

The ladder needed Escape raised inside the editor not to pop a layer, on the
reasoning that CodeMirror's `simplifySelection` fires on every press. Round one
implemented that as "ignore any text-editing target" — far too wide: the return
pill, the session menu and an open popover became undismissable whenever focus
sat in a form field. Round two narrowed it to `isEditorTarget`, which was still
wrong in a way only the third review found: 067's own `e` shortcut moves focus
INTO the editor, so opening a rule-evidence popover and pressing `e` left a card
that no keypress could ever close.

The third answer was to delete the rule. Verified in the pinned sources rather
than assumed: `simplifySelection` returns false unless there is a selection to
simplify (`@codemirror/commands@6.10.4` `dist/index.js:1147`), its binding
declares no `preventDefault` (`:1788`), the only other Escape bindings
`basicSetup` installs (`closeCompletion`, `closeSearchPanel`) behave the same,
and `InputState.runHandlers` (`@codemirror/view@6.43.8` `:4562`) calls
`preventDefault()` only for a handler that returned true. So CodeMirror claims
Escape exactly when it acts on it, and the ladder's existing `defaultPrevented`
check was the whole rule all along. Two rounds of narrowing a special case that
never needed to exist.

Element-scoped handlers that _can_ claim the key (the repo-load form's, the
glossary card's) still do so with `stopPropagation()`.

And the ladder yields to **a control the browser may be drawing its own popup
over**: `mayOwnNativePopup` is an `<input>` with a `list` attribute — the
simulator's `datasource` and `manager` comboboxes, and nothing else. A native
`<datalist>` popup has no node, no event and no `defaultPrevented`, so Escape
aimed at dismissing suggestions was also destroying the return pill. "May", not
"is", and scoped to two fields, so Escape from every other text field still
reaches the ladder — the constraint round three established. `<select>` is
excluded on purpose: its popup only opens on a deliberate act, never as a side
effect of typing, and counting it would recreate round one's too-wide rule.

**The yield is bounded**, which took two more rounds to settle. Round four made
it absolute, and the return pill (`ambient`) became undismissable from those two
fields for a whole session; round five narrowed it to "unless something outranks
it", which left `ambient` exactly as stranded, since it is below the threshold.
There is genuinely no way to ask whether a `<datalist>` popup is open — no node,
no event, no `defaultPrevented` — so the popup now gets the FIRST Escape after
any interaction that could have opened one (a keystroke, a pointerdown; both
re-arm it), and the next press goes to the ladder. The cost of guessing wrong is
one wasted keystroke in a field where no popup was open; the cost of the two
previous rules was a destroyed layer, and then a permanently inert key. The `?`
sheet states it outright rather than leaving it as folklore: "Escape — Close the
suggestion list — a second press dismisses the page's own layer."

**The rank is also the bare-key layer's gate.** `overlayKeyboardOwned()` reads
the top of the ladder and reports true at `menu` or `popover` — a card portalled
to `<body>` holds focus and covers the page, so `1`–`7`, `e` and `r` are inert
under one, and Escape comes first. Two deliberate exceptions. `ambient` does not
count: the return pill is readable-past furniture that stays up for a whole
navigation detour, and gating the jump layer on it would be a worse regression
than the bug it fixed. And `?` carries `firesUnderOverlay`, because help is not
a jump — it opens a modal that claims the keyboard anyway, and "how does this
work" is exactly what someone stuck under an open menu wants. That exception is
a property on the registry entry rather than a name check in the hook, and it
exists because the session menu's own row promises "Press ? any time" — copy
this document's author wrote, which the gate had quietly made false.

The DOM query in `use-thread-nav.ts:89-96` is deleted as part of this — it is
the exact case the stack exists to make unnecessary. Disclosures (`Advanced`,
`More about this update`, the summary drawers) deliberately do **not** join the
ladder: they are persistent state the user set, not transient layers, and
Escape closing them would lose work rather than dismiss noise.

Every layer that closes restores focus to whatever opened it. The popover and
the session menu already do; this makes it the rule and fixes the rest.

### Tab order

The intended document order, top to bottom — worth stating because half of it
is conditional and conditional controls are where tab order rots:

1. **Skip links** (new, first focusable): "Skip to the config editor" and, once
   a run exists, "Skip to the results". Visible on focus only, and each lands on
   the thing it names — the caret in the editor, focus on the selected results
   tab. See "Where a skip link lands" below: the obvious implementation is
   wrong here in two separate ways.
2. **Header**: project links, then the session-menu trigger.
3. **Config column**: Try example (pre-run only) → the editor card's
   "Load from repo…" toggle → the repo form's fields when open → the editor →
   file-name select → Revert (only when there is something to revert) → the
   untrusted-host "use my tokens" button (only under a guard) → **Run** →
   Copy link → Advanced disclosure and its contents.
4. **Results column**: "← Back to …" when present → the tab strip as a single
   stop → the active panel's contents, the primary control first.
5. **Back to top**, last in the document, appearing on scroll.

Two rules keep that honest across state changes. First, a control that
disappears while focused must hand focus somewhere deliberate — Revert
vanishing after a revert click, or the untrusted chip after the opt-in, must
both land on Run, never on `<body>`. Second, panels stay `hidden` when
inactive, so the tab order of the results column is always exactly the active
tab's — an e2e assertion, not a convention.

### Where a skip link lands

The first implementation was two plain `<a href="#config-column">` anchors onto
the column containers, which is the textbook shape and is wrong here twice —
both found by using them, not by reading them:

- **It lands on the column, not on what the link names.** The config column
  begins with the pre-run welcome panel, so "Skip to the config editor" put
  focus on a blurb with the editor still two tab stops away (the next Tab went
  to "try an example"), and on a viewport where the page did not scroll,
  nothing visibly happened at all. A skip link whose landing is invisible is
  indistinguishable from a broken one.
- **It evicts the share link.** `location.hash` in this app is where
  `#config=<token>` lives (007/017). A fragment jump rewrites it to
  `#config-column`, discarding the shareable URL the user may be about to copy.
  It does not break decoding — `readShareToken` returns null for a hash with no
  `config=` key, so `decideHashChangeAction` ignores it — but the link in the
  address bar is gone.

So both links keep their `href` (link semantics, and the `id` targets stay as
its fallback) and handle the jump themselves: the config link calls the
editor's own `focus()` — which scrolls the CARD into view, title bar included,
and puts the caret in the text — and the results link scrolls the column and
focuses the selected tab, the first thing there worth acting on. Dropping
someone into a text editor is only acceptable because this same document
untrapped Tab; before 067 it would have been a one-way door.

### Focus and announcements

- **A run finishing does not move focus.** The user may still be typing; a run
  can also be triggered by a share link. Instead the digest sentence is
  announced through a polite live region ("Run finished — 41 presets,
  2 errors"), and the skip link gives one-keystroke access to the results.
- **Apply fix keeps its 023 behavior** (re-run, land on Problems) and moves
  focus to the Problems **tab**, because that action _is_ a request to go look
  at something. The tab rather than the panel heading: it is a real control,
  it announces "Problems, selected", and it starts that panel's tab order.
- **Every cross-link focuses its target.** Message → rule row and return pill →
  thread head land through `landOnTarget` (scroll, flash, focus). Provenance
  chip → preset node is the awkward third: the tree row is already a `<button>`,
  but it only exists after three commits (tab switch, ancestor expansion,
  windowed-list re-slice), so `landOnPresetNode` polls for the selected row and
  gives up rather than guessing. A node filtered out of the visible tree leaves
  focus where it was. This bullet described all three as landed for a while
  when only two were — see the 2026-08-11 review.
- **Home/End keep scrolling the page** (016), except inside the tab strip,
  where they move to the first/last tab per the ARIA tablist pattern. The
  exclusion is explicit in `scroll-ergonomics.ts`, and `isTextEditingTarget` is
  exported so the shortcut layer shares one definition of "the user is typing"
  instead of growing a second.

### Discoverability

The Run button carries a dim `<kbd>⌘⏎</kbd>` (pointer-capable, wide viewports
only), and every duplicated control names its shortcut in `title`. Tier 2 adds
a `?` sheet listing every binding, generated from the same registry that
installs them — one source of truth, so a binding cannot exist without
appearing in the sheet.

## The 2026-08-11 review

A multi-agent review of the finished branch confirmed 15 defects, 13 of them in
the keyboard layer itself. They shared one root: **a global key layer that did
not know which states the app can be in.** Worth keeping, because the same trap
is waiting for tier 2:

- Three separate bindings were missing a gate the others had — the Escape ladder
  and `RUN_SHORTCUT` were not gated on the modal sheet, and the editor's ⌘⏎
  never asked whether a run was already going. Each was written at a different
  moment, and each looked complete on its own.
- The run guard now lives in **one** place (`onRun` latches a ref
  synchronously), rather than three partial ones — `enabled: !running` and
  `disabled={running}` remain as the visible half only.
- The tab strip checked `event.key` alone, so ⌘+← (browser Back) and Ctrl+Home
  were swallowed, while its two sibling handlers written the same week both
  guarded modifiers.
- `isTextEditingTarget` counted every `<input>` as typing, so a focused filter
  **checkbox** silently killed the whole bare-key layer. `<select>` stays
  counted, deliberately — its type-ahead has to keep winning.
- `e` / `r` omitted `shift`, and `matchShortcut` reads an absent `shift` as
  "don't care" (which `?` genuinely needs), so Caps Lock fired them.

**The run guard was wrong, and the second review caught it.** The first fix
DROPPED a run requested while one was in flight, and this document called that
an accepted cost affecting two entry points. It was not, and it did not: three
callers mutate state _before_ calling `onRun` — apply-fix rewrites the editor
text, inject commits the preset, a share-link `hashchange` replaces the whole
config — so dropping their run left the editor, the results and the armed
simulator describing three different configs, with no toast, notice or stale
marker. "No-ops" understated it: the config was mutated, only the run was lost.

The lesson worth keeping: **a guard belongs at the source of the duplicate, not
at the shared destination.** The actual defect was one keypress producing N
requests, and that is a keyboard fact, not a pipeline fact.

- **Auto-repeat is suppressed where it happens.** `KeyboardEvent.repeat` marks
  every OS repeat after the first, in `use-shortcut.ts` and in the editor. The
  editor's binding became a `Prec.highest` DOM handler matching through
  `matchShortcut` rather than a keymap entry, precisely because a keymap command
  is never handed the event — which also collapsed the two spellings of ⌘⏎ into
  one, and retired `codeMirrorKey`. A held ⌘⏎ still _claims_ the chord on every
  repeat: declining mid-hold would hand the keypress straight back to
  `insertBlankLine`, which is the blank-line bug at its worst.
- **`onRun` serializes, it never drops.** A run arriving mid-run waits and then
  executes, returning its own result to its own caller; `running` goes false
  only when the queue empties, so a finished run cannot claim idle while its
  successor resolves. Inputs and the untrusted-endpoint decision are resolved at
  call time, before the wait, so a queued run carries the state its caller
  meant.

The eighth review DELETED it. One round after landing, the fold had produced
two confirmed correctness bugs, and the second one is the reason it could not
stay: `runRequestKey` is only sound while it stays exhaustive over every input
a run reads, and the host tokens are not inputs at all — `run()` takes them at
fetch time. So pasting a token mid-run and pressing ⌘⏎ folded into the TOKENLESS
run already executing, and the app told the user their token was wrong. Making
the fold tail-only would have fixed the other bug and not that one.

What it bought was small: three deliberate ⌘⏎ on an unchanged config cost one
run instead of three. The runs are serial rather than concurrent, they produce
an identical screen, and both things that made repeat presses galling are fixed
at their own sources — `keepTab` for the yanked tab, `event.repeat` for a held
key. Three deliberate presses asking for three runs is what they asked for. The
queue itself moved to `lib/run-queue.ts` with the unit tests four of five rounds
kept proving it needed.

For the record, the reasoning that produced the fold, which was sound and still
wrong: Both earlier swings tried to decide WHICH PRESS to drop from
information that cannot answer it: round two asked the destination ("is a run
in flight?") and half-applied three callers; rounds three and five asked the
caller ("is this a pointer-safe entry point?") and swallowed a deliberate press
after an edit. The answer is identity on the REQUEST — `runRequestKey` over the
inputs, the injected presets, the credentials decision and the commit options.
A request identical to one already queued folds into it and resolves with its
result; anything that differs queues; nothing is dropped. Apply-fix, inject and
share-link have all changed something, so they structurally cannot fold, and
round five's second ⌘⏎ follows an edit, so it differs too. What folds is only
the case neither round could name: three ⌘⏎ on an unchanged config while a slow
preset fetch resolves.

The third review then deleted the second half of that fix. A `coalesce` option
had let the pointer-safe entry points decline a run while one was in flight —
belt-and-braces next to the repeat suppression — and it swallowed a DELIBERATE
second ⌘⏎: press it, fix a typo mid-run, press it again, and the results
described the pre-edit text. With auto-repeat already stopped at the source,
coalescing was a redundant mechanism whose only remaining effect was its own
defect. It is gone, along with `enabled: !running` on the two chords — the
editor cannot decline ⌘⏎ without handing it back to `insertBlankLine`, so
gating the page copy would have made one key mean two things by invisible focus
context. `disabled={running}` on the button stays as the visible, pointer-side
half.

## The rule the reviews kept teaching

Five rounds produced one lesson often enough to write down: **a handler that
claims a key must say WHICH press of it it means.** Every expensive defect in
this branch was a version of that.

- The editor bail claimed Escape for a whole class of targets when it meant
  "the presses CodeMirror acts on" — two rounds of narrowing before deletion.
- The run guard claimed every request when it meant "the extra ones an OS
  auto-repeat invented" — three callers half-applied before it moved to the
  source.
- The simulator form claimed Enter when it meant "the unmodified one", killing
  ⌘⏎ in the two fields users type in most.
- `ProvenanceChip` claimed Enter when it meant "Enter with no modifier", so ⌘⏎
  on a focused chip performed a jump instead of a run — a wrong action, not a
  dropped one.
- The landing layer claimed focus when it meant "focus this jump displaced",
  and later "unless a newer landing wants it".

The corollary is about tests, not code: none of these were visible to the unit
suites while the policy lived inline in `App.tsx`, which is why the fifth round
extracted it to `lib/focus-landing.ts` with the three rules as unit tests.

## Costs, accepted

- **A shortcut registry is indirection** for what is, at tier 1, three
  bindings. It earns itself at the `?` sheet and at platform-correct rendering;
  without it the shortcut list lives in three places and drifts.
- **`indentWithTab={false}` will annoy someone** who hand-indents JSON in the
  box. `Mod+]` is the answer, and it is documented in the sheet.
- **Focusing cross-link targets changes scroll behavior subtly** — focus itself
  can scroll. Every such call passes `preventScroll: true` and lets the
  existing `motionScrollOptions` path do the moving, as
  `RuleEvidenceAnchor.close` already does.

## Scope

**Phase 1 — debt, no new bindings** (landed):

- `indentWithTab={false}` in `ConfigEditor.tsx` — the trap is gone.
- `ResultsPanel.tsx` gets the tablist pattern: roving `tabindex`, arrows and
  Home/End, with the arithmetic in `lib/roving-tabs.ts` (a non-component export
  from a component file breaks fast refresh, and the wrap-around wanted a unit
  test). The APG allows two activation models and the first cut took the
  default, selection-follows-focus; the second review showed why the other one
  is right here. Half these tabs are reached by cross-link, which leaves a
  "← Back to …" control above the panel, and `setTab` clears it by design — so
  one exploratory arrow press destroyed the way back, and walking the strip
  meant six real panel switches, each announced as a new selection. **Manual
  activation**: arrows move focus, Enter or Space selects, which is a
  `<button>`'s own behaviour and needs no new binding. Looking is not choosing.
- `lib/escape-stack.ts` (pure ordering) + `hooks/use-escape-layer.ts` (one
  refcounted document listener) replace the three document-level Escape
  listeners. `use-thread-nav`'s `document.querySelector(RULE_POP_SELECTOR)`
  precedence hack is deleted.
- `lib/motion.ts` gains `landOnTarget` — scroll, flash **and focus** — used by
  `use-rule-focus` and `use-thread-nav`; `RuleRow` takes `tabIndex={-1}` to
  receive it.
- Skip links in `App.tsx` landing in the editor (`ConfigEditorHandle.focus()`)
  and on the selected results tab, without touching `location.hash` — see
  "Where a skip link lands". Plus the polite run-completion live region, fed by
  `useRunSummary`'s counts so it cannot disagree with the tab badges.
- `isTextEditingTarget` is exported from `scroll-ergonomics.ts`, and
  `useHomeEndPageScroll` now yields to an event another handler claimed.

**Phase 2 — the ask** (landed): `lib/shortcuts.ts` (the registry plus
`matchShortcut`, `formatShortcut`, `codeMirrorKey`), `hooks/use-shortcut.ts`,
`features/editor/run-keymap.ts` (the `Prec.highest` binding), the simulator's
`<form>` with the Simulate button associated across the DOM by `form=`, and the
`<kbd>` hint in the Run button.

**Phase 3 — the jump layer** (landed): `e` / `r` / `1`–`7` / `⌘⇧⏎`, and the
`?` sheet that stopped being optional the moment the count passed ten.

Two decisions inside it are worth keeping written down.

**The jump keys are BARE, and that is the only space with room left.** Every
mnemonic chord is already taken by a browser: ⌘⇧E is Firefox's network panel,
⌘⇧C/I/J are devtools, ⌘⇧G is find-previous, ⌘K is Firefox's address bar. Single
letters are free, which is why every keyboard-first web app uses them. What
makes them safe is `useShortcut` refusing to fire a bare key while the user is
typing — and `isTextEditingTarget` counting a focused `<select>` as typing, so
`e` and `r` cannot eat its type-ahead. The visible consequence, pinned by an
e2e test: Tab out of the editor lands on the file-name select, and `r` does
nothing there. That is correct, not a gap.

**F6 was built and then removed, deliberately.** It is the platform convention
for region cycling and the only key that works from inside the editor without
inventing a chord, which is why it was recommended and shipped in the first cut
of this phase. It also SHADOWS the browser's own F6 — address-bar and pane
cycling, a keyboard affordance some users depend on — and taking that away is a
real cost, paid by everyone, for a convenience nothing else needed: plain Tab
already leaves the editor since phase 1, and `e` / `r` cover the jump from
anywhere else. An app should not confiscate a browser-level accessibility key to
save a keystroke it has another route to. Removed on the author's call before
the branch landed; nothing in the codebase referenced it, which was the point of
keeping it to two registry entries and one handler.

Digits bind by POSITION in the rendered strip, never by a digit-to-id map: 062
renames `Simulator` and inserts `Extraction`, and a frozen map would then point
every digit at the wrong panel.

**Also in this phase — Enter opens a `<select>`.** Reported against the
`renovate.json` / `renovate.json5` picker and true of every select in the app.
It is native behavior rather than a regression (a closed select opens on Space
or Alt+Down; Enter does nothing outside a form) but it became visible because
phase 1 untrapped Tab, making that select the first thing Tab reaches from the
editor — so people land on it and press the key the rest of the app just taught
them means "activate". `lib/select-picker.ts` calls `showPicker()`, guarded on
support, on no modifiers (⌘⏎ must still Run from a focused control), and on the
`NotAllowedError` it throws without user activation. Where `showPicker` is
missing, the handler stands aside: no fallback can conjure a native popup, and
a hand-built menu would be a worse control than the one the platform ships.

**Still not built.** A Copy-link binding (once-per-session action, no good
letter left); `/` to focus a panel's filter; `[` / `]` for the steppers; `j` /
`k` through an instrument's items. Tier 2 in the 2026-08-11 recommendation.

### Not in scope

- A command palette, a fuzzy launcher, or user-remappable keys.
- Vim/Emacs keymaps in the editor.
- Anything bound to `Mod+K`, `Mod+P`, `Mod+S`, `Mod+F` or `Mod+1…9` — all
  browser- or OS-owned, and taking them is how a web app earns a bug report
  that reads "your site broke my browser".
- Single-letter global shortcuts other than `?`.

## Tests

- **unit** (`unit` project, node): `select-picker.test.ts` — Enter opens the
  picker, every modifier combination is left alone (⌘⏎ must still Run from a
  focused control), an unsupported browser is not half-handled, and a throwing
  `showPicker` does not escape. `shortcuts.test.ts` — either modifier
  accepted, bare Enter rejected (so forms keep it), Alt rejected, and
  `codeMirrorKey` deriving `Mod-Enter` from the same entry the page listener
  uses. `escape-stack.test.ts` — topmost-wins, fall-through after release,
  release out of order (the case the old `stack.pop()` shape would have got
  wrong), repeated release. `roving-tabs.test.ts` — wrap-around at both ends,
  and every other key declined.
- **render** (jsdom): `ResultsPanel.test.tsx` — one tabbable tab, arrows and
  Home/End moving selection, `preventDefault` on Home/End (the exact signal
  `useHomeEndPageScroll` reads), and exactly one panel in the tab order. The
  032 keystroke-render test still passes unchanged: the shortcut layer is one
  window listener, not per-keystroke React state.
- **e2e** (`19-keyboard.spec.ts`, production build via `vite preview`, 7 tests):
  Mod+Enter inside the editor runs the pipeline **and leaves the line count
  unchanged** — the `insertBlankLine` regression test, and the reason this
  binding needed `Prec.highest` at all; Mod+Enter from outside the editor;
  Tab leaving the editor (the trap); the config skip link as first tab stop,
  landing the caret IN the editor with the hash untouched, and — on a viewport
  short enough that the page really scrolls — bringing the editor back into
  view from the bottom of the page; the results skip link landing on the
  selected tab; the tab strip as one stop with arrows and End; Enter in a
  simulator field producing a verdict; and a run announcing itself in the live
  region while focus stays where the user left it.

Two things are deliberately covered only at unit level: the Escape ladder's
ordering (a browser test would have to open a popover over a return pill to
assert what the stack test asserts directly) and the platform spelling of the
hint. And `10-share-diagnostics.spec.ts` gained `expectRunIdle` — those waits
asserted the button's exact text, which the `<kbd>` hint changed; what they
always meant was "no longer Running…".

## Decided during implementation

1. **Editor Tab semantics** — focus-moves (`indentWithTab={false}`), with
   `Mod+]` / `Mod+[` for indentation. The Escape-then-Tab alternative stays
   specified above in case hand-authoring ever dominates this box.
2. **Mod+Enter is global, Enter is local.** The simulator got a real `<form>`
   rather than a second meaning for the modified chord.

3. **The `?` sheet earned itself.** Phase 3 took the count from three bindings
   to eleven — exactly the threshold this document set when it deferred the
   sheet. It is generated from `GLOBAL_SHORTCUTS`, and a unit test asserts every
   registry entry has a printed row, so a binding cannot be added without
   appearing there. It is reachable by pointer too, from the 066 session menu:
   a keyboard layer nobody can discover is one nobody uses.
4. **Bare keys, not chords, for the jump layer** — every mnemonic modifier
   combination is already a browser's. See phase 3 in Scope.
