# 041 — Promote the warn tier to error

Milestone: M10 · Status: done (2026-07-26)

## Summary

034 left three things at warn — and the 038 audit proved warn is where
drift hides: CI runs the warn tier but can never fail on it, so 035
shipped 2 new warnings nobody saw and `no-non-null-assertion` grew
100 → 124 without a decision. User decision 2026-07-26: the warn tier
goes to **error**. After this item, `pnpm lint` reporting anything at
all fails CI — the "is the baseline actually clean?" question stops
needing an audit to answer.

Supersedes 038's softer plan for `no-non-null-assertion` (scope to
`src/**`, keep warn) — promoted to error outright instead.

## Scope

- **`react/no-array-index-key`: warn → error** (11 hits, all
  derived-list renders in `packages/app/src/components`). Fix with
  content-derived keys where the list has an identity (rule numbers,
  preset ids, message topic+text); where elements are genuinely
  positional and never reorder (static explainer rows), a justified
  inline disable states that invariant.
- **`typescript/no-non-null-assertion`: warn → error** (124 hits:
  51 engine tests, 36 e2e, 23 engine src — 17 in
  `error-translations.ts` regex-match handling — 10 app src, 4 shims/
  colocated tests). Approach:
  - src: replace with real narrowing (guards, `.at()`+checks, regex
    named-group patterns that carry the type) — the 33 src hits are the
    actual risk the audit identified.
  - tests/e2e: a tiny `must<T>(value: T | null | undefined): T` helper
    (throws with a useful message) replaces the conventional `!` — an
    assertion that FAILS THE TEST with context instead of throwing a
    bare TypeError. Mechanical, and it reads better in a spec anyway.
  - No blanket overrides: the audit showed all 24 post-034 additions
    were test/e2e — the convention spreads wherever it's allowed.
- **`categories.suspicious`: warn → error.** Standing debt is the 2
  `unicorn/consistent-function-scoping` hits 038 already fixes, so the
  promotion itself is near-free. Accepted consequence, stated
  deliberately: an oxlint upgrade that adds rules to the category can
  now fail CI — that is the point (new-rule fallout gets a decision at
  upgrade time instead of accumulating silently). oxlint is
  catalog-pinned, so upgrades are explicit renovate PRs where that
  decision belongs.
- `.oxlintrc.json` comments and 034's "warn tier" prose get a pointer
  here so the history stays coherent.
- Remove duplication which is no longer necessary in `.oxlintrc.json`

## Ordering

038 first (its fixes shrink this item's list and its 034 corrections
land the doc groundwork), then this item. 040 is independent but
shares files with the `no-array-index-key` fixes — coordinate to avoid
conflicts if run concurrently.

## Out of scope

- The still-off type-aware rules (`no-unsafe-type-assertion`,
  `no-unnecessary-type-assertion`, …) — 038 records them as their own
  future items; this item only promotes what already reports.
- `--deny-warnings` in CI: unnecessary once nothing is configured at
  warn, and it would break the deliberate advisory tier if one is ever
  reintroduced.

## Dependencies

- 038 (quick wins + audit corrections land first), 034 (the config
  this hardens).

## What was done

Re-measured against the post-040 tree the day this landed: **141 hits**,
not the 135 the Scope section predicted — 039/040 added 6 more
`no-non-null-assertion` in e2e while this item sat planned, which is
precisely the drift the promotion exists to stop.

| Rule                               | Hits | Resolution                                    |
| ---------------------------------- | ---- | --------------------------------------------- |
| `typescript/no-non-null-assertion` | 130  | 35 narrowed in src; 95 turned into assertions |
| `react/no-array-index-key`         | 11   | 6 content-derived keys; 5 justified disables  |
| `categories.suspicious`            | 0    | Already clean — 038 fixed the 2 standing hits |

`pnpm lint` (`oxlint --type-aware`) now prints **nothing** and exits 0.

### `no-non-null-assertion` — src (35, the actual risk)

- `error-translations.ts` (17). The regex-match handling is now
  `RE.exec(msg)?.[1]` plus an `undefined` check, or array-destructuring
  of `exec(…) ?? []`, so the capture group's `string | undefined` is
  narrowed rather than asserted away. `parseConfigPath` switched to
  **named groups** (`(?<key>…)|\[(?<index>\d+)\]`), which makes "exactly
  one alternative participates" legible instead of implicit. The three
  `with*` path editors shared an identical `!`-laden prologue; it is now
  one `resolveParent()` helper returning `{ parent, last } | null`.
