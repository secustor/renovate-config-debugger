# @renovate-config-debugger/cli

> [!WARNING]
> This package is experimental

`rcd` answers questions about a Renovate config: which presets it expands into,
where each resolved option came from, which `packageRules` would match a given
dependency, and whether Renovate would accept the file at all.

## Install

Needs Node 24 or newer. There is nothing to install:

```console
$ npx -y @renovate-config-debugger/cli digest renovate.json
$ npx -y @renovate-config-debugger/cli mcp
```

The examples below write `rcd`, which is what a global install puts on your PATH.

## Usage

> [!NOTE]
> It is recommended to use the MCP server as it cuts down the overhead if multiple calls are done for the same config

```console
$ rcd digest renovate.json
✓ Renovate accepted this config. Your `config:recommended` entry expanded into
1,076 presets — only 7 of which set options, the rest are package-grouping
rules. Everything merged into 34 effective options, 6 of them overridden along
the way.
```

| command      | question it answers                                  |
| ------------ | ---------------------------------------------------- |
| `digest`     | what happened in this run, in one paragraph          |
| `validate`   | would Renovate refuse this config? (exit `2` if so)  |
| `tree`       | which presets did the config pull in                 |
| `provenance` | which preset set this option                         |
| `resolved`   | the merged config Renovate would run with            |
| `simulate`   | which `packageRules` match a hypothetical dependency |
| `compare`    | did an edit change behavior                          |
| `run`        | the whole trace                                      |
| `docs`       | what an option means, and where it may go            |
| `mcp`        | all of the above over MCP stdio                      |

```console
$ rcd validate renovate.json
$ rcd tree renovate.json --node "config:best-practices" --body resolved
$ rcd provenance renovate.json labels
$ rcd resolved renovate.json --mode full
$ rcd simulate renovate.json --dep '{"depName":"react","currentValue":"17.0.0","newValue":"18.0.0"}'
$ rcd compare before.json after.json --dep '{"depName":"react"}'
$ rcd docs minimumReleaseAge
$ echo '{"extends":["config:recommended"]}' | rcd run --stdin --format json --select status
```

## Flags

Run `rcd --help` lists the commands and `rcd <command> --help` their flags. Every
command except `mcp` takes `--format <pretty|json>`.

Every command that reads a config takes the same input flags. The config itself
is a positional file path unless one of these replaces it.

| flag                       | effect                                                              |
| -------------------------- | ------------------------------------------------------------------- |
| `--stdin`                  | read the config from stdin                                          |
| `--file-name <name>`       | config file name, drives format detection (default `renovate.json`) |
| `--repo <owner/repo>`      | load the config from a repository instead of a file                 |
| `--ref <ref>`              | git ref for `--repo`                                                |
| `--platform <name>`        | platform context for `local>` presets (default `github`)            |
| `--endpoint <url>`         | API endpoint for the platform                                       |
| `--platform-override`      | let `--platform`/`--endpoint` win over the global config            |
| `--global-config <file>`   | self-hosted global config layer (JSON)                              |
| `--inherited <file>`       | inherited config layer (JSON)                                       |
| `--inject <preset>=<file>` | supply content for a preset no fetcher can reach (repeatable)       |
| `--trust-endpoints`        | send host tokens even to an endpoint the config chose               |

The rest belong to one command each.

