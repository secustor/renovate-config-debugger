# 038 — Lint audit follow-up: quick wins + 034 corrections

Milestone: M10 · Status: done (2026-07-26)

## Summary

A 2026-07-26 re-audit of [034](034-lint-hardening.md)'s disabled rules
(same oxlint 1.75.0 + oxlint-tsgolint the doc measured with, every count
re-measured on today's tree, every new hit blamed against post-034
commits) confirmed most off-switches are honest — false-positive
profiles or deliberately grandfathered debt, none of them hiding fresh
regressions. But it also found: one rule disabled for **no reason at
all**, one whose stated reason argues for an allow-list yet concludes
with an off-switch (proven: the allow-list variant has 0 hits), one
**real latent bug** reachable from user config, a stale factual claim in
034, and 2 warnings that slipped into the "clean" baseline unnoticed —
because CI runs the warn tier but can never fail on it.

## Scope

Quick wins, in value-per-effort order:

- **`import/no-unassigned-import`: off →
  `["error", { "allow": ["**/*.css"] }]`.** The documented reason
  (side-effect CSS imports) is exactly what the allow-list expresses;
  measured 0 hits. A future non-CSS side-effect import becomes an error
  instead of invisible.
- **Fix `simulate-package-rules.ts:486`** —
  `slugifyLite(String(rawRule.groupName))` turns an object-valued
  `groupName` (user config!) into an `objectobject` slug. Found by
  trial-enabling `typescript/no-base-to-string`; fix it regardless of
  the rule (guard non-strings before slugifying).
- ~~Scope `typescript/no-non-null-assertion` (warn) to `src/**`~~ —
  **superseded by [041](041-warn-tier-to-error.md)** (user decision
  2026-07-26): the rule goes to `error` outright, tests included, so
  the softer scoping step is skipped. The audit's location breakdown
  (91/124 test-or-e2e, src concentrated in `error-translations.ts` 17
  and `PresetTree.tsx` 7) moves there as the fix map.
- **Fix the 2 `unicorn/consistent-function-scoping` warnings**
  (`e2e/12-layout-regressions.spec.ts` — hoist `luminanceOf` and
  `centerOf`). They arrived with 035 and nobody noticed: the warn tier
  reports but cannot fail CI. Restores the genuinely clean baseline
  034 claims.
- **Enable the three no-cost rules** (one site each):
  - `typescript/no-unnecessary-template-expression` → fix the one hit
    (`simulate-package-rules.ts:571`, a template wrapping a single
    string).
  - `typescript/unbound-method` → file-scoped disable in
    `shims/renovate-deps.ts` (vendored-verbatim dequal port), rule live
    everywhere else.
  - `typescript/no-redundant-type-constituents` → inline disable at
    `EffectiveConfig.tsx:341` with the justification (`LayerId` IS
    `string`; the `| "all"` literal is documentation), rule live
    everywhere else.
- **Correct 034 where the audit falsified it** (append a dated
  correction note rather than rewriting history):
  - "no-base-to-string 9 — all `${err}`-shaped" → only 3 of 9 are; the
    rest are the dequal port (2), test assertions (2), a defensive
    fallback (1), and the `groupName` bug (1).
  - "exits 0 with only the two warn-tier rules reporting" and the
    config comment's "~110 hits" → superseded by this item's baseline.
  - `no-unnecessary-condition`'s keep-off rationale is STRONGER than
    documented: beyond DOM-lib optimism, TypeScript cannot see
    effect-cleanup mutation of `live`/`cancelled` flags, so the rule
    would fire on every future async effect. Record it so the
    enable-debate doesn't repeat.
  - `no-unnecessary-type-parameters` has a good undocumented reason:
    the ambient `renovate-dist.d.ts` declaration deliberately mirrors
    upstream's `memCache.get<T>()` signature.

## Deferred — each its own scoped item when someone wants it

- `typescript/no-unnecessary-type-assertion` (19, no autofix in 1.75 —
  manual deletions + typecheck; `PresetTree.tsx` 5,
  `simulate-package-rules.ts` 4; 4 hits in diffable `shims/**` should
  stay exempt).
- `typescript/no-unsafe-type-assertion` (102 — enable for
  `packages/app/src/**` first at 23 hits; the engine shims stay off
  permanently as deliberate interop). The one hit with teeth today:
  `oauth.ts:369` asserts `access_token as string` on an OAuth response
  — a 030-style zod boundary candidate independent of the rule.

## Never enable (audit-confirmed, recorded so the debate doesn't repeat)

- `typescript/no-unnecessary-condition` — two irreducible
  false-positive families (see the 034 correction above).
- `typescript/consistent-return` — all hits are the React `useEffect`
  early-return-then-cleanup shape; it would tax every future effect.
- `react/react-in-jsx-scope` — automatic JSX runtime, 692 pure false
  positives, verified at the tsconfig/plugin source.

## Out of scope

- Making CI deny warnings — the warn tier is deliberately advisory;
  this item instead shrinks it to a level where drift is noticeable.
- The deferred items above.

## Dependencies

- 034 (the config and doc this amends), 030 (the zod-boundary pattern
  the oauth.ts note points at).

## What was done

- `import/no-unassigned-import` is
  `["error", { "allow": ["**/*.css"] }]`. Still 0 hits; a non-CSS
  side-effect import now fails the build.
- **The `groupName` bug is fixed.** `simulate-package-rules.ts` derives
  `groupSlug` only when `groupName` is actually a string; anything else
  takes the no-groupName path and records a note saying so (upstream's
  `slugify` throws on a non-string, so no real run reaches the
  `objectobject` slug the simulator used to invent). Covered by a new
  case in `test/simulate-package-rules.shimmed.test.ts` that asserts
  both halves — object groupName leaves the pre-existing slug alone,
  string groupName still derives one.
- The 2 `unicorn/consistent-function-scoping` warnings in
  `e2e/12-layout-regressions.spec.ts` are gone: the WCAG `channel`
  helper is hoisted out of `luminanceOf`, and `centerOf` out of its
  test. The warn tier is back to only the two rules 034 put there.
- The three no-cost rules are `error`:
  `no-unnecessary-template-expression` (the one hit rewritten to plain
  concatenation), `unbound-method` (file-scoped disable in
  `shims/renovate-deps.ts` — the vendored dequal port keeps upstream's
  `Object.prototype.hasOwnProperty` alias, and every use goes through
  `.call`), and `no-redundant-type-constituents` (inline disable on
  `EffectiveConfig.tsx`'s `LayerId | "all"`).
- The `no-non-null-assertion` scoping bullet was skipped as superseded
  by [041](041-warn-tier-to-error.md), per the strikethrough above.
- 034 carries a dated "Corrections (2026-07-26 audit)" section with the
  four falsified/undocumented points; its history is unedited.

Baseline after this item: `pnpm lint` exits 0 with 0 errors and 135
warnings, all of them the two deliberate warn-tier rules (124
`no-non-null-assertion`, 11 `no-array-index-key`) that 041 takes on.
