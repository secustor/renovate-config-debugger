# 039 — Editor column polish: editor theme, one Button, repo-load disclosure

Milestone: M10 · Status: planned (2026-07-26)

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