| command      | flag                         | effect                                                                  |
| ------------ | ---------------------------- | ----------------------------------------------------------------------- |
| `provenance` | `--rule <n>`                 | one merged `packageRule`: its body, its layer, its index in that layer  |
|              | `--source <which>`           | scope the `packageRules` ranges: `repo\|presets\|all`                   |
| `tree`       | `--node <name>`              | one preset node, by name or identity                                    |
|              | `--body <which>`             | `fetched\|afterParams\|input\|resolved` (needs `--node`)                |
|              | `--depth <n\|all>`           | tree depth to print (default `2`)                                       |
| `resolved`   | `--mode <m>`                 | `full\|keep-internal` (default `keep-internal`)                         |
|              | `--include-defaults`         | write out Renovate's defaults too (`--mode full` only)                  |
| `simulate`   | `--dep <json>`, `--dep-file` | the dependency update to simulate                                       |
|              | `--verdict <which>`          | `notable` (default) \|`all`\|`matched`\|`no-input`\|`no-match`\|`error` |
|              | `--source <which>`           | which config level contributed the rule: `repo\|presets\|all`           |
|              | `--rule <n>`                 | one merged rule's whole row, whatever the facets hide                   |
|              | `--detail <which>`           | `verdict` (default) \| `full` — `full` adds the merge trace             |
|              | `--keys <a,b,…>`             | only these options of `finalDependencyConfig`                           |
|              | `--config-scope <which>`     | `package-rules` (default) \| `full`                                     |
| `compare`    | `--dep`/`--dep-file`         | the A-side dependency                                                   |
|              | `--dep-b`/`--dep-b-file`     | the B-side dependency                                                   |
|              | `--detail <which>`           | `verdict` (default) \| `rules` \| `full`                                |
|              | `--keys <a,b,…>`             | only these options of the config delta                                  |
|              | `--config-scope <which>`     | `package-rules` (default) \| `full`                                     |
| `run`        | `--select <a,b,…>`           | `status\|errors\|warnings\|final\|events\|tree\|layers\|platform\|all`  |
|              | `--keys <a,b,…>`             | only these options of `--select final`                                  |
|              | `--config-scope <which>`     | `full` (default) \| `package-rules`                                     |
| `docs`       | `--search`                   | list options whose name matches                                         |

### What `docs` answers

Renovate's own option table for the pinned version, projected — nothing here is
restated prose. Besides type, default, allowed values and deprecation:

| line          | says                                                                           |
| ------------- | ------------------------------------------------------------------------------ |
| `placement`   | where the option may appear — including `no restriction`, which is a statement |
| `container`   | the options RESTRICTED to it; any unrestricted option may appear there too     |
| `patterns`    | values are matched as globs, or regexes when written `/…/`; `!` negates        |
| `templating`  | the value may carry `{{…}}` template expressions                               |
| `stage`       | Renovate drops the option once the run passes this stage                       |
| `mergeable`   | preset and repo values merge rather than replace                               |
| `inheritable` | may be set in the inherited config layer                                       |

`placement: no restriction` comes from upstream's own code, not a guess:
Renovate's validator enforces nesting only for options that declare `parents`,
so an option without them is legal at the top level and inside any container.

Renovate ships no per-option version history — no `since`, no changelog in the
package — so neither `rcd docs` nor `get_option_docs` can tell you when an
option appeared or last changed. They answer only for the version pinned, which
every header names.

### Narrowing a config answer

Three commands answer with a config document, and two flags project it. Both
only ever narrow, so any answer is a subset of the one you would have got
without them, and every projected payload carries a `configView` saying which
view produced it.

`--config-scope package-rules` drops the ~107 `globalOnly` options — the ones
read from a self-hosted global config, which no `packageRule` can read or
write. That is the default where the document is a PER-DEPENDENCY config
(`simulate`, `compare`), because the class is provably inert there. It is not
the default for `rcd run --select final`, which is the run's whole effective
config: when you are debugging a global or inherited layer, those options are
the answer.

`--keys a,b` selects top-level options by name, out of what the scope left. A
name the scope removed is not resurrected — it comes back in
`configView.withheld` with the reason, and `--config-scope full` is the way to
it:

```console
$ rcd simulate renovate.json --dep '{"depName":"react"}' --format json --keys groupName,onboardingConfig
{
  "finalDependencyConfig": { "groupName": "react monorepo" },
  "configView": {
    "scope": "package-rules",
    "keys": 1,
    "droppedGlobalOnly": 107,
    "withheld": [{ "key": "onboardingConfig", "reason": "global-only" }]
  }
}
```

On the fixture measured for this feature that call is 2.9 kB, against 24.5 kB
for the default answer and 106 kB for `--detail full`.

### Which layer wrote which rule

`packageRules` is the one key Renovate CONCATENATES: every layer appends its own
rules and none overrides another, so "who won" is the wrong question for it.
`rcd provenance <file> packageRules` answers with one contiguous merged-index
range per contributing layer, plus a one-line digest of each rule:

```console
$ rcd provenance renovate.json packageRules
packageRules [appended] — 714 merged rules, concatenated: every layer appends, none overrides

  preset config:recommended — merged packageRules[0]–[712] (its own packageRules[0]–[712])
    0 matchPackageNames: ["*"] → semanticCommitType
    …
  repo — merged packageRules[713]–[713] (your packageRules[0]–[0])
    713 matchPackageNames: ["react"] → groupName
```

That is the arithmetic the other commands' indexes need: a rule's index inside
its own layer is `index - from`, and for the `repo` range that is the
`packageRules[N]` you wrote. `--source repo` keeps just your own ranges (the
indexes do not move), and `--rule <n>` prints one merged rule's body with the
layer that wrote it.

The same numbers travel with the answers that quote an index:

- `rcd simulate --format json` carries `ruleSources` (the same ranges) and, on
  every rule that MATCHED, an inline `origin: {layer, sourceIndex}`; pretty
  output appends ` [repo packageRules[0]]` to the matched lines.
- `rcd validate` adds a line under any message whose `packageRules[N]` it can
  cross-link — the validator cites the config as WRITTEN, the simulator the
  merged array, and for a config with presets those are different numbers.
  Nothing is annotated when the run cannot be attributed, or when the message
  came from a global/inherited layer's own validation.

## A debugging session

`@types/react` is not getting the `minimumReleaseAge` you thought you set:

```json
{
  "packageRules": [
    { "matchPackageNames": ["react", "react-dom"], "minimumReleaseAge": "7 days" },
    { "matchUpdateTypes": ["major"], "dependencyDashboardApproval": true }
  ]
}
```

<details>
<summary>Debugging flow</summary>

First rule out a config Renovate would throw away entirely:

```console
$ rcd validate renovate.json
✓ Renovate accepted this config.
```

Had it not, the exit code would be `2` and the output would quote Renovate's own
message (`Configuration Error: packageRules[0]: Each packageRule must contain at
least one match* or exclude* selector`). It passes, so ask what the rules
actually do for the dependency in question:

```console
$ rcd simulate renovate.json --dep '{"depName":"@types/react","updateType":"major"}'
This major update gets no special handling from your matched rules — the defaults apply.

1 of 2 packageRules matched.

  #2 matched (matchUpdateTypes=matched)
      sets dependencyDashboardApproval = true
1 of 2 rule hidden by --verdict notable — `--verdict all --source all` shows every rule.
```

Rule #1 is the missing one. `--verdict no-match` prints the clause that rejected
it, and `--rule 0` returns that one row whatever the facets hide:

```console
$ rcd simulate renovate.json --dep '{"depName":"@types/react","updateType":"major"}' --verdict no-match
  #1 no-match (matchPackageNames=no-match)
```

So `matchPackageNames` is the culprit, not the update type.

Now suppose rule #1 had selected on something your `--dep` never mentioned —
`"matchSourceUrls": ["https://github.com/facebook/react"]` instead of
`matchPackageNames`. From the outside the run looks the same: a rule that reads
a field you left unset fails CLOSED, which Renovate reports as an ordinary
`no-match`, and every scoped view hides it. The missing-input line is what says
so, and it is printed whatever `--verdict` you asked for:

```console
$ rcd simulate sourceurl.json --dep '{"depName":"@types/react","updateType":"major"}'
This major update gets no special handling from your matched rules — the defaults apply.

1 of 2 packageRules matched.

  #2 matched (matchUpdateTypes=matched)
      sets dependencyDashboardApproval = true
1 of 2 rule hidden by --verdict notable — `--verdict all --source all` shows every rule.
1 of 2 rules could not match because the simulated dependency has no sourceUrl — Renovate treats a missing value as a non-match. Set sourceUrl on the dependency if you expected these rules to fire. `--verdict no-input` lists them.
```