- `error-fix-text.ts` (6) and `rule-locate.ts` (2). The scanners' hot
  idiom was `/\s/.test(text[i]!)`. Replaced by `isSpaceAt(text, i)` /
  `isIndentAt` / `isDelimiterAt` predicates that read the character once
  and treat past-the-end as "no" — the invariant the `!` was asserting,
  now stated in one place and checked.
- `PresetTree.tsx` (7). Three separate closure-narrowing losses:
  `node.source!.presetSource` inside a render prop (hoisted to a const
  before the JSX), `top!` in the origin framing (the `majority` flag now
  narrows to the contribution itself, not a boolean), and `parse!`/`key!`
  inside `PresetInjector.submit` — a hoisted **function declaration**,
  which TS never narrows captured values for, so it became an arrow
  const over re-bound locals.
- `EffectiveConfig.tsx` (1). `winningStep` returns
  `ProvenanceStep | undefined` and its one call site renders the chip
  conditionally, instead of asserting a non-empty chain.
- `shims/rolldown-runtime.ts` (2). `__commonJSMin` was a verbatim copy of
  upstream's comma-operator one-liner. Rewritten as statements with
  identical semantics (memoize, drop the factory, always re-read
  `mod.exports` so a factory reassigning `module.exports` still wins).

### `no-non-null-assertion` — tests/e2e (95)

A `must<T>(value, what): T` helper per package — `packages/engine/test/
helpers.ts` and an addition to `packages/app/e2e/helpers.ts` — throwing
`` `Expected ${what}, got null|undefined` ``. Applied at the `const`
binding rather than each use, which also retired the
`expect(x).not.toBeNull()` lines it subsumes. 51 engine tests, 42 e2e,
2 colocated app tests (those two got plain inline `throw`s — one helper
per package, not one per file).

Three hits (across two `evaluate()` callbacks) run in the **browser**,
where an imported `must` does not exist — the callback is serialized, not
linked. Those got inline `if (!el) throw` narrowing instead.

### `no-array-index-key` (11)

Content-derived keys where an identity existed (6): validator messages
in `MessagesPanel`, `RuleSimulator` and `StageDiff` key on
`topic + text` — the pair Renovate's validator makes unique by embedding
the config path, and unlike the index it survives a message above it
being fixed. The provenance override chain keys on a new `stepKey()`
using the **preset node id** (unique tree-wide) rather than `layerId()`,
which deliberately conflates same-named presets.

Justified inline disables (5 reports, 4 sites) — each states its
invariant next to the code:

| Site                                      | Invariant                                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `EffectiveConfig.tsx` per-rule provenance | The index **is** the identity: the row renders `packageRules[i]`, displays `#i+1`, and looks provenance up by i. |
| `ConfigJson.tsx` array elements           | This is the array being pretty-printed; element i is line i, and duplicate elements are legal JSON.              |
| `OverviewTab.tsx` `CodeText`              | One string split on backticks — slot i is always the same span, and odd/even parity decides `<code>` vs text.    |
| `option-docs.tsx` `md()`                  | Same backtick-split shape as `CodeText`.                                                                         |

In all four, elements are positional by construction: they cannot be
inserted, removed or reordered without re-rendering the whole list.

### `.oxlintrc.json` cleanup

The warn-tier comment block and its stale "baseline: 130 + 11" count are
gone — there is no tier left to describe. Three entries were duplicating
a category and were removed (all three are still `error`, just not
twice): `react/jsx-key` and `react/exhaustive-deps` (`correctness`, so
redundant since 034) and `promise/always-return` (`suspicious`, redundant
only as of this item's promotion). Verified by probe, not assumed.
Entries that look redundant but are not — `react/rules-of-hooks`,
`react/jsx-no-target-blank`, `react/jsx-no-useless-fragment`,
`typescript/no-explicit-any` — are in no enabled category and stay.
`import/no-unassigned-import` is category-covered but carries a
load-bearing `allow` option, so it stays too.

The plugins comment was corrected while there: it claimed `import` and
`promise` were on "only for the handful of rules named below", but
enabling a plugin activates its category rules as well — which, with
`suspicious` now at error, is a real widening this item accepts.
