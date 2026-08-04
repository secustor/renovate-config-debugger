# 44958 — non-Python tool swept into a `matchCategories: ["python"]` group

## Discussion

[renovatebot/renovate#44958 "Grouping error with zizmor-pre-commit"](https://github.com/renovatebot/renovate/discussions/44958)

## Config

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "packageRules": [
    {
      "groupName": "Python Packages",
      "matchCategories": ["python"]
    }
  ]
}
```

## Symptom framing

### Entry

Your dependency bot groups related updates together so they arrive as one
pull request instead of many. One of those groups is meant to collect the
project's Python libraries, and it's worked fine for months.

This week the bot opened that group's pull request and it contained
`zizmorcore/zizmor-pre-commit` — a linting tool for GitHub Actions workflow
files, written in Rust. It is not a Python library and has nothing to do with
the others in that pull request. Nobody changed the settings file.

Open the tool (pre-loaded with this repo's config) and figure out: (a) why
that tool ended up in this group, and (b) what the smallest change is that
would keep it out without breaking the grouping for the actual Python
libraries.

### Advanced

You have a `packageRule` with `groupName: "Python Packages"` and
`matchCategories: ["python"]`. It has started sweeping in
`zizmorcore/zizmor-pre-commit`, which is a Rust binary consumed as a
pre-commit hook — not a Python package by any reading. Your logs show the
dependency resolving as:

```
"depName":     "zizmorcore/zizmor-pre-commit",
"packageName": "zizmorcore/zizmor-pre-commit",
"datasource":  "github-tags",
"depType":     "repository",
"sourceUrl":   "https://github.com/zizmorcore/zizmor-pre-commit"
```

The datasource and version detection look correct — it is only the _grouping_
that is wrong. Goals:

1. Work out what `matchCategories: ["python"]` is actually matching against
   here, given nothing in the dependency's own metadata says "python".
2. Determine the minimal repo-side config change that excludes this
   dependency from the group while leaving the real Python packages grouped.
3. Say whether this is something you can fix in your own config or something
   that has to change upstream.

### Expert

Same setup as Advanced. Goals:

1. Produce a precise, citable explanation of where the `python` category on
   this dependency comes from — precise enough to paste as a
   discussion-board answer, naming the exact mechanism rather than the
   symptom.
2. Produce the minimal repo-side fix and, using the tool rather than by
   inspection, show that it excludes this dependency while still matching a
   genuine Python package.
3. State whether the tool let you _discover_ the cause or only _confirm_ a
   cause you already knew — and be specific about which input you had to
   supply by hand for the simulation to reproduce the reported behavior at
   all.

## Facts each level is allowed to know

- Entry: the affected dependency is `zizmorcore/zizmor-pre-commit`; it is a
  GitHub Actions workflow linter written in Rust; it is installed as a
  pre-commit hook; it appeared in the pull request for the group intended to
  hold Python libraries; the config shown in the tool is this repo's real
  file. Not told what a "category", "manager", "matcher" or "preset" is, and
  not told the fix.
- Advanced: everything Entry knows, plus standard Renovate vocabulary
  (`packageRules`, `matchCategories`, `matchManagers`, `groupName`,
  managers, datasources) and that the dependency is tracked by Renovate's
  **`pre-commit` manager** with datasource `github-tags` and depType
  `repository`. Not told what supplies the `python` category, and not told
  the fix.
- Expert: everything Advanced knows. Not told the accepted answer from the
  source discussion, and not told in advance that the category originates
  from the manager definition rather than from the package.

Facts NOT listed here must not be given to any persona, regardless of level.

## Ground truth — NEVER shown to personas

`matchCategories` does not inspect the package. It matches against the
`categories` Renovate attaches to the dependency, and those come from the
**manager** that found it. Renovate's `pre-commit` manager declares
`categories: ["python"]` (`lib/modules/manager/pre-commit/index.ts`), a
historical artifact of pre-commit's origins as a Python project. Every
dependency discovered by the pre-commit manager therefore carries the
`python` category regardless of what language the hook is actually written
in — so `matchCategories: ["python"]` sweeps in `zizmor-pre-commit` (Rust),
along with every other non-Python hook in `.pre-commit-config.yaml`.

Correct diagnosis = identifies that the `python` category is contributed by
the **pre-commit manager**, not by anything about the package itself. Wrong
answers to watch for: "the datasource is misclassified", "`github-tags`
implies python", "the package name matches a python pattern", "`config:recommended`
adds it".

The repo-side fix is the one the reporter adopted — narrow the rule by
excluding the manager:

```json
{
  "groupName": "Python Packages",
  "matchCategories": ["python"],
  "matchManagers": ["!pre-commit"]
}
```

(clauses within a single rule AND together, so this narrows the existing rule
rather than adding a second one.) Upstream also accepted this as a Renovate
bug: [PR #45005](https://github.com/renovatebot/renovate/pull/45005)
("fix(manager/pre-commit): remove category") was **merged 2026-08-03**,
removing the `category` field from the pre-commit manager entirely.

### Validity — check before trusting a run of this scenario

This scenario depends on the pinned Renovate still shipping the pre-commit
manager's `python` category. It is present in **44.4.6** (the version pinned
when this scenario was written) but PR #45005 is already merged upstream, so
a future Renovate bump will remove it and invalidate the scenario — the same
way an upstream preset update invalidated the retired `44772-monorepo-preset`
scenario. Cheap check against the pinned package:

```sh
grep -rn "categories" node_modules/.pnpm/renovate@*/node_modules/renovate/dist/modules/manager/pre-commit/index.js
```

If that no longer yields `["python"]`, retire or re-pin this scenario rather
than grading personas against it.

### Doubles as a regression check: manager ⇒ categories derivation

As of the build this scenario was written against, the simulator's `manager`
and `categories` inputs are **independent free-text fields** — nothing
derives one from the other (`packages/app/src/features/simulator/form.ts`,
`MoreFieldsDrawer.tsx`). Consequence: entering `manager: "pre-commit"` does
**not** populate `categories: ["python"]`, so `matchCategories` evaluates
against an empty list and the rule does not match. The tool therefore shows
the _opposite_ of the reported symptom unless the persona types
`categories = python` by hand — which is supplying the answer as input, not
discovering it.

This is the same class of gap as the `sourceUrl`-is-unset trap the retired
44772 scenario exposed: an unset input silently manufactures a "no match"
that has nothing to do with the user's config.

When synthesizing, check specifically:

- Does the simulator derive `categories` from the selected `manager`? If yes,
  this gap is closed and the scenario becomes solvable unaided.
- If not, does the tool at least _warn_ that a rule's only matcher reads a
  field left unset, rather than silently reporting "no match"?

Feeds the outcome table as: correct diagnosis = names the pre-commit manager
as the source of the `python` category; and, separately, whether the persona
could reach that unaided or only by hand-supplying `categories`.