`--format json` carries the same fact as `missingInputs` (`rules`, and one group
per unset field set with its `selectors`, its rule count and up to five
`sampleRuleIndexes`) plus the sentence in `notes`. It survives
`--verdict`/`--source` and the MCP answer's size elision, because the rules it
counts are exactly the rows a filter removes — and `--rule <n>` takes one of
those `sampleRuleIndexes` and returns that row. Its sibling `evaluationErrors`
counts the rules whose matcher THREW (the `conda` versioning scheme is the
documented case: its ~3 MB WASM parser is excluded from the browser build, so
`matchCurrentVersion` cannot be evaluated). Those rules also report a plain
`no-match`, so they are kept in the default view on purpose — an answer the tool
could not compute is not a verdict about your config. Add `@types/react`
to that list, keep the original as `before.json`, and use `compare` as the oracle
for the edit. On the dependency you were fixing it should report exactly the
change you wanted:

```console
$ rcd compare before.json after.json --dep '{"depName":"@types/react","updateType":"major"}'
Behavior differs between A and B — minimumReleaseAge (A=null by default, B="7 days"); 1 rule started matching.

Matched only in B:
  matchPackageNames

Config delta:
  minimumReleaseAge: null (default in A) → "7 days"
```

And on a dependency that already worked, nothing:

```console
$ rcd compare before.json after.json --dep '{"depName":"react","updateType":"major"}'
✓ No behavioral change — the same effective config results (a rule's matchPackageNames list changed), which is expected when the edit touched the very selectors that rule matches on.

Selector text changed, same effect (rule identity, not behavior):
  matchPackageNames  #1 → #1  (clause-values-changed)
```

That second run is the point of the two axes. Behavior is the citable claim: the
per-dependency config is identical and no rule started or stopped doing
something. Rule identity goes true on edits that provably change nothing, because
adding an entry to the array a rule matches on rewrites that rule's selector
text — and the parenthetical says WHICH kind of rewrite it was, so
`clause-added` never reads as a pattern replacement.

### Reading the comparison JSON

`--format json` and the MCP `compare_simulations` answer carry the same object.
It is ordered so the answer comes first:

| field                                     | what it says                                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `summary`                                 | the whole verdict in one line — `${verdict}: ${netEffect}`                                                                                                                                                   |
| `verdict`                                 | `identical`, `documentation-only` (only prose such as `description` moved), or `differs`                                                                                                                     |
| `netEffect`                               | the words after the colon, so no consumer slices the string                                                                                                                                                  |
| `mode`                                    | which axis the caller varied: `config`, `dependency`, or `unspecified`                                                                                                                                       |
| `stoppedMatching` / `startedMatching`     | BEHAVIOR: effects one side produced and the other did not                                                                                                                                                    |
| `matchedInBoth`                           | rules paired by selector signature — `--detail rules` and up only                                                                                                                                            |
| `configDelta[]`                           | changed keys, behavioral first; `kind` is `behavioral` or `documentation`, `a`/`b` are the two sides, `inA`/`inB` say which side has the key                                                                 |
| `configDelta[].aInherited` / `bInherited` | that side's value reached the final config with NO merge step writing it — a Renovate default, not a setting the config carries                                                                              |
| `identity.*`                              | bookkeeping about selector TEXT, **not** a behavior claim: `changed` always, `counts` at `--detail verdict`, `signatureChanges[]` (each with `kind` and `keys`) plus `onlyInA/onlyInB` from `--detail rules` |
| `notes[]`                                 | every pointer about the answer: what the detail level withheld, and each side's own missing-input / evaluation-error line                                                                                    |

`summary`, `verdict` and `netEffect` always describe the WHOLE delta, so
`--keys`/`--config-scope` narrow the view without ever moving the verdict; what
the view withheld is in `configView`.

A few things to know when you write your own `--dep`. The two name
fields are cross-defaulted the way Renovate's fetch worker does before
`packageRules` run (`dep.packageName ??= dep.depName`), so
`--dep '{"depName":"react"}'` matches a `matchPackageNames` rule instead of
falling through, and the run's notes say when a field was defaulted. A clause
reads `no-input` when the field it matches on was absent from your `--dep`, which
is a different failure from `no-match` — and a rule that lost only to unset
input is counted in `missingInputs` on both commands, per side on `compare`
(`a.missingInputs`/`b.missingInputs`, and an `A — …` / `B — …` line in pretty
output). Two sides that both went blind on the same rule agree perfectly, so
`identical:` over them says nothing about your edit. And if either input config
would be
refused by Renovate, both commands exit `2`, which says nothing about the
simulation itself, so they also say so on their own output (`exitNote` in JSON, a
trailing `note:` line in pretty).

