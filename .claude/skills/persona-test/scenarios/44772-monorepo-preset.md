# 44772 — monorepo:react preset not working

## Discussion

[renovatebot/renovate#44772 "monorepo:react preset not working"](https://github.com/renovatebot/renovate/discussions/44772)

## Config

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "packageRules": [
    {
      "extends": ["monorepo:react"],
      "enabled": false
    }
  ]
}
```

## Symptom framing

### Entry

Someone on your team set this repo's dependency-update bot up to leave
`react` alone — React upgrades need careful manual testing here, so a rule
was added specifically to stop the bot from ever touching it. This week it
opened a pull request anyway, bumping `react` from `18.2.0` to `19.2.0` —
exactly the kind of change that was supposed to be blocked. Open the tool
(pre-loaded with this repo's config) and figure out why the block didn't
work.

### Advanced

You added a `packageRule` that extends `monorepo:react` with
`enabled: false`, expecting it to silence updates to `react` and its
monorepo siblings. You keep getting `react` PRs anyway — the latest one
bumping `18.2.0` → `19.2.0`. Goals:

1. Work out why your disable rule isn't matching the `react` dependency.
2. Determine what config change (if any) would actually stop these PRs.

### Expert

Same setup as Advanced: a `packageRule` extending `monorepo:react` with
`enabled: false` is not suppressing `react` updates (`18.2.0` → `19.2.0`
observed). Goals:

1. Produce a precise, citable explanation of why `monorepo:react` fails to
   match `react` today — precise enough to paste into a discussion-board
   answer, naming the exact clause that fails and why.
2. Determine whether this is fixable purely by editing this repo's config
   right now, or whether it needs an upstream preset update — i.e. what
   should the person asking this actually do next.

## Facts each level is allowed to know

- Entry: the affected package is `react`; the observed version bump is
  `18.2.0` → `19.2.0`; the rule was added on purpose to block react updates;
  the config shown in the tool is this repo's real config. Not told what a
  "preset" or "matcher" is, not told the preset's match target, not told
  about any upstream repository move.
- Advanced: everything Entry knows, plus standard Renovate vocabulary
  (`packageRules`, `extends`, presets, matchers, `enabled`) and that
  `monorepo:react` is a bundled preset they didn't author. Not told what the
  preset's literal body matches on, not told about the repository move.
- Expert: everything Advanced knows. Not told the specific accepted answer
  from the source discussion, and not told in advance that a repository
  rename is involved — that is exactly what they're expected to find via the
  preset inspector and the simulator's per-clause evidence.

## Ground truth — NEVER shown to personas

The bundled `monorepo:react` preset's `packageRules` entry matches on
`matchSourceUrls: ["https://github.com/facebook/react"]`. The upstream
`react` npm package's source repository moved from `facebook/react` to
`react/react`; Renovate now resolves `sourceUrl` for `react` as
`https://github.com/react/react`, which does not match the preset's
hard-coded `facebook/react` URL. The clause never matches, so the rule
(and its `enabled: false`) never applies — `react` updates flow through
normally, unaffected by the disable rule. This is an upstream-preset
staleness issue, not a mistake in the user's own config; the fix is either
an upstream preset update or a repo-level override
(`matchSourceUrls: ["https://github.com/react/react"]`, `enabled: false`)
added alongside the existing rule.

Feeds the outcome table as: correct diagnosis = names the source-URL
mismatch (repo move) as the cause, not "the preset doesn't exist" or "the
version range is wrong" or similar.
