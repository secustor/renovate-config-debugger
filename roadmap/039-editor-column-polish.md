# 039 — Editor column polish: editor theme, one Button, repo-load disclosure

Milestone: M10 · Status: done (2026-07-26)

Mockup (approved, Option B):
[mockups/039/editor-column-polish.html](mockups/039/editor-column-polish.html)

## Summary

The 2026-07-26 user review of the post-036/037 app found four issues in
the editor column: the config editor ignores the 037 theme switcher
(dark syntax highlighting on a light page), the Run toolbar still mixes
button heights 036 unified elsewhere, the undo/redo hint spends a
permanent line on the least surprising fact in the UI, and the
always-open "Load from a repository" form costs ~64px of standing
height for an action most sessions use at most once.

## Scope

- **Editor follows the theme switcher.** Root cause:
  `ConfigEditor.tsx` reads
  `matchMedia("(prefers-color-scheme: dark)")` — the OS — once per
  render, so the 037 `color-scheme` override never reaches CodeMirror's
  `theme` prop (and OS changes mid-session don't either). Fix: a small
  subscribed `useEffectiveScheme()` hook — the stored 037 override when
  set, the live OS preference otherwise — driving the `theme` prop so
  the editor repaints the moment either changes. e2e: extend the 13
  theme spec to assert the editor surface follows the switcher (the
  assertion the body-background check cannot make).
- **One base `Button`.** Every button derives from one `.btn` base at
  the 036 control metrics (0.8rem, 0.25rem × 0.6rem padding) with
  exactly three variants: `primary` (accent fill — Run only),
  `secondary` (bordered, default text), `quiet` (muted — segments,
  footer buttons). The toolbar `<select>` and inputs adopt the same
  metrics so a row is one height end to end. `CopyButton` and `.seg`
  keep their look and re-base; `.diff-foot button`,
  `.migration-nav button`, `.toolbar button` variants all collapse onto
  the base. The mockup's migration map lists every dialect.
- **Remove the undo/redo hint** (`.editor-hint`, App.tsx). Undo/redo is
  universal editor behavior, not app knowledge. Nothing replaces it;
  `MOD_KEY_LABEL` goes with it if unused elsewhere.
- **Repo-load becomes an editor-card disclosure (Option B).** The
  standalone form is replaced by a quiet "Load from repo…" button in
  the config editor card's title bar that expands an inline chrome-row
  form (036 grammar) between title and editor: ref input · branch/tag
  input · Load · Cancel. Zero standing cost; the control sits on the
  card whose content the load replaces, where the fetched file name
  already lands. Focus moves into the first field on open and back to
  the button on close (023); Escape closes. The 035 no-orphan row rule
  holds inside the panel. e2e: the repo-load specs follow the new
  path; a new assertion pins the collapsed state (no repo inputs
  rendered before the button is pressed).

Rejected, recorded: Option A (collapsed `<details>` row — still pays a
standing line that duplicates what the button says) and Option C
(toolbar popover — a floating surface needing its own dismiss/focus
management, the 025 lesson, hovering over the editor instead of
belonging to it).

## Out of scope

- The lint-driven decomposition of App.tsx — 040 (though this item's
  extractions shrink its violation list).
- Any component library. MUI was considered and rejected 2026-07-26:
  Emotion's runtime fights the 031 entry budget and 032 render
  guarantees, Material Design fights the just-consolidated 036/037
  design system, the app's hard widgets (windowed tree, diff view,
  CodeMirror) stay custom regardless — and JSX depth is tree shape,
  which extraction fixes and a library does not.

## Dependencies

- 036 (control metrics, chrome-row grammar), 037 (the theme mechanism
  the editor must join), 023 (focus rules), 035 (no-orphan load row).

## What was done

- **The editor follows the effective scheme.** `use-effective-scheme.ts`
  exports `useEffectiveScheme()`: two `useSyncExternalStore`
  subscriptions — the stored 037 override when there is one, the live
  OS `matchMedia("(prefers-color-scheme: dark)")` otherwise — feeding
  `ConfigEditor`'s CodeMirror `theme` prop. The override side needed a
  same-tab channel (a `storage` event only fires in OTHER tabs), so
  `storage.ts` grew a tiny theme store: `applyTheme` is already the
  app's single writer, and it now records the theme and notifies
  `subscribeTheme` listeners. `ThemeSwitch` reads that same store
  instead of its own `useState` copy, so header and editor cannot
  disagree. e2e: `13-unified-chrome-and-theme.spec.ts` asserts the
  `.cm-editor` surface itself goes dark under the switcher on a
  light OS and comes back — the assertion the body-background check
  could not make.
- **One base `.btn`.** The base carries the 036 control metrics
  (0.8rem, 0.25rem × 0.6rem, 6px radius) plus the three variants
  (`primary`, `quiet`, the bare default), an `accent-text` modifier for
  label-accent offers, one `:disabled` rule and one `svg` rule; `.ctl`
  gives inputs and selects the same metrics. All five dialects are
  gone: the toolbar's select/input/button block with its
  primary/secondary/gh-signin/disabled rules, the diff-foot button, the
  migration-nav stepper button, and the size half of `.copy-btn`. The
  segment button is listed in the base's own selector rather than given
  the class — segments are unclassed children of a segmented control —
  and keeps only what makes a segment a segment (square middles,
  rounded ends, muted until active). `CopyButton` renders the base plus
  `.copy-btn`; the compact migration stepper keeps its one deliberate
  size departure. Untouched by design: the results-column affordances
  the mockup's migration map does not list (the simulator's Simulate
  button, the preset-inject button, the simulator preset pills, and the
  link-like buttons), which are chips and inline links rather than
  chrome-row buttons.
- **The undo/redo hint is gone**, and with it `MOD_KEY_LABEL` (unused
  elsewhere) and the `.editor-hint` rules.
- **Repo-load is Option B.** The standalone `.repo-load` form is
  replaced by a quiet "Load from repo…" button in the editor card's
  title bar (`ConfigEditor` gained `titleAction` and `chromeRow`
  slots) that expands `components/RepoLoadForm.tsx` — a `.repo-panel`
  chrome row between title and editor. Collapsed is the default and
  the closed state renders nothing at all, so there is no orphan row
  (035); the open row is `nowrap` with both inputs shrinking, so Load
  can never break onto a line of its own. Focus (023): mounting the
  form lands the caret in the repo field; Escape and Cancel close it
  and return focus to the button; a load that SUCCEEDS closes it too,
  while a failed one stays open, since the reference in it is what the
  user has to correct. e2e: the 12 layout spec's repo-load test now
  drives the panel, and a new test pins the collapsed default, the
  open/Escape focus round-trip, and the title bar sitting flush on the
  editor once closed.
- Verification: `pnpm lint` (0 errors; warn tier still only
  `no-non-null-assertion` + `no-array-index-key` — the recorded
  baseline count moves 124 → 130 for the new e2e assertions),
  `typecheck`, `format:check`, engine `test:golden` + `test:shimmed`,
  app `test:unit` (the 032 keystroke invariant still measures 0 panel
  re-renders over 20 keystrokes), `build`, and all 49 e2e tests.