On a `config:best-practices` run the rule list runs to several hundred, so BOTH
output formats answer with the rules that ACTED — `--verdict notable`: matched,
not-simulated, and the rows the tool could not evaluate. Measured on a
`config:recommended` config plus a react major, that is 2,550 bytes of rule rows
against 340,843 for the whole array, which no MCP answer can carry anyway (the
transport would elide it into a first/last window chosen by byte arithmetic).
Nothing is withheld silently:

- `--format json` and the MCP answer always carry `ruleFilter` with
  `verdict`/`source`/`total`/`shown`/`hidden`, and a `notes` entry naming the
  parameters that widen the view;
- pretty output ends a narrowed list with how many rules it hid;
- `--verdict all` returns every row, `--verdict matched|no-input|no-match|error`
  one class, and `--rule <n>` one merged rule's whole row (its clauses, what it
  merged, and the `origin` the list carries only on matched rows) whatever the
  facets hide. `ruleSources` is the legend for those indexes.

`matched` is a subset of `notable`, so
`rcd simulate --format json | jq '.rules[] | select(.verdict=="matched")'`
returns exactly what it always did.

Both output formats lead with the outcome in one sentence — `verdict.text` in
JSON, the first line of pretty output. It is the same string the web app's
verdict card renders, so a terminal and a screenshot cannot disagree about what
a config does; `verdict.changedKeys` are the options the rules changed, and
`verdict.caveat` appears when one of YOUR rules failed only because `--dep` left
a field unset.

`flattened` says what the update-type flattening did. `blocks` are the
`major`/`minor`/`patch`/`pin`/`digest`/`lockFileMaintenance`/`replacement`
blocks the config carried before flattening — Renovate's defaults declare all
seven, so presence alone means nothing — and `authoredBlocks` are the ones a
human wrote. `appliedBlock` is `null` when there was no block for this update
type at all, and carries `changed: []` when the block was there and contributed
nothing; `consumedBlocks` are the authored blocks dropped WITHOUT applying,
which is why an option you set may be missing from the result. `note` states
which of those four happened, in one sentence.

`simulate --format json` answers at `--detail verdict`: `mergeSteps` and
`rawFinalConfig` describe how the merge proceeded — ~1 MB on a
`config:recommended` run — and are opt-in through `--detail full`, which returns
the whole simulation result unprojected, exactly as it comes out of the engine.
The one thing `--detail full` does not widen is the rule LIST: which rows you
asked for is `--verdict`'s question, at every detail level. The same flag exists
as `detail` on the MCP `simulate` tool; the two transports are one
implementation.

`compare` has its own `--detail`, same vocabulary on both transports. At the
default `verdict` it answers with the claim and its evidence and states the
identity axis as counts (`identity.counts.onlyInA/onlyInB/signatureChanges`); it
omits `matchedInBoth` — every rule that behaved the same on both sides, in a diff
— and the per-rule `signature` strings, each a whole selector array
re-serialized next to the `label` that already names the rule. `--detail rules`
restores the arrays, `--detail full` the comparison exactly as the engine
computes it. Every level carries the same `summary`/`verdict`/`netEffect`.

One note-shaped field, not five: each aggregate keeps its own `note` inside its
object (`missingInputs.note`, `evaluationErrors.note`, `flattened.note`), and
every pointer about the answer itself — the detail level, the rule filter, the
`ruleSources` legend, the per-side input gaps on `compare` — is an entry in the
single top-level `notes` array.

One more shape both commands share: `description` is a mergeable array, so
Renovate concatenates it on nearly every merge, and a merged diff used to
re-embed all of it on both sides. An append is now stated as what it appended
(`{"collapsed": "append", "beforeLength": 22, "afterLength": 24, "added": […]}`)
— a replacement still shows both sides, and the full array is one
`rcd provenance renovate.json description` away.

