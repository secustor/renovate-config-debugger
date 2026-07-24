# 43936 — star-exclusion pattern newly flagged as invalid

## Discussion

[renovatebot/renovate#43936 "Invalid configuration reported, but configuration seems correct"](https://github.com/renovatebot/renovate/discussions/43936)

## Config

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "packageRules": [
    {
      "matchPackageNames": ["*", "!gradle"],
      "groupName": "all dependencies except gradle"
    }
  ]
}
```

## Symptom framing

### Entry

Your dependency bot's settings file just started failing a check, with a
message that doesn't obviously make sense: something like _"Your input
contains \* or \*\* along with other patterns. Please remove them."_ Nobody
touched this file recently — it used to be accepted. Open the tool
(pre-loaded with this repo's config) and figure out: (a) is this an actual
problem with the file, or just a confusing message about something harmless;
(b) what exactly is it complaining about; (c) what's the smallest change
that would make the message go away, without changing what the file
actually does.

### Advanced

Validation on this config newly fails with:

> Your input contains \* or \*\* along with other patterns in the array.
> Please remove them or convert to the recommended, safe syntax array.

for `matchPackageNames: ["*", "!gradle"]`. Nothing about this rule's intent
changed on your end — the config used to validate cleanly. Goals:

1. Determine whether this is a real problem with the config or a validator
   regression that shouldn't affect behavior.
2. Pin down exactly which array/entry is being flagged, and why.
3. Produce the minimal fix, and prove it doesn't change which packages the
   rule matches.

### Expert

Same setup as Advanced. Goals:

1. Produce a precise, citable explanation of why the validator now rejects
   `["*", "!gradle"]` — precise enough to paste as a discussion-board answer.
2. Pin down exactly which array/entry is flagged.
3. Produce the minimal fix and prove — using the tool, not just by
   inspection — that it is behavior-preserving.

## Facts each level is allowed to know

- Entry: the exact validation error text shown above; that the file
  previously passed validation with no changes on their part; the config
  content itself (their repo's real file). Not told what `matchPackageNames`
  means, not told what a glob/wildcard convention means in this context, not
  told the fix in advance.
- Advanced: everything Entry knows, plus standard Renovate vocabulary and
  that `matchPackageNames` accepts glob-style patterns including `*`/`**`
  and negation (`!pattern`). Not told the specific rationale for the
  validator tightening, not told the fix in advance.
- Expert: everything Advanced knows. Not told the accepted answer from the
  source discussion verbatim in advance — expected to reconstruct the
  reasoning (redundant `*` next to an already-total negated set) themselves.

## Ground truth — NEVER shown to personas

Renovate's validator was tightened to flag any `matchPackageNames` (or
similar matcher) array that mixes a wildcard (`*`/`**`) with other, more
specific patterns, because mixing them is usually a sign of a mistaken
intent. In this config, `*` is redundant: `!gradle` alone already means
"match everything except `gradle`" (negation-only patterns imply "match all
except…"), so `["*", "!gradle"]` and `["!gradle"]` select exactly the same
set of packages. The fix is `matchPackageNames: ["!gradle"]` — remove the
`*` — with **no behavioral change**. This is a real (if confusingly worded)
validation error, not a false positive, and not something the user broke.

Feeds the outcome table as: correct diagnosis = identifies the `*` as
redundant given `!gradle` and proposes removing it (not adding `**`, not
reordering, not adding an unrelated pattern); "confidence" should reflect
whether the persona actually verified same-behavior (e.g. via a simulation
before/after) rather than asserting it.
