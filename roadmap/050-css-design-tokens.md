# 050 — CSS design tokens: dedup, consolidation, enforcement

Milestone: M13 · Status: done (2026-07-27)

`index.css` (3,184 lines) had a well-adopted 7-token palette (340
`var()` usages) undermined by 35 inline `light-dark()` pairs and raw
literals that bypassed it — including one strong-ink pair repeated 14
times and status tints that had visibly drifted apart (two
almost-identical error backgrounds one hex digit apart). Landed as
three commits with deliberately different rigor:

- **Dedup (`d35c866`)** — provably style-neutral: six new tokens
  (`--ink`, `--canvas`, `--highlight`, `--accent-teal`,
  `--accent-purple`, `--on-accent`) replace 31 byte-identical inline
  occurrences. Gate: var-expanding old and new file and diffing —
  byte-identical.
- **Consolidation (`d0a34d2`)** — deliberate visual micro-changes: 12
  sites converge onto `--ok/--warn/--error/--accent` `-bg/-border/-wash`
  families (10/20/40% mix steps), the verdict verb chip joins the 036
  currentColor badge pattern, `.back-to-top` adopts the toast's float
  shadow. Every changed computed value was enumerated by the same
  var-expansion diff and reconciled 1:1 against the change table.
  Deliberately untouched: the `.diff-wrapper` dark palette (mirrors
  react-diff-view's defaults, contrast-tuned per 035 and WCAG-asserted
  by e2e 12), `--surface-raised` (the popover plane is brighter than
  `--surface` on purpose), and the translucent one-offs whose blend
  base differs (`transparent` vs `--surface`).
- **Enforcement (`013e581`)** — stylelint with
  `declaration-strict-value`: color-bearing properties must be `var()`
  tokens; raw literals and inline `light-dark()` are errors. The
  plugin's `ignoreFunctions` default treats `light-dark(...)` as an
  exempt function call — disabled, with `color-mix()` allowed
  explicitly for the var()-based blends.
  `value-no-unknown-custom-properties` catches typo'd token names
  (silent runtime fallback otherwise). Chained into `pnpm lint`, so CI
  covers it unchanged. Probed fires-then-clean.

## Non-goals / deferred

- Splitting `index.css` into ordered per-feature files: assessed
  viable (two-tier base + feature files, byte-diff gate on the built
  asset) but not requested here. Two cross-section equal-specificity
  couplings must be handled in order when it happens: `.preset-panel`
  (base rule in the 008 section, `@container` override in 002 — the
  stacked `border-left: none` is currently dead, a latent bug recorded
  but not fixed) and `.diff-wrapper`'s split base/dark blocks.