</details>

## Exit codes

| code | meaning                                                             |
| ---- | ------------------------------------------------------------------- |
| `0`  | clean, Renovate accepted the config                                 |
| `2`  | Renovate would refuse this config (validation or parse failure)     |
| `1`  | infrastructure error: bad flag, unreadable file, unfetchable preset |

`2` is deliberate. Claude Code hooks read exit 2 as the blocking "feed stderr
back to the model and fix it" signal, so `rcd validate` drops into a
Stop/PreToolUse hook with no wrapper around it.

## Credentials

Tokens come from the environment only, never from a flag, where they would land
in shell history and in every process listing:

| variable                                       | host    |
| ---------------------------------------------- | ------- |
| `RCD_GITHUB_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN` | GitHub  |
| `RCD_GITLAB_TOKEN`, `GITLAB_TOKEN`             | GitLab  |
| `RCD_GITEA_TOKEN`                              | Gitea   |
| `RCD_FORGEJO_TOKEN`                            | Forgejo |

The `npm` and `http` preset fetchers have no auth at all, the same coverage and
the same gaps as the web app.

A preset fetcher sends a host's token to whatever endpoint the platform context
resolves to, and a `--global-config` sets that context. So when the config under
inspection chooses the endpoint, the CLI withholds tokens and says so on stderr.
`--platform-override` and `--trust-endpoints` are the two ways out.

## MCP server

`rcd mcp` speaks MCP over stdio. It takes no arguments and writes nothing but
the protocol to stdout, so point any MCP-capable client at it as a stdio server.
It speaks the 2026-07-28 protocol and the legacy 2025-era `initialize`
handshake, chosen per connection.

### Adding it to an agent

The command is `npx -y @renovate-config-debugger/cli mcp` everywhere, or `rcd
mcp` if the package is installed globally. Claude Code and Codex write the
config for you:

```console
$ claude mcp add rcd -- npx -y @renovate-config-debugger/cli mcp
$ codex mcp add rcd -- npx -y @renovate-config-debugger/cli mcp
```

Everywhere else it is a config file. Most of them take the same JSON:

```json
{
  "mcpServers": {
    "rcd": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@renovate-config-debugger/cli", "mcp"]
    }
  }
}
```

| harness              | file                                                 | key           |
| -------------------- | ---------------------------------------------------- | ------------- |
| Claude Code          | `.mcp.json`, or `~/.claude.json` for user scope      | `mcpServers`  |
| Cursor               | `.cursor/mcp.json` or `~/.cursor/mcp.json`           | `mcpServers`  |
| Gemini CLI           | `.gemini/settings.json` or `~/.gemini/settings.json` | `mcpServers`  |
| VS Code with Copilot | `.vscode/mcp.json`                                   | `servers`     |
| Codex                | `.codex/config.toml` or `~/.codex/config.toml`       | `mcp_servers` |

## Compatibility

Every release states the Renovate it carries. The engine and its `renovate`
graph are inlined at build time, so a given CLI version always answers with
exactly this Renovate and nothing resolves at install time. `rcd --version`
prints both, and every published version states the same facts in a
`renovateCompatibility` manifest field, keyed by full package name:

```console
$ pnpm view @renovate-config-debugger/cli renovateCompatibility
```

<!-- compat-table -->

<!-- _The table is rendered into this spot when a release is published — the README
on [npm](https://www.npmjs.com/package/@renovate-config-debugger/cli) carries
it. Its rows are read back from the registry's own record of published
versions, so it cannot disagree with what npm actually has._ -->

<!-- /compat-table -->

A new row is not a promise that the previous row's flags still work.
`scripts/stamp-compat.ts` writes the field and the table while publishing, and
`scripts/check-compat.ts` fails the build when a stamped claim stops describing
it — no hand writes either, and nothing is committed, so nothing can go stale.

## License

[AGPL-3.0-only](https://github.com/secustor/renovate-config-debugger/blob/main/LICENSE),
like the rest of this project.
