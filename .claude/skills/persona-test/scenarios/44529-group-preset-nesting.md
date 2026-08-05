# 44529 — extending a `group:` preset inside a packageRule

## Discussion

[renovatebot/renovate#44529 "How to set `minimumGroupSize`/`groupSingleUpdates`/etc for a built-in group?"](https://github.com/renovatebot/renovate/discussions/44529)

## Config

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "packageRules": [
    {
      "extends": ["group:jacksonMonorepo"],
      "minimumGroupSize": 5
    }
  ]
}
```

## Validity precondition

```js verify
// Run by `generate-links.mjs --verify` against the pinned renovate.
// group:jacksonMonorepo is generated from the jackson monorepo group, and the
// diagnosis hinges on the `you should not extend` validator guard existing.
assert.ok(
  read("dist/data/monorepo.js").includes('"jackson": ['),
  "the jackson monorepo group is gone — rebase this scenario on another group: preset",
);
assert.ok(
  read("dist/config/validation.js").includes("you should not extend"),
  "the group:-preset extend guard message is gone from the validator",
);
```

## Symptom framing

### Entry

Your dependency bot already bundles a family of related libraries into a
single combined pull request. You wanted one extra thing: only bother opening
that combined request when there are at least **5** libraries to update at
once — below that, it's noise.

You added the setting where it seemed to belong, next to the thing that names
the family. The bot now reports a warning about your settings file that you
don't understand, and the minimum-of-5 doesn't appear to take effect.

Open the tool (pre-loaded with this repo's config) and figure out: (a) what
the warning is objecting to, (b) why putting the setting there doesn't work,
and (c) where it should go instead.

### Advanced

You want `minimumGroupSize: 5` applied to a built-in group. You wrote:

```json
{ "extends": ["group:jacksonMonorepo"], "minimumGroupSize": 5 }
```

inside `packageRules`, and validation reports:

> `packageRules[0].extends: you should not extend "group:" presets`

Goals:

1. Work out what is structurally wrong with extending a `group:` preset from
   inside a `packageRule` — not just that it's disallowed, but why.
2. Produce a rule that actually applies `minimumGroupSize: 5` to this group,
   and confirm in the tool that it validates cleanly.
3. Confirm your replacement really does reproduce the built-in group —
   same group name, same members.

### Expert

Same setup as Advanced. Goals:

1. Produce a precise, citable explanation of why `extends: ["group:…"]` is
   rejected inside a `packageRule` — naming the structural mismatch, precise
   enough to paste as a discussion-board answer.
2. Produce the minimal working replacement and verify it in the tool rather
   than by inspection.
3. Determine whether your replacement is **exactly** equivalent to the
   built-in group or merely close. If it differs, name the difference and
   show the evidence. Do not assume the obvious replacement is a drop-in.

## Facts each level is allowed to know

- Entry: the exact warning text above; that the intent was "only group when
  there are at least 5 updates"; that the family-naming setting was already
  working before they added the minimum; the config shown in the tool is
  this repo's real file. Not told what a "preset", "packageRule", "extends"
  or "matcher" is, and not told the fix.
- Advanced: everything Entry knows, plus standard Renovate vocabulary
  (`packageRules`, `extends`, presets, matchers, `groupName`,
  `groupSlug`) and that `minimumGroupSize` / `groupSingleUpdates` are
  group-context options. Not told what a `group:` preset's body contains,
  and not told the fix.
- Expert: everything Advanced knows. Not told the accepted answer from the
  source discussion, and not told in advance that the built-in group
  restricts update types.

Facts NOT listed here must not be given to any persona, regardless of level.

## Ground truth — NEVER shown to personas

A `group:` preset's body **is a `packageRules` array**, not a bag of options.
`group:jacksonMonorepo` resolves to:

```json
{
  "packageRules": [
    {
      "extends": ["monorepo:jackson"],
      "groupName": "jackson monorepo",
      "matchUpdateTypes": ["digest", "patch", "minor", "major"]
    }
  ]
}
```

So `extends: ["group:jacksonMonorepo"]` **inside** a `packageRule` asks
Renovate to merge a `packageRules` array into a single package rule —
`packageRules` nested inside a `packageRules` entry, which has no meaning.
The `you should not extend "group:" presets` warning is the guard against
exactly that. Note the asymmetry that makes this confusing: the same preset
at the **top level** of the config is fine, because that's where a
`packageRules` array belongs.

The fix is to extend the underlying `monorepo:` preset instead —
`monorepo:jackson` is pure match criteria (a `matchSourceUrls` array), so it
is safe inside a packageRule — and to restate the group's own settings in
the same rule:

```json
{
  "extends": ["monorepo:jackson"],
  "groupName": "jackson monorepo",
  "minimumGroupSize": 5
}
```

Correct diagnosis = identifies that a `group:` preset's body is itself a
`packageRules` array and therefore cannot be merged into a single rule.
Wrong answers to watch for: "the preset name is misspelled", "`group:`
presets are deprecated", "`minimumGroupSize` isn't a valid option",
"it needs `groupSlug` too", or treating the warning as cosmetic.

### The trap in goal 3 — do not accept "identical" uncritically

The accepted answer calls the replacement identical. It is **not exactly**:
the built-in group sets `matchUpdateTypes: ["digest", "patch", "minor",
"major"]` (`nonPinUpdateTypes` in Renovate's `group.preset.ts`), which
excludes `pin`. A hand-built rule that omits `matchUpdateTypes` therefore
also groups **pin** updates, where the built-in group would not.

An expert run should catch this — the preset inspector shows the
`matchUpdateTypes` array in the group's body, and a `pin`-update simulation
against both variants makes the divergence concrete. Grade an expert who
asserts exact equivalence without checking as **partial**, however good the
rest of their reasoning. Advanced and entry are not expected to find it.

### Validity — check before trusting a run of this scenario

Lower staleness risk than the retired `44772-monorepo-preset` scenario: the
ground truth here is about preset **structure** (a `group:` body is a
packageRules array; a `monorepo:` body is match criteria) and the validator
guard, not about a particular URL staying current. It survives Renovate
bumps unless the preset architecture itself changes.

Two things would still invalidate it — confirm both against the pinned
Renovate if a run looks strange:

1. `group:jacksonMonorepo` and `monorepo:jackson` both still exist.
2. The `you should not extend "group:" presets` warning is still emitted.

Verified present in **44.4.6**: the broken config yields exactly that one
Configuration Warning and no errors; the replacement above validates clean
and simulates to `groupName: "jackson monorepo"` with `minimumGroupSize: 5`.

### What this scenario exercises

Deliberately spans three surfaces the baseline study credited or faulted:

- the **Problems tab** — is a _warning_ (not an error) surfaced as
  prominently as the validation errors scenario 43936 covers, and does it
  get a plain-language translation and a fix affordance?
- the **preset inspector** — the diagnosis is reachable by reading
  `group:jacksonMonorepo`'s literal body. Unlike the retired 44772
  scenario, the answer is visible in the config pipeline itself and needs no
  hand-supplied simulator input.
- the **simulator** — only for goals 2/3, verifying the replacement. Note
  that `monorepo:jackson` matches on `matchSourceUrls`, so verifying it
  requires setting `sourceUrl`, which lives behind the "More fields" drawer.
  That is a known friction point, not a blocker: by that stage the persona
  has already seen the matcher in the preset body, so supplying it is
  informed rather than answer-leaking.

Feeds the outcome table as: correct diagnosis = names the packageRules-array
body as the structural reason; plus, for expert, whether they caught the
`pin` divergence in goal 3.
