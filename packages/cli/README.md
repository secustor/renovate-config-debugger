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

| command      | question it answers                                   |
| ------------ | ----------------------------------------------------- |
| `digest`     | what happened in this run, in one paragraph           |
| `validate`   | would Renovate refuse this config? (exit `2` if so)   |
| `tree`       | which presets did the config pull in                  |
| `provenance` | which preset set this option                          |
| `resolved`   | the merged config Renovate would run with             |
| `simulate`   | which `packageRules` match a hypothetical dependency  |
| `compare`    | did an edit change behavior                           |
| `run`        | the whole trace                                       |
| `docs`       | what an option means, for the Renovate version pinned |
| `mcp`        | all of the above over MCP stdio                       |

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

| command    | flag                         | effect                                                                     |
| ---------- | ---------------------------- | -------------------------------------------------------------------------- |
| `tree`     | `--node <name>`              | one preset node, by name or identity                                       |
|            | `--body <which>`             | `fetched\|afterParams\|input\|resolved` (needs `--node`)                   |
|            | `--depth <n\|all>`           | tree depth to print (default `2`)                                          |
| `resolved` | `--mode <m>`                 | `full\|keep-internal` (default `keep-internal`)                            |
|            | `--include-defaults`         | write out Renovate's defaults too (`--mode full` only)                     |
| `simulate` | `--dep <json>`, `--dep-file` | the dependency update to simulate                                          |
|            | `--verdict <which>`          | `notable\|all\|matched\|no-input\|no-match` (pretty `notable`, JSON `all`) |
|            | `--source <which>`           | which config level contributed the rule: `repo\|presets\|all`              |
| `compare`  | `--dep`/`--dep-file`         | the A-side dependency                                                      |
|            | `--dep-b`/`--dep-b-file`     | the B-side dependency                                                      |
| `run`      | `--select <a,b,…>`           | `status\|errors\|warnings\|final\|events\|tree\|layers\|platform\|all`     |
| `docs`     | `--search`                   | list options whose name matches                                            |

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
1 of 2 packageRules matched.

  #2 matched (matchUpdateTypes=matched)
      sets dependencyDashboardApproval = true
1 of 2 rule hidden by --verdict notable — `--verdict all --source all` shows every rule.
```

Rule #1 is the missing one. `--verdict no-match` prints the clause that rejected
it:

```console
$ rcd simulate renovate.json --dep '{"depName":"@types/react","updateType":"major"}' --verdict no-match
  #1 no-match (matchPackageNames=no-match)
```

So `matchPackageNames` is the culprit, not the update type. Add `@types/react`
to that list, keep the original as `before.json`, and use `compare` as the oracle
for the edit. On the dependency you were fixing it should report exactly the
change you wanted:

```console
$ rcd compare before.json after.json --dep '{"depName":"@types/react","updateType":"major"}'
Behavior differs between A and B — minimumReleaseAge.

Matched only in B:
  matchPackageNames

Config delta:
  minimumReleaseAge: null → "7 days"
```

And on a dependency that already worked, nothing:

```console
$ rcd compare before.json after.json --dep '{"depName":"react","updateType":"major"}'
✓ No behavioral change — the same effective config results (a rule's pattern text changed), which is expected when you edit the array the rule matches on.

Selector text changed, same effect (rule identity, not behavior):
  matchPackageNames  #1 → #1
```

That second run is the point of the two axes. Behavior is the citable claim, the
per-dependency config is identical and no rule started or stopped doing
something. Rule identity goes true on edits that provably change nothing, because
adding an entry to the array a rule matches on rewrites that rule's selector
text.

A few things to know when you write your own `--dep`. The two name
fields are cross-defaulted the way Renovate's fetch worker does before
`packageRules` run (`dep.packageName ??= dep.depName`), so
`--dep '{"depName":"react"}'` matches a `matchPackageNames` rule instead of
falling through, and the run's notes say when a field was defaulted. A clause
reads `no-input` when the field it matches on was absent from your `--dep`, which
is a different failure from `no-match`. And if either input config would be
refused by Renovate, both commands exit `2`, which says nothing about the
simulation itself, so they also say so on their own output (`exitNote` in JSON, a
trailing `note:` line in pretty).

On a `config:best-practices` run the rule list runs to several hundred, which is
what `--verdict` and `--source` are for. A filtered list always ends by saying
how many rules it hid. `--format json` keeps the full `rules` array unless you
pass one of those two flags, and adds a `ruleFilter` object with
`total`/`shown`/`hidden` when you do.

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
exactly this Renovate and nothing resolves at install time.

<!-- compat-table -->

| `cli` | embedded `engine` | `renovate` |
| ----- | ----------------- | ---------- |
| 0.1.0 | 0.1.0             | 44.29.1    |

A new row is not a promise that the previous row's flags still work. Releases
write the rows (`scripts/stamp-compat.ts`), and `scripts/check-compat.ts` fails
the build once the top one stops describing it, so the table cannot go stale.

## License

[AGPL-3.0-only](https://github.com/secustor/renovate-config-visualizer/blob/main/LICENSE),
like the rest of this project.
