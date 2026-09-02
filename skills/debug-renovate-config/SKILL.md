---
name: debug-renovate-config
description: Answers questions about a Renovate configuration by resolving it with Renovate's own code — what `extends` expanded into, which layer set an option, whether Renovate would accept the config, and whether a proposed edit changes which packageRules fire. Use when reading, writing, reviewing or troubleshooting renovate.json / .renovaterc / a `renovate` block, when a Renovate PR grouped or ignored something unexpectedly, or before proposing a config change.
---

# Debugging a Renovate config

Renovate configs are hard to reason about by reading them: one `extends` entry
can pull in a thousand presets, several layers merge into every option, and
`packageRules` are order-dependent. Do not guess, and do not answer from
memory of Renovate's defaults — they change between releases. Resolve the
config and read the answer.

The tools below (MCP server `rcd`) run **Renovate's own config code** against a
pinned Renovate version, so what they report is what the bot would do.

## The loop

### 1. `run_config` — always first

Pass the config file's name and contents. You get back a **runId**, a
plain-English digest, the stage statuses, the errors and warnings, and a
summary of the preset expansion.

Everything else takes that `runId` and queries the run that is being held. Two
reasons this matters: drill-down costs milliseconds instead of a fresh
resolution (and a fresh round of preset API calls), and every answer describes
the **same** run — a config that extends a remote preset can resolve
differently five minutes later.

Add `globalConfig` / `inheritedConfig` only if the repository actually has
self-hosted config layers; most do not.

### 2. Read the digest, and check `accepted`

`accepted: false` means **a real Renovate run would refuse this config**.
Everything else the run reports is then what Renovate _would_ have done —
say so, and fix the errors before reasoning about anything downstream.

The digest is one paragraph covering the whole run. Very often it already
contains the answer. Use it to decide what to look at next instead of pulling
the whole trace.

### 3. Drill down — one question, one tool

| question                                                | tool                            |
| ------------------------------------------------------- | ------------------------------- |
| "what did `extends` pull in?"                           | `get_preset_tree`               |
| "what did preset X actually contribute?"                | `get_preset_node`               |
| "who set this option / who overrode whom?"              | `get_provenance` (with a `key`) |
| "what does this option even mean?"                      | `get_option_docs`               |
| "what does this validator message mean?"                | `explain_message`               |
| "what would I write without the presets?"               | `get_resolved_config`           |
| "what's the whole effective config, defaults included?" | `get_final_config`              |
| "would this dependency update match the rules?"         | `simulate`                      |
| "would these updates land in one PR together?"          | `simulate_group`                |
| "did my edit change behavior?"                          | `compare_simulations`           |
| "what dependencies would Renovate find in this file?"   | `extract_deps`                  |

**Preset-node bodies are large — query one node at a time.** `get_preset_tree`
deliberately returns structure and contribution stats without bodies, and it is
depth-limited; use its `query` argument to find a preset by name across the
whole expansion, then ask `get_preset_node` for that one node. Pulling bodies
for a whole `config:recommended` expansion wastes the context you need for the
actual answer.

`get_provenance` is the tool most debugging questions actually want. "Why is
`minimumReleaseAge` 3 days when I never set it" is a provenance question, not a
preset-tree question. `get_final_config` is the whole merged document,
Renovate's defaults included — it is large, and on a `config:recommended` run
almost never what you actually want; reach for `get_provenance` with a `key`
instead, and keep `get_final_config` for when you genuinely need the entire
document.

A `config:best-practices` config resolves to hundreds of rules — scope
`simulate` to your own rules first rather than reading the whole list.
`source: "repo"` limits it to the rules your config itself wrote (the answer
to "my rule is index 713 of 713"); `source: "presets"` is what `extends`
pulled in. `verdict` narrows by outcome — `matched`, `no-input`, `no-match`,
or `notable` (matched + unresolved, everything but a plain non-match).
Reach for `all`/`all` only once you know you need the whole list.

`simulate` is one dependency at a time by construction, so "does this group
actually form?" is not a question it can answer. `simulate_group` takes at
least two updates in `deps`, simulates each exactly as `simulate` would, and
tallies them by the `groupName` their matching rules produced: per group the
members, `size`, the `minimumGroupSize` gate those members carry, `wouldForm`,
and a `verdict` stating the claim in one sentence; updates no rule groups come
back in `ungrouped`, one PR each. Two limits travel with every answer. The
tally is over the updates YOU supplied — Renovate weighs `minimumGroupSize`
against the repository's real pending updates, so `wouldForm: false` means
"these updates alone don't reach it", never "this group can never form". And
membership is by `groupName` as the rules resolved it: branch splitting
(`separateMajorMinor`, custom `branchName` templates) is not modeled. For
per-update rule evidence, go back to `simulate`, one dep at a time.

`extract_deps` is the one tool besides `get_option_docs` that takes no `runId`:
pass a manifest's filename and its contents and it returns the rows Renovate's
own managers extract (`depName`, `currentValue`, `datasource`, `depType`),
`simulate`-shaped, so they feed straight into `simulate` or `simulate_group`.
The filename is what drives manager matching, and several managers can claim one
name (`pyproject.toml`) — with no `manager` every claimant runs; `manager`
forces one.

`explain_message` says so plainly when it has no translation for a message —
`translationKnown: false` plus a note — instead of quietly echoing the raw
text back at you; treat that as "go read the message yourself", not as an
answer. When it does know a message, including warnings like the
`group:`-preset one, it increasingly ships a concrete fix alongside the
explanation, not just prose.

