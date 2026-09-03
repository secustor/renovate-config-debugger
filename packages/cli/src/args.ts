import { isBoolean, isString } from "@renovate-config-debugger/engine/is";
import { Command as CommanderCommand, CommanderError } from "commander";
import { CliError } from "./io";

/**
 * The option vocabulary. Commander does the parsing (`main.ts` builds one
 * program out of this table and the `Command` registry); this module owns the
 * names, their flag grammar, their help text and the readers the subcommands
 * use.
 *
 * Each subcommand declares the option NAMES it accepts and they are looked up
 * in the one table below, so a flag means the same thing everywhere, its
 * description has a single source, and `rcd digest --dep …` is an error rather
 * than a silently ignored flag.
 */

interface OptionSpec {
  /** Commander flag string, `<value>` placeholder included. */
  flags: string;
  /** Rendered in `--help`. */
  description: string;
  /** Repeatable: every occurrence is collected into a list. */
  multiple?: boolean;
}

export const OPTIONS = {
  format: { flags: "--format <pretty|json>", description: "output shape (default: pretty)" },
  stdin: { flags: "--stdin", description: "read the config from stdin" },
  "file-name": {
    flags: "--file-name <name>",
    description: "config file name, drives format detection (default: renovate.json)",
  },
  repo: {
    flags: "--repo <owner/repo>",
    description: "load the config from a repository instead of a file",
  },
  ref: { flags: "--ref <ref>", description: "git ref for --repo" },
  platform: {
    flags: "--platform <name>",
    description: "platform context for `local>` presets (default: github)",
  },
  endpoint: { flags: "--endpoint <url>", description: "API endpoint for the platform" },
  "platform-override": {
    flags: "--platform-override",
    description: "let --platform/--endpoint win over the global config",
  },
  "global-config": {
    flags: "--global-config <file>",
    description: "self-hosted global config layer (JSON)",
  },
  inherited: {
    flags: "--inherited <file>",
    description: "inherited config layer (JSON)",
  },
  inject: {
    flags: "--inject <preset>=<file>",
    multiple: true,
    description: "supply content for an unreachable preset (repeatable)",
  },
  "trust-endpoints": {
    flags: "--trust-endpoints",
    description: "send host tokens even to an endpoint the config chose",
  },
  select: {
    flags: "--select <a,b,…>",
    description: "status|errors|warnings|final|events|tree|layers|platform|all",
  },
  node: { flags: "--node <name>", description: "one preset node, by name or identity" },
  body: {
    flags: "--body <which>",
    description: "fetched|afterParams|input|resolved (needs --node)",
  },
  depth: { flags: "--depth <n|all>", description: "tree depth to print (default: 2)" },
  mode: {
    flags: "--mode <m>",
    description: "full|keep-internal (default: keep-internal)",
  },
  "include-defaults": {
    flags: "--include-defaults",
    description: "write out Renovate's defaults too (--mode full only)",
  },
  dep: {
    flags: "--dep <json>",
    multiple: true,
    description:
      'the dependency update to simulate, e.g. \'{"depName":"react","currentValue":"17.0.0",' +
      '"newValue":"18.0.0"}\' — packageName defaults to depName, as in a real run. ' +
      "`group` takes it repeatedly, one per pending update",
  },
  "dep-file": { flags: "--dep-file <file>", description: "--dep, read from a file" },
  "deps-file": {
    flags: "--deps-file <file>",
    description:
      "a JSON array of `--dep` objects — `group`'s batch input. Strict JSON: the inline " +
      "forms take JSON5, a batch FILE does not",
  },
  "dep-b": { flags: "--dep-b <json>", description: "the B-side dependency to compare" },
  "dep-b-file": { flags: "--dep-b-file <file>", description: "--dep-b, read from a file" },
  search: { flags: "--search", description: "list options whose name matches" },
  verdict: {
    flags: "--verdict <which>",
    description:
      "which rule verdicts to answer with: notable|all|matched|no-input|no-match|error " +
      "(default: notable — matched, not-simulated and the rules the tool could not " +
      "evaluate). The missing-input and evaluation-error summaries are reported " +
      "whatever you pass",
  },
  source: {
    flags: "--source <which>",
    description: "which config level contributed the rule: repo|presets|all (default: all)",
  },
  rule: {
    flags: "--rule <n>",
    description:
      "one merged packageRule by zero-based index — the `#N` the output prints — " +
      "whatever the other facets hide: its row (`simulate`) or its body " +
      "(`provenance <file> packageRules`), with the layer that wrote it and its " +
      "index inside that layer",
  },
  detail: {
    flags: "--detail <which>",
    description:
      "how much to answer with: `simulate` verdict|full (`full` adds the merge trace — " +
      "mergeSteps, rawFinalConfig); `compare` verdict|rules|full (`rules` restores the " +
      "rule and identity arrays) (default: verdict)",
  },
  keys: {
    flags: "--keys <a,b,…>",
    description: "only these top-level config options (narrows, never widens)",
  },
  "config-scope": {
    flags: "--config-scope <which>",
    description:
      "which config keys to report: package-rules (drop the globalOnly options a rule " +
      "cannot reach) | full",
  },
  manager: {
    flags: "--manager <name>",
    description:
      "force this manager, instead of matching by filename — the only door for a " +
      "pattern-less manager, and how to pick among several that claim one filename",
  },
} as const satisfies Record<string, OptionSpec>;

