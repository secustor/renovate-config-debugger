# 045 — Auto-load the inherited config for a loaded repository

Milestone: M12 · Status: done (2026-07-26)

Mockup (approved 2026-07-26, variant 1B — tinted badge, editable
repo/file fields, glossary term):
[mockups/045/auto-load-inherited-config.html](mockups/045/auto-load-inherited-config.html)

## Summary

The inherited-config layer (008) is paste-only: a user modeling their
org's real setup must know where the org keeps its inherited config,
open it, and paste it — even though "Load from repo" (007) already
knows the repository and the platform context, and Renovate's own
resolution is fully deterministic from there. Resolve it the way a real
run does: fetch `inheritConfigFileName` (default
`org-inherited-config.json`) from `inheritConfigRepoName` (default
`{{parentOrg}}/renovate-config`, templated with the loaded repo's
owner) via the same browser transports, and fill the layer
automatically. User decision 2026-07-26: this is a **default-enabled
checkbox in the repo-load form**, not something gated on a pasted
global config.

## Scope

- **Trigger: a checkbox in the repo-load form (039), checked by
  default.** "Also load the org's inherited config" runs the probe on
  every successful "Load from repo" unless unticked; the choice
  persists like the form's other state. Default-on is the honest
  default: the public Mend-hosted GitHub app runs with `inheritConfig`
  enabled, so for the most common real-world setup the probe models
  exactly what the bot does. **[Wrong — see "Correction (2026-07-26)"
  below; the default flipped to off.]** The option itself defaults to `false` and
  is `globalOnly` (verified against the pinned renovate's option
  table), so the only case needing a hint is a pasted global config
  that explicitly sets `inheritConfig: false` — then the auto-loaded
  layer says a run under THAT global config would not apply it.
  "inherited config" in the label is a glossary term (016) whose hover
  card explains the mechanism and links Renovate's own
  `inheritConfig*` docs.
