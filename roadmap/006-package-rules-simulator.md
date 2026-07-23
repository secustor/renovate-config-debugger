# 006 — packageRules simulator

Milestone: M3 · Status: done 2026-07-23

> Implemented as specified. The engine's `simulatePackageRules` evaluates a
> completed run's `finalConfig.packageRules` against a user-described update
> using Renovate's REAL matcher registry
> (`renovate/dist/util/package-rules/matchers.js`, all 18 matchers, registry
> order) and replicates `applyPackageRules`'s merge tail (removeMatchers +
> cumulative `mergeChildConfig`, skipReason/override/groupSlug handling).
> Golden + shimmed tests assert **oracle parity**: the simulated final config
> must equal what the real `applyPackageRules` returns. Deliberate gaps:
> `matchConfidence` needs a Merge Confidence API token and upstream throws
> without one, so such rules report "not simulated" instead of a verdict;
> Handlebars templates in `override*`/`sourceUrl` values are applied verbatim
> with a visible note; `groupSlug` uses an ASCII-equivalent slugify. A present
> clause whose matcher returns null (e.g. bad `matchCurrentAge` input) shows
> as ⚠ invalid but — like upstream — does not fail the rule. The real
> merge-confidence module is shimmed (`getApiToken()` → undefined, identical
> browser behavior) because it drags got (Node-only HTTP) into the bundle.
> UI: a "packageRules simulator" card below the effective config with a
> compact descriptor form (+ collapsed "more fields"), four quick-fill
> presets, on-demand evaluation (button; quick-fills auto-run), per-rule rows
> with verdict badges, per-clause ✓/✗/⚠ explanations, per-rule applied diffs,
> `validateConfig` messages for the rules block, and the final per-dependency
> config with changed-key highlights. Rule-level provenance beyond the
> per-rule diff list and batch mode (the roadmap stretch goal) were skipped;
> simulator state is not encoded in share links.

## Summary

The "predict what will happen" feature: describe a hypothetical dependency
update (manager, datasource, package name, current/new version, file path,
update type) and see which `packageRules` match, in order, and the final
per-dependency config Renovate would use for it.

## User story

As a user, I want to ask "what happens when `lodash` gets a minor update in
`package.json`?" and see each `packageRules` entry evaluated — matched or not,
and _why_ (which `match*`/`exclude*` clause decided it) — plus the resulting
merged config (grouping, automerge, schedule, labels…).

## Scope

- Engine: reuse Renovate's `lib/util/package-rules/` matchers directly against
  a user-supplied synthetic `PackageRuleInputConfig`.
- Input form for the dependency descriptor with sensible presets (npm dep,
  Dockerfile image, GitHub Action, …).
- Rule-by-rule evaluation list: each rule shows pass/fail per matcher clause
  (`matchPackageNames: ❌ no pattern matched "lodash"`), with the effective
  config diff for matching rules.
- Final resolved dependency config, with provenance (005) extended to rule
  level.
- Batch mode (stretch): paste a list of dependencies and see which rules each
  hits — useful for validating grouping strategies.

## Out of scope

- Real dependency extraction from manifests, datasource lookups, actual
  scheduling evaluation against a clock (a `schedule` _explainer_ could be a
  follow-up).

## Dependencies

- 001, 005. The matcher modules must survive the same browser-shim treatment
  as the config code — needs a short spike.
