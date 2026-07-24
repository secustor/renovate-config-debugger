# Scenario library

Each file in this directory is one scenario for the `/persona-test` skill:
a real, answered Renovate configuration problem, framed at three skill
levels, with a ground-truth answer that is graded by a human after the run
and **never shown to a persona**.

Adding a scenario = adding one file here, named `<id>-<slug>.md` (`<id>` is
the source discussion number, or any short stable id for a hand-built
scenario). No registration step elsewhere is needed — `SKILL.md`'s scenario
filter matches against the filename and the `## Discussion` heading.

## Template

Copy this into a new file. The `## Config` block is machine-read by
`generate-links.mjs` (it takes the **first** ` ```json ` fenced block in the
file), so keep exactly one fenced JSON config block per scenario, and put it
under a `## Config` heading.

````markdown
# <id> — <short title>

## Discussion

<link to the source discussion, or "hand-built — no source discussion">

## Config

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"]
}
```

## Symptom framing

### Entry

<Plain-language description of the observed symptom only. No Renovate
vocabulary — no "packageRules", "preset", "matcher", "extends", "updateType",
etc. Describe what the user sees happening, not what's configured to cause
it. The persona will see the raw config on screen regardless (it's "their"
repo) — this framing is what they're TOLD about the problem, not a redaction
of the screen.>

### Advanced

<Same symptom, in Renovate vocabulary, plus explicit numbered goals the
persona should try to accomplish (typically 2-3: diagnose, propose/verify a
fix, and/or prove behavior is unchanged).>

### Expert

<Same symptom and goals as Advanced, plus an explicit ask for citation-grade
precision — e.g. "produce an explanation precise enough to paste into a
public discussion-board answer.">

## Facts each level is allowed to know

- Entry: <...>
- Advanced: <...>
- Expert: <...>

Facts NOT listed here must not be given to any persona, regardless of level.

## Ground truth — NEVER shown to personas

<The accepted-answer diagnosis, for grading only. State clearly which of the
skill's synthesis step this feeds ("outcome table: correct/partial/incorrect
diagnosis, per persona").>
````