- **Resolution, Renovate's own — and editable in the form.** The
  sub-row shows the probe's repo and file name as editable fields,
  prefilled with `{{parentOrg}}` templated to the loaded repo's
  owner/group (or the pasted global config's `inheritConfigRepoName` /
  `inheritConfigFileName` overrides when present) — orgs that
  customized either just type theirs. The fetch goes browser →
  platform API under the existing platform context, with the same
  support matrix, sign-in, and per-host tokens as repo loading (hosts
  that don't serve CORS stay paste-only).
- **Missing-file semantics match `inheritConfigStrict`.** Absent file
  with `inheritConfigStrict: false` (default): a quiet note, layer
  stays empty — exactly what a real run does. With `strict: true`: the
  layer reports the same hard error a real run would raise.
- **Provenance in the UI.** An auto-filled layer is labeled with where
  it came from (`org/renovate-config · org-inherited-config.json`) and
  stays editable — editing flips it to the existing "pasted" state so
  what-if experiments keep working. The 008 pipeline stages and badges
  are unchanged; this item only fills the input.
- **Share links** already carry the inherited layer's content (008);
  an auto-loaded layer rides that unchanged, so links stay
  self-contained and never trigger fetches on open.

## Out of scope

- Auto-loading the GLOBAL config layer — it lives in the bot's
  deployment (config.js/env/CLI), not in any fetchable repo; there is
  nothing deterministic to resolve it from.
- Nested-group `parentOrg` edge cases beyond what Renovate's own
  templating produces for the platform (GitLab subgroups follow
  whatever the real `{{parentOrg}}` resolves to; no extra probing).
- Watching for upstream changes to the inherited file — the layer is a
  snapshot, like every other input.

## Dependencies

- 008 (the layer stack and inherit-stage semantics this fills), 007
  (Load from repo and the platform context the fetch rides on), 009
  (sign-in for private org config repos), 010 (the preset/transport
  support matrix that bounds which hosts work).

## What was done

- **The engine gained ONE new primitive: `fetchRepoFile`** (in
  `shims/repo-config.ts`, exported from the engine index) — one exact file out
  of one repository as raw text, `null` when it is absent, and still an
  `ExternalHostError` when the host refused (a rejected request is not a
  missing file). The three per-platform transports the 007 config probe
  already had are now reached through a shared `fetchRawFile` dispatcher that
  both entry points use, so the probe inherits the GitHub/GitLab/Gitea/Forgejo
  URL shapes, the per-host auth headers, GitLab's default-branch resolution and
  the `encodePathSegments` hardening (c429534) for the repo AND the file path —
  nothing about the fetch is new code. No candidate chain: Renovate has none
  here, and inventing one would model a bot that does not exist.
- **The derivation lives in a pure app module, `src/inherit-probe.ts`** — not
  in a component, because it is the only real logic in the item and it is
  exactly what needs testing. It reproduces upstream verbatim:
  `parentOrg` is the repo slug minus its last segment (so a GitLab subgroup
  path keeps its subgroup) and `topLevelOrg` is its first segment
  (`workers/global/index.js`), and `inheritConfigRepoName` is compiled against
  those (`workers/repository/init/inherited.js`). It also owns the tracking
  rule (`inheritFieldValues`), the probe target (`inheritProbeTarget` +
  `isProbeTargetResolved`), the `inheritConfig*` reading of a pasted global
  config (`inheritPolicyOf`) and the three layer states as DATA
  (`inheritLayerState`), so the component only chooses copy.
- **The form's second row (approved mockup 1B).** `RepoLoadForm` is now a
  `<form>` wrapping two rows: the untouched 035 one-unwrappable-row of inputs +
  buttons (it only lost its bottom border, which the sub-row now carries so the
  two read as one chrome block), and a wrapping sub-row holding the default-on
  checkbox, the glossary term and the two prefilled `ctl` fields. Both rows
  exist only while the disclosure is open, and Escape/Cancel/focus (023/039)
  are untouched. New CSS is four rules (`.repo-panel.no-border`,
  `.repo-panel-row2`, its `.ctl` sizing, `.repo-panel-inherit`) plus
  `.layer-origin`, `.layer-hint` and a one-line `.badge.auto` hue — the badge
  itself is the single 036 recipe and the quiet note reuses `.advanced-note`.
- **Prefill and dirty state.** The two fields live in App state as
  `string | null`, where `null` means "still tracking": an untouched repo field
  follows the typed owner keystroke by keystroke (`{{parentOrg}}` stays visible
  while there is no owner yet — `/renovate-config` would name a repository that
  cannot exist), and a pasted global config's `inheritConfigRepoName` /
  `inheritConfigFileName` replace the defaults it tracks. Typing makes a field
  the user's; clearing it hands it back to the derivation. The checkbox and both
  values persist for the session only (no localStorage), like every other field
  in the form.
- **The probe runs between the config arriving and the run that processes it** —
  the order a real run resolves the two in, so the first result already includes
  the org layer instead of appearing only on a second Run. It is handed the repo
  that was actually loaded as the templating authority (a field may itself hold
  `{{parentOrg}}`), validated with the same `isValidRepoRefPart` rule the repo
  load uses, and deliberately NOT given the form's branch/tag:
  `inheritConfigRepoName` is a different repository and a real run reads its
  default branch. It rides the load's platform context and its `suppressTokens`
  decision unchanged, so a share link's untrusted-endpoint guard covers the
  probe too. Its own failures never fail the load — the repo config is already
  there.
- **The three layer states, framed live.** The probe stores only what it did
  (`loaded` / `missing` / `unreachable` + the target); what that MEANS is derived
  from the current global config, so pasting `inheritConfig: false` or
  `inheritConfigStrict: true` after the fact re-frames the same outcome
  immediately. 2a: the origin line (`auto-loaded` badge + `repo · file` +
  "editing makes it yours"). 2b: the quiet note, verbatim from the mockup —
  because that is precisely what a non-strict run does — upgraded to the layer's
  error style when the pasted global config sets `inheritConfigStrict: true`. 2c:
  the warn-bordered hint (and the origin line drops its "editing makes it yours"
  trailer, as the mockup has it). A refused request gets its own wording: "the
  host said no" is not "the file is not there".
- **A filled layer is not invisible.** A probe that fills the layer (or raises
  the strict error) opens the Advanced zone AND the inherited section, which is
  now controlled by App exactly like the host section (009/010 precedent) —
  otherwise a default-on fetch would change the results from behind a closed
  disclosure. A quiet miss stays quiet.
- **Editing an auto-loaded layer makes it a pasted one.** Any text change from
  outside the probe — the textarea, a share link — goes through
  `applyInheritedText`, which drops the origin metadata; from then on the layer
  is the ordinary 008 pasted layer. That is also what keeps links honest: the
  origin is never in the payload, so a link carries the layer as TEXT and opens
  without fetching anything (pinned by an e2e that copies a link after an
  auto-load, reopens it, and asserts zero platform-API requests).
- **The glossary term now covers the family.** The existing `inheritedConfig`
  entry is headed `inheritConfig` and explains the mechanism, both defaults and
  `inheritConfigStrict`, keeping its docs link to
  `self-hosted-configuration/#inheritconfig` — the mockup's card text.
- **The 008 pipeline is untouched.** This item only fills the layer's input; no
  stage, badge, provenance or share-payload shape changed.
- Verification: `pnpm lint` (silent), `pnpm -r typecheck`, `pnpm format` +
  `format:check`, app `test:unit` (218 — 29 new in `inherit-probe.test.ts`
  covering owner templating, the global-config overrides, per-field dirty
  behavior and the strict/disabled state derivations), app `build`, engine
  `test:shimmed` (97 — 7 new for `fetchRepoFile`: the single request, null for a
  404, the throw for a refusal, the token header, GitLab's ref resolution, and
  encoding/traversal refusal of the file path) and `test:golden` (61,
  unchanged), and all 54 e2e (4 new in
  `e2e/14-auto-load-inherited-config.spec.ts`; the two `12-layout-regressions`
  "Repository" locators became `exact` because the sub-row's field name contains
  the word).

## Correction (2026-07-26)

This item's "default-on" decision was justified above with "the public
Mend-hosted app runs with `inheritConfig` enabled." That is wrong. Per
[self-hosted-configuration/#inheritconfig](https://docs.renovatebot.com/self-hosted-configuration/#inheritconfig):

> We disabled inheritConfig in the Mend Renovate App to avoid wasting
> millions of API calls per week... We will add a smart/dynamic approach
> in future.

The option also defaults to `false` and is `globalOnly`. So for the
common real-world setup — the hosted app — a real run does NOT apply an
org's inherited config. Modeling that run with a default-checked box was
backwards.

Fixed: the checkbox now defaults to **off**. It auto-checks only when the
pasted global config sets `inheritConfig: true` explicitly — the one case
where a real run under that config actually would fetch this layer.
Touching the checkbox by hand (either direction) makes it the user's own
for the session, same as the two probe-target fields already did;
clearing or changing the pasted global config afterward does not clobber
that choice.

Changed: `App.tsx` (`inheritAutoEdit`, replacing the old `inheritAuto`
state; the checkbox's displayed value is now
`inheritAutoEdit ?? inheritPolicy.explicitlyEnabled`), `inherit-probe.ts`
(new `InheritPolicy.explicitlyEnabled`), `RepoLoadForm.tsx` and the
`inheritedConfig` glossary entry (rationale copy only — no behavior
change in either), and `e2e/14-auto-load-inherited-config.spec.ts`
(reworked for the new default). This document's Scope bullet above is
left as written, with a pointer here, rather than silently edited.
