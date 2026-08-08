import { renovateVersion } from "@renovate-config-debugger/engine";
import pkg from "../package.json";
import { optionHelp, type OptionName, parseCommandArgs } from "./args";
import type { Command } from "./command";
import { compareCommand } from "./commands/compare";
import { digestCommand } from "./commands/digest";
import { docsCommand } from "./commands/docs";
import { provenanceCommand } from "./commands/provenance";
import { resolvedCommand } from "./commands/resolved";
import { runCommand } from "./commands/run";
import { simulateCommand } from "./commands/simulate";
import { treeCommand } from "./commands/tree";
import { validateCommand } from "./commands/validate";
import { CliError, type CliIo, errorMessage, EXIT_ERROR, EXIT_OK } from "./io";

/**
 * `rcv` — the Renovate config debugger, headless.
 *
 * EXPERIMENTAL: subcommands, flags and output shapes may change. Only the
 * engine's trace semantics underneath (proven by the golden↔shimmed parity
 * suite) are stable.
 *
 * This module runs INSIDE the shimmed module graph — see `src/io.ts` for why
 * the process (argv, env, stdio) arrives as an argument instead of being read
 * from globals.
 */

const COMMANDS: readonly Command[] = [
  validateCommand,
  digestCommand,
  runCommand,
  treeCommand,
  provenanceCommand,
  resolvedCommand,
  simulateCommand,
  compareCommand,
  docsCommand,
];

const BANNER = [
  `rcv ${pkg.version} — Renovate config debugger (Renovate ${renovateVersion})`,
  "EXPERIMENTAL: subcommands, flags and output shapes may change in any release.",
];

function topLevelHelp(): string[] {
  return [
    ...BANNER,
    "",
    "Usage: rcv <command> [file] [options]",
    "",
    "Commands:",
    ...COMMANDS.map((c) => `  ${c.name.padEnd(11)} ${c.summary}`),
    "",
    "Input: a file path, `--stdin`, or `--repo <owner/repo>`.",
    "Output: `--format pretty` (default) or `--format json` on every command.",
    "Exit codes: 0 = clean, 2 = Renovate would refuse the config, 1 = the run failed.",
    "",
    "Credentials come from the environment only — RCV_GITHUB_TOKEN (or GITHUB_TOKEN /",
    "GH_TOKEN), RCV_GITLAB_TOKEN (or GITLAB_TOKEN), RCV_GITEA_TOKEN, RCV_FORGEJO_TOKEN.",
    "They are withheld when the config under inspection chooses the endpoint.",
    "",
    "`rcv <command> --help` for a command's own flags.",
  ];
}

function commandHelp(command: Command): string[] {
  return [
    ...BANNER,
    "",
    ...command.usage.map((line, i) => `${i === 0 ? "Usage: rcv " : "       rcv "}${line}`),
    "",
    command.summary,
    ...(command.details ? ["", ...command.details] : []),
    "",
    "Options:",
    ...optionHelp(command.options as readonly OptionName[]),
  ];
}

async function dispatch(argv: string[], io: CliIo): Promise<number> {
  const [name, ...rest] = argv;
  if (!name || name === "--help" || name === "-h" || name === "help") {
    io.out(`${topLevelHelp().join("\n")}\n`);
    return EXIT_OK;
  }
  if (name === "--version" || name === "-v") {
    io.out(`rcv ${pkg.version} (renovate ${renovateVersion})\n`);
    return EXIT_OK;
  }
  const command = COMMANDS.find((c) => c.name === name);
  if (!command) {
    throw new CliError(
      `unknown command "${name}" — try one of: ${COMMANDS.map((c) => c.name).join(", ")}`,
    );
  }
  if (rest.includes("--help") || rest.includes("-h")) {
    io.out(`${commandHelp(command).join("\n")}\n`);
    return EXIT_OK;
  }
  return command.run(parseCommandArgs(rest, command.options), io);
}

/** The whole CLI as one function: argv in, exit code out, everything written
 *  through `io`. The bin is the only thing that touches the process. */
export async function main(argv: string[], io: CliIo): Promise<number> {
  try {
    return await dispatch(argv, io);
  } catch (err) {
    io.err(`rcv: ${errorMessage(err)}\n`);
    return err instanceof CliError ? err.exitCode : EXIT_ERROR;
  }
}