export type OptionName = keyof typeof OPTIONS;

/**
 * What a subcommand's `run` reads. Deliberately NOT commander's own option
 * object: the keys are the flag names as written (`file-name`, not
 * `fileName`), so the readers below and the error messages that quote them
 * stay one string away from the flag the user typed.
 */
export interface ParsedArgs {
  values: Partial<Record<OptionName, string | boolean | string[]>>;
  positionals: string[];
}

/** Commander stores `--file-name` under `fileName`. */
function attributeName(name: OptionName): string {
  return name.replaceAll(/-(.)/g, (_match, char: string) => char.toUpperCase());
}

/** Declares the options a subcommand accepts on a commander command. */
export function addOptions(
  target: CommanderCommand,
  names: readonly OptionName[],
): CommanderCommand {
  for (const name of names) {
    const spec: OptionSpec = OPTIONS[name];
    if (spec.multiple) {
      // No `[]` default: commander would print it as "(default: [])", and an
      // absent repeatable option reads as the empty list anyway.
      target.option(spec.flags, spec.description, (value: string, previous?: string[]) => [
        ...(previous ?? []),
        value,
      ]);
    } else {
      target.option(spec.flags, spec.description);
    }
  }
  return target;
}

/** Commander's parsed options and operands, narrowed back to the registry. */
export function collectArgs(
  options: Record<string, unknown>,
  positionals: readonly string[],
  names: readonly OptionName[],
): ParsedArgs {
  const values: ParsedArgs["values"] = {};
  for (const name of names) {
    const value = options[attributeName(name)];
    if (isString(value) || isBoolean(value)) {
      values[name] = value;
    } else if (Array.isArray(value)) {
      values[name] = value as string[];
    }
  }
  return { values, positionals: [...positionals] };
}

/**
 * Parses `argv` against the option names a subcommand accepts, standalone —
 * the same grammar `main.ts` gets from the program it builds, without the
 * program. Used by the tests, and the one place that turns a commander parse
 * failure into a {@link CliError}.
 */
export function parseCommandArgs(
  argv: readonly string[],
  names: readonly OptionName[],
): ParsedArgs {
  const parser = new CommanderCommand("rcd").exitOverride().helpOption(false).helpCommand(false);
  parser.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  addOptions(parser, names).arguments("[args...]");
  try {
    parser.parse([...argv], { from: "user" });
  } catch (err) {
    throw new CliError(err instanceof CommanderError ? err.message : String(err));
  }
  return collectArgs(parser.opts(), parser.args, names);
}

export function stringOption(args: ParsedArgs, name: OptionName): string | undefined {
  const value = args.values[name];
  return isString(value) ? value : undefined;
}

export function boolOption(args: ParsedArgs, name: OptionName): boolean {
  return args.values[name] === true;
}

export function listOption(args: ParsedArgs, name: OptionName): string[] {
  const value = args.values[name];
  return Array.isArray(value) ? value : [];
}

/**
 * One value out of a fixed vocabulary, or `undefined` when the flag was not
 * passed — the caller applies its own default with `??`, so "not given" and
 * "given wrong" stay different answers.
 *
 * `label` is how the message names the input, because the same vocabularies are
 * read from a flag (`--detail`) and from an MCP parameter (`body`): quoting a
 * flag at an agent that cannot pass one is worse than saying nothing.
 */
export function parseChoice<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  label: string,
): T | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const found = allowed.find((value) => value === raw);
  if (!found) {
    throw new CliError(`${label} must be one of ${allowed.join("|")} (got "${raw}")`);
  }
  return found;
}

/** What an integer option accepts beyond "an integer no smaller than min". */
interface IntOptionSpec {
  /** Smallest accepted value; the message says so in words. */
  min: number;
  /** A non-numeric spelling the flag also takes, e.g. `"all"` for `--depth`.
   *  Named in the message, because a value the flag accepts and the error does
   *  not mention is a feature nobody finds. */
  or?: string;
}

/**
 * `--rule 3`, `--depth 2`: the value as an integer, or `undefined` when the
 * flag was not passed. A non-integer is an error rather than a `NaN` that
 * would silently behave like "no filter at all".
 */
export function intOption(
  args: ParsedArgs,
  name: OptionName,
  spec: IntOptionSpec,
): number | undefined {
  const raw = stringOption(args, name);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < spec.min) {
    const bound = spec.min === 0 ? "a non-negative integer" : `an integer >= ${spec.min}`;
    throw new CliError(
      `--${name} must be ${bound}${spec.or ? ` or ${spec.or}` : ""} (got "${raw}")`,
    );
  }
  return value;
}

/** {@link parseChoice} against an option, named as the user typed it. */
export function choiceOption<T extends string>(
  args: ParsedArgs,
  name: OptionName,
  allowed: readonly T[],
): T | undefined {
  return parseChoice(stringOption(args, name), allowed, `--${name}`);
}

export type OutputFormat = "pretty" | "json";

export function outputFormat(args: ParsedArgs): OutputFormat {
  const raw = stringOption(args, "format") ?? "pretty";
  if (raw !== "pretty" && raw !== "json") {
    throw new CliError(`--format must be "pretty" or "json" (got "${raw}")`);
  }
  return raw;
}