### 4. Proposing an edit: prove it

Never hand over a config change on the strength of reading it. The oracle:

1. `run_config` the current config → `runIdBefore`.
2. Write the edit with your own file-editing tools.
3. `run_config` the edited config → `runIdAfter`. If `accepted` is false, the
   edit is wrong; fix it before going further.
4. `compare_simulations({runId: runIdBefore, runIdB: runIdAfter, dep})` with a
   dependency that represents the case you care about.

`noChange: true` means the edit is behaviorally inert for that dependency —
which is either the point (a cleanup) or a bug (you meant to change
something). Say which one it is. `compare_simulations` also carries a
plain-language net-effect summary — quote that one-liner rather than
paraphrasing the arrays yourself; when you need to go further,
`behaviorOnlyInA` / `behaviorOnlyInB` and `configDelta` are the evidence
underneath it.

For `simulate` and `compare_simulations`, set the dependency fields the rules
actually match on (`depName`, `packageName`, `datasource`, `manager`,
`depType`, `currentValue`, `newValue`, …). A matcher whose fields you left
unset reports `no-input` — it did not pass, it had nothing to read. If a rule
you expected to fire did not, look at its clause evidence before concluding
the rule is wrong; usually the simulated dependency is underspecified.

## No MCP server? Use the CLI

The same answers, same engine, from a shell — every subcommand takes
`--format json`:

```bash
npx -y @renovate-config-debugger/cli digest renovate.json
npx -y @renovate-config-debugger/cli validate renovate.json --format json
npx -y @renovate-config-debugger/cli tree renovate.json --node "config:best-practices" --body resolved
npx -y @renovate-config-debugger/cli provenance renovate.json minimumReleaseAge --format json
npx -y @renovate-config-debugger/cli simulate renovate.json --dep '{"depName":"react","currentValue":"17.0.0","newValue":"18.0.0"}' --format json
npx -y @renovate-config-debugger/cli compare before.json after.json --dep '{"depName":"react"}'
npx -y @renovate-config-debugger/cli group renovate.json --dep '{"depName":"react","updateType":"minor"}' --dep '{"depName":"react-dom","updateType":"minor"}'
npx -y @renovate-config-debugger/cli docs minimumReleaseAge
npx -y @renovate-config-debugger/cli extract package.json
```

`group` is `simulate_group`'s answer (`--dep` repeated, or `--deps-file` with a
JSON array of the same objects — inline descriptors are parsed as JSON5, a
`--deps-file` batch as strict JSON). `docs` is `get_option_docs`: Renovate's own
option table for the pinned version — type, default, allowed values,
deprecation, where the option may appear, and whether it is mergeable,
inheritable or templated. It answers only for the version pinned, because
Renovate ships no per-option version history at all — neither `docs` nor
`get_option_docs` can tell you when an option appeared or last changed.
`docs <substring> --search` lists the options whose name matches, for when you
have the concept and not the spelling. `extract` is `extract_deps`'s answer:
point it at a manifest and it prints the rows Renovate's managers extract.

`validate` exits **2** when Renovate would refuse the config and **1** on an
infrastructure error, so it works as a check in CI or a hook without a wrapper.
The other pipeline subcommands use the same codes, with two exceptions:
`compare` exits **0** whenever the comparison itself ran, even over a config
Renovate would refuse — the refusal is reported on the output instead — and
`extract` exits **1** when no manager section produced dependencies, which is
its verdict rather than a failure.

## Things worth not re-learning

- **Credentials come from the environment only** — `RCD_GITHUB_TOKEN` or
  `GITHUB_TOKEN`/`GH_TOKEN`, `RCD_GITLAB_TOKEN`/`GITLAB_TOKEN`,
  `RCD_GITEA_TOKEN`, `RCD_FORGEJO_TOKEN`. Private preset repositories need one.
  Never put a token on a command line.
- If a config's global layer chooses the API endpoint, tokens are withheld and
  the tool says so — that is a deliberate guard, not a bug. It is bypassed
  explicitly (`trustEndpoints` / `--trust-endpoints`), and only for a config
  the user actually trusts.
- A preset that cannot be fetched shows up as a failed node, and everything
  under it is missing from the effective config. Check for that before
  concluding an option "is not set".
- **An oversized answer is elided, not silently cut.** A tool result too big
  to return whole rewrites its largest array in place as
  `{truncated: true, shown, omitted, omittedFrom, items: […]}` — the gap sits
  at index `omittedFrom` in `items` — and the whole document gets a top-level
  `truncated: true` plus a `hint` naming the parameter that narrows the
  question. Index `rules[0]` on an elided answer and you get `undefined` — the
  array moved to `.items` inside the wrapper. Follow the hint (fewer rules,
  one preset node, a smaller depth) rather than re-reading the raw shape;
  elision keeps both ends of a shrunk array, so a rule your own config
  appended last is not the one that vanished.
- **`simulate` answers the question by default.** Its default `detail:
"verdict"` payload is the matched rules, `flattened` and
  `finalDependencyConfig`; the ~1 MB step-by-step merge trace (`mergeSteps`,
  `rawFinalConfig`) only comes with `detail: "full"`, which is over budget by
  construction and arrives elided. Reach for it only when the per-step merge
  order itself is the question.
- This tooling is **experimental**: tool names, flags and output shapes may
  change. If a call fails with an unknown-argument error, list the tools (or
  run `--help`) rather than guessing a variant.
