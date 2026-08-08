# 44006 — :automergeMinor merge behavior

## Discussion

[renovatebot/renovate#44006 ":automergeMinor merge behavior"](https://github.com/renovatebot/renovate/discussions/44006)

## Config

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "packageRules": [
    {
      "matchPackageNames": ["*"],
      "extends": [":automergeMinor", ":label(deploy_pr)"],
      "autoApprove": true
    }
  ]
}
```

## Validity precondition

```js verify
// Run by `generate-links.mjs --verify` against the pinned renovate.
// The whole scenario rests on :automergeMinor nesting automerge ONLY under
// update-type keys — a top-level automerge in the preset would void it.
const src = read("dist/config/presets/internal/default.preset.js");
const start = src.indexOf("automergeMinor:");
assert.ok(start >= 0, ":automergeMinor no longer exists in the bundled presets");
const block = src.slice(start, src.indexOf("\n\t},", start));
for (const key of ["minor", "patch", "pin", "lockFileMaintenance"]) {
  assert.ok(
    block.includes(`${key}: { automerge: true }`),
    `:automergeMinor no longer nests automerge under ${key}`,
  );
}
assert.ok(
  !/\n\t\tautomerge:/.test(block),
  ":automergeMinor now sets a top-level automerge — the update-type scoping story is gone",
);
```

## Symptom framing

### Entry

There's a rule meant to give minor version bumps an easy, no-review path: a
specific tag gets applied, the pull request is auto-approved, and it merges
on its own. A recent update landed that's a much bigger jump than a minor
bump — a major version change — and it got the tag and the auto-approval
too. It just didn't merge on its own. That's confusing: shouldn't the whole
"easy path" either apply or not apply as one unit? Open the tool (pre-loaded
with this repo's config) and explain why it half-applied.

### Advanced

You have a `packageRule` that extends `:automergeMinor` and
`:label(deploy_pr)`, plus sets `autoApprove: true`, intended to fast-track
minor updates. A recent **major** update got the `deploy_pr` label and
auto-approval — but (correctly, in your view) did not automerge. Goals:

1. Work out why the label and approval applied to a non-minor update.
2. Confirm (or correct) your mental model of how `extends`-based presets and
   rule-level settings actually scope by update type — i.e. is "the whole
   rule only applies to minors" right or wrong, and why.
3. If the tool supports it, produce a **minor**-update run against this same
   config and check whether it actually automerges, to fully verify the
   scoping in both directions (this is the harder half — earlier tool
   versions could not show this; check the current one).

### Expert

Same setup as Advanced. Goals:

1. Produce a precise, citable explanation of why `labels`/`autoApprove`
   apply to every matched update regardless of type, while `automerge` from
   `:automergeMinor` does not — precise enough to correct someone's mental
   model in a discussion-board answer.
2. Run a **major**-update simulation (matching the reported symptom) and a
   **minor**-update simulation against the same config, and contrast the two
   final per-dependency verdicts directly. Note explicitly whether the tool
   can show you "minor ⇒ automerge true" as a rendered verdict, or only as
   raw unmerged fields you have to reason about yourself.

## Facts each level is allowed to know

- Entry: what happened (major update got the tag + approval, not the
  automerge); that the rule was meant to fast-track minor updates only; the
  config content itself. Not told what `:automergeMinor`, `extends`, or
  rule-level vs. type-scoped settings mean.
- Advanced: everything Entry knows, plus standard Renovate vocabulary,
  that `:automergeMinor` is a bundled preset, and that presets can nest
  settings under update-type keys (`minor: {...}`). Not told which specific
  settings are type-scoped and which are rule-level in this preset.
- Expert: everything Advanced knows. Not told the accepted answer from the
  source discussion verbatim in advance.

## Ground truth — NEVER shown to personas

The `:automergeMinor` preset only nests `automerge: true` under the `minor`
update-type key (equivalent to `packageRules: [{ minor: { automerge: true
} } ]`), which Renovate merges into a matched update's effective config only
when that update's `updateType` actually is `minor` (`mergeChildConfig`
against `config[updateType]`, a.k.a. "update-type flattening"). `labels`
and `autoApprove: true` in this config are set directly at the rule level,
not nested under `minor`, so once `matchPackageNames: ["*"]` matches an
update at all — major, minor, or patch — the label and auto-approval apply
unconditionally. Only `automerge` is update-type-scoped. The user's "it
should be one unit" mental model is the misconception; the tool's job is to
show, not just assert, that only `automerge` is conditional.

**This scenario doubles as a regression check for roadmap 012** (simulator
update-type flattening): the original 2026-07 study found the simulator
could not render the "minor ⇒ automerge true" contrast at all — a minor run
showed unmerged `minor: {"automerge": true}` sitting next to a top-level
`automerge: false`, indistinguishable from the major run, and the expert
persona could not complete Goal 3/2 above as a result (Finding 1 in the
study report). 012 shipped the flattening + verdict block specifically to
close this gap. When synthesizing a replay's results against the baseline
report, check specifically whether the minor-vs-major contrast is now
produced correctly — this is the single most direct "did the fix work"
signal this skill can produce.

Feeds the outcome table as: correct diagnosis = names `automerge` as the
only type-scoped setting among the three, and (post-012) whether the
persona could actually produce and read the minor-run verdict, not just
reason about it from raw fields.
