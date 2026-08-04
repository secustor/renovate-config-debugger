import { parseArgs } from "node:util";
import { CliError } from "./io";

/**
 * Argument parsing on top of `node:util`'s `parseArgs` — no dependency, and
 * the flag grammar (`--flag value`, `--flag=value`, `--`) is the one every
 * Node CLI already has.
 *
 * Each subcommand declares the option NAMES it accepts and their types are
 * looked up in the one table below, so a flag means the same thing everywhere
 * and `rcv digest --dep …` is an error rather than a silently ignored flag.
 */

interface OptionSpec {
  type: "string" | "boolean";
  multiple?: boolean;
  /** Rendered in `--help`; `<value>` placeholders included. */
  help: string;
}

export const OPTIONS = {
  format: { type: "string", help: "--format <pretty|json>   output shape (default: pretty)" },
  help: { type: "boolean", help: "--help                   this text" },
  stdin: { type: "boolean", help: "--stdin                  read the config from stdin" },
  "file-name": {
    type: "string",
    help: "--file-name <name>       config file name, drives format detection (default: renovate.json)",
  },
  repo: {
    type: "string",
    help: "--repo <owner/repo>      load the config from a repository instead of a file",
  },
  ref: { type: "string", help: "--ref <ref>              git ref for --repo" },
  platform: {
    type: "string",
    help: "--platform <name>        platform context for `local>` presets (default: github)",
  },
  endpoint: { type: "string", help: "--endpoint <url>         API endpoint for the platform" },
  "platform-override": {
    type: "boolean",
    help: "--platform-override      let --platform/--endpoint win over the global config",
  },
  "global-config": {
    type: "string",
    help: "--global-config <file>   self-hosted global config layer (JSON)",
  },
  inherited: {
    type: "string",
    help: "--inherited <file>       inherited config layer (JSON)",
  },
  inject: {
    type: "string",
    multiple: true,
    help: "--inject <preset>=<file> supply content for an unreachable preset (repeatable)",
  },
  "trust-endpoints": {
    type: "boolean",
    help: "--trust-endpoints        send host tokens even to an endpoint the config chose",
  },
  select: {
    type: "string",
    help: "--select <a,b,…>         status|errors|warnings|final|events|tree|layers|platform|all",
  },
  node: { type: "string", help: "--node <name>            one preset node, by name or identity" },
  body: {
    type: "string",
    help: "--body <which>           fetched|afterParams|input|resolved (needs --node)",
  },
  depth: { type: "string", help: "--depth <n|all>          tree depth to print (default: 2)" },
  mode: {
    type: "string",
    help: "--mode <m>               full|keep-internal (default: keep-internal)",
  },
  "include-defaults": {
    type: "boolean",
    help: "--include-defaults       write out Renovate's defaults too (--mode full only)",
  },
  dep: { type: "string", help: "--dep <json>             the dependency update to simulate" },
  "dep-file": { type: "string", help: "--dep-file <file>        --dep, read from a file" },
  "dep-b": { type: "string", help: "--dep-b <json>           the B-side dependency to compare" },
  "dep-b-file": { type: "string", help: "--dep-b-file <file>      --dep-b, read from a file" },
  search: { type: "boolean", help: "--search                 list options whose name matches" },
} as const satisfies Record<string, OptionSpec>;

export type OptionName = keyof typeof OPTIONS;

export interface ParsedArgs {
  values: Partial<Record<OptionName, string | boolean | string[]>>;
  positionals: string[];
}

export function optionHelp(names: readonly OptionName[]): string[] {
  return names.map((name) => `  ${OPTIONS[name].help}`);
}

/** Parses `argv` against the option names a subcommand accepts. */
export function parseCommandArgs(argv: string[], names: readonly OptionName[]): ParsedArgs {
  const options: Record<string, { type: "string" | "boolean"; multiple?: boolean }> = {};
  for (const name of names) {
    const spec: OptionSpec = OPTIONS[name];
    options[name] = spec.multiple ? { type: spec.type, multiple: true } : { type: spec.type };
  }
  try {
    const parsed = parseArgs({ args: argv, options, allowPositionals: true, strict: true });
    return { values: parsed.values as ParsedArgs["values"], positionals: parsed.positionals };
  } catch (err) {
    throw new CliError(err instanceof Error ? err.message : String(err));
  }
}

export function stringOption(args: ParsedArgs, name: OptionName): string | undefined {
  const value = args.values[name];
  return typeof value === "string" ? value : undefined;
}

export function boolOption(args: ParsedArgs, name: OptionName): boolean {
  return args.values[name] === true;
}

export function listOption(args: ParsedArgs, name: OptionName): string[] {
  const value = args.values[name];
  return Array.isArray(value) ? value : [];
}

export type OutputFormat = "pretty" | "json";

export function outputFormat(args: ParsedArgs): OutputFormat {
  const raw = stringOption(args, "format") ?? "pretty";
  if (raw !== "pretty" && raw !== "json") {
    throw new CliError(`--format must be "pretty" or "json" (got "${raw}")`);
  }
  return raw;
}
