# 037 — Light / dark theme switcher

Milestone: M10 · Status: done (2026-07-25)

Mockup (approved): [mockups/036/unified-chrome.html](mockups/036/unified-chrome.html)

## Summary

The app follows the OS theme only. Users asked for an explicit
light/dark override — a three-state Auto / Light / Dark segmented
control in the header next to the version badge, persisted across
visits.

## Scope

- **Switcher UI**: segmented control (sun / moon / auto icons + labels)
  in the app header; Auto is the default and follows
  `prefers-color-scheme` exactly as today.
- **Mechanism**: the app is already 100 % `light-dark()` +
  `color-scheme: light dark`, so the switcher only sets
  `color-scheme: light` / `dark` on `:root` (Auto removes the
  override). No second theme stylesheet, no class toggling per
  component.
- **The one exception**: the dark diff variables live behind
  `@media (prefers-color-scheme: dark)` (035). Convert them to
  `light-dark()` values scoped on `.diff-wrapper` — this keeps the 035
  proximity-over-order guarantee against the react-diff-view `:root`
  defaults AND makes the diff follow the switcher uniformly.
- **Persistence**: stored via the 033 `storage.ts` wrapper (a new
  versioned key), read before first paint so there is no theme flash.
- **Regression net**: the 12-layout-regressions dark-contrast e2e must
  keep passing (it pins the diff colors under
  `colorScheme: "dark"`); add a switcher e2e asserting the override
  wins over the emulated OS scheme and survives a reload.

## Out of scope

- Any new colors — both themes are the existing `light-dark()` pairs.
- Theming the share links or exports.

## Dependencies

- 033 (storage wrapper), 035 (dark diff variable scoping + its e2e
  guard), 036 (the header/segmented-control styling it reuses).

## What was done

- **`components/ThemeSwitch.tsx`** — a three-segment `.seg` (036) in
  the header beside the version badge: `role="radiogroup"`, one
  `role="radio"` per option, octicon auto/sun/moon glyphs.
- **Mechanism** — `applyTheme` (storage.ts) sets `color-scheme` on
  `document.documentElement.style`; "auto" removes the inline value and
  the `:root { color-scheme: light dark }` rule takes over. Nothing
  else in the app changes.
- **The one exception, converted** — the 035 dark-diff block left
  `@media (prefers-color-scheme: dark)` and became `light-dark()` pairs
  still scoped on `.diff-wrapper`. The light half of each pair is the
  react-diff-view 3.3.3 default read from its own stylesheet; for the
  text colors, whose library default resolves to guaranteed-invalid
  (i.e. the text simply INHERITED), the light half states the app's own
  body color, which is what was inheriting. `.diff-gutter`'s muted line
  numbers, previously dark-only because they lived inside the media
  query, are now unconditional.
- **The blocker this uncovered** — the roadmap's premise ("the app is
  already 100 % `light-dark()`, so the switcher is nearly free") held
  in the source but NOT in the build. At Vite's default CSS target
  ("baseline-widely-available") the pipeline downlevelled every
  `light-dark()` into a `--lightningcss-light` / `--lightningcss-dark`
  custom-property pair switched by a `prefers-color-scheme: dark` media
  query — a polyfill only the OS can drive. The switcher therefore
  changed nothing in a production build while working in dev.
  `build.cssTarget` is now pinned to the browsers that ship
  `light-dark()` natively (Chrome 123 / Firefox 120 / Safari 17.5,
  Baseline 2024-05), which is where the app's container queries and
  `color-mix()` already put the floor. The emitted CSS got ~1.5 kB
  smaller as a side effect.
- **Persistence** — `rcv.theme` through the 033 wrappers, read and
  applied at module scope in main.tsx before `createRoot()` so the
  first paint is already correct. "auto" stores nothing (absence is the
  default); an invalid stored value is dropped and reads as auto (030).
- Tests: `storage.test.ts` gains the theme round-trip;
  `e2e/13-unified-chrome-and-theme.spec.ts` asserts the override beats
  an emulated OS scheme, survives a reload, and that the DIFF follows
  the switcher — the assertion the 12-layout dark-contrast test (which
  still passes unchanged) cannot make.
