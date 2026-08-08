import { Command as CommanderCommand, CommanderError } from "commander";
import { renovateVersion } from "@renovate-config-debugger/engine";
import pkg from "../package.json";
import { addOptions, collectArgs } from "./args";
import type { Command } from "./command";
import { compareCommand } from "./commands/compare";
import { digestCommand } from "./commands/digest";
import { docsCommand } from "./commands/docs";
import { mcpCommand } from "./commands/mcp";
import { provenanceCommand } from "./commands/provenance";
import { resolvedCommand } from "./commands/resolved";
import { runCommand } from "./commands/run";
import { simulateCommand } from "./commands/simulate";
import { treeCommand } from "./commands/tree";
import { validateCommand } from "./commands/validate";
import { emitPluginHint } from "./hint";
import { CliError, type CliIo, errorMessage, EXIT_ERROR, EXIT_OK } from "./io";

/**
 * `rcd` — the Renovate config debugger, headless.
 *
 * EXPERIMENTAL: subcommands, flags and output shapes may change. Only the
 * engine's trace semantics underneath (proven by the golden↔shimmed parity
 * suite) are stable.
 *
 * This module runs INSIDE the shimmed module graph — see `src/io.ts` for why
 * the process (argv, env, stdio) arrives as an argument instead of being read
 * from globals. Commander is therefore configured to write through `io` and to
 * throw instead of calling `process.exit`: nothing under `src/` touches a
 * process global, including the parser.
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
  mcpCommand,
];

const BANNER = [
  `rcd ${pkg.version} — Renovate config debugger (Renovate ${renovateVersion})`,
  "EXPERIMENTAL: subcommands, flags and output shapes may change in any release.",
];

const TOP_LEVEL_NOTES = [
  "Input: a file path, `--stdin`, or `--repo <owner/repo>`.",
  "Output: `--format pretty` (default) or `--format json` on every command.",
  "Exit codes: 0 = clean, 2 = Renovate would refuse the config, 1 = the run failed.",
  "",
  "Credentials come from the environment only — RCD_GITHUB_TOKEN (or GITHUB_TOKEN /",
  "GH_TOKEN), RCD_GITLAB_TOKEN (or GITLAB_TOKEN), RCD_GITEA_TOKEN, RCD_FORGEJO_TOKEN.",
  "They are withheld when the config under inspection chooses the endpoint.",
  "",
  "`rcd <command> --help` for a command's own flags.",
  "",
  "In an MCP-capable client, register the server once and skip the flags entirely:",
  "  claude mcp add rcd -- pnpm dlx @renovate-config-debugger/cli mcp",
];

/**
 * Help is written through `io` like everything else, so its width cannot come
 * from a terminal the CLI is not allowed to look at.
 */
const HELP_WIDTH = 100;

/** `tree [file] [--depth <n|all>]` → what follows `Usage: rcd tree `. */
function usageArguments(command: Command): string {
  const first = command.usage[0] ?? command.name;
  return first.startsWith(`${command.name} `) ? first.slice(command.name.length + 1) : "[options]";
}

/**
 * A subcommand's exit code is its answer, so the action handler hands it back
 * through this sink: commander awaits the handler but discards what it
 * returns.
 */
type ExitSink = (code: number) => void;

function subcommandOf(
  program: CommanderCommand,
  command: Command,
  io: CliIo,
  report: ExitSink,
): CommanderCommand {
  const sub = program
    .command(command.name)
    .summary(command.summary)
    .description([command.summary, ...(command.details ?? [])].join("\n"))
    .usage(usageArguments(command))
    // Named in the usage line above rather than in an `Arguments:` section:
    // what a positional means differs per subcommand (`[file] [key]`,
    // `<before.json> <after.json>`), and commander hides the section when no
    // argument carries a description of its own.
    .argument("[args...]");
  addOptions(sub, command.options);
  if (command.usage.length > 1) {
    sub.addHelpText(
      "after",
      ["", "Other forms:", ...command.usage.slice(1).map((line) => `  rcd ${line}`)].join("\n"),
    );
  }
  sub.action(async (positionals: string[], _options: unknown, self: CommanderCommand) => {
    report(await command.run(collectArgs(self.opts(), positionals, command.options), io));
  });
  return sub;
}

/**
 * The whole CLI surface as one commander program. Rebuilt per call because the
 * `io` it writes through is a per-call argument, not a global.
 */
function buildProgram(io: CliIo, report: ExitSink): CommanderCommand {
  const program = new CommanderCommand("rcd")
    .exitOverride()
    .configureOutput({
      writeOut: (text) => io.out(text),
      writeErr: (text) => io.err(text),
      outputError: (text, write) => write(`rcd: ${text}`),
      getOutHelpWidth: () => HELP_WIDTH,
      getErrHelpWidth: () => HELP_WIDTH,
      getOutHasColors: () => false,
      getErrHasColors: () => false,
    })
    // Every subcommand takes the same `[options] [args...]`, so spelling that
    // out nine times in the command list says nothing; the name and the
    // summary are the index, `rcd <command> --help` is the detail.
    .configureHelp({ subcommandTerm: (cmd) => cmd.name() })
    .showHelpAfterError("(`rcd --help`, or `rcd <command> --help`, lists what is accepted)")
    .usage("<command> [file] [options]")
    .version(
      `rcd ${pkg.version} (renovate ${renovateVersion})`,
      "-v, --version",
      "the rcd version and the Renovate it pins",
    )
    .addHelpText("beforeAll", [...BANNER, ""].join("\n"))
    .addHelpText("after", ["", ...TOP_LEVEL_NOTES].join("\n"));
  for (const command of COMMANDS) {
    subcommandOf(program, command, io, report);
  }
  return program;
}

async function dispatch(argv: readonly string[], io: CliIo): Promise<number> {
  let exitCode = EXIT_OK;
  const program = buildProgram(io, (code) => {
    exitCode = code;
  });
  // Roadmap 060: the moments the plugin hint is worth emitting — help, a
  // wrong guess at a subcommand, and a run itself. It is stderr-only, once
  // per process, and only inside Claude Code (see `hint.ts`); `--version`
  // answers without it.
  if (!(argv[0] === "--version" || argv[0] === "-v")) {
    emitPluginHint(io);
  }
  if (argv.length === 0) {
    // Commander would write the help to stderr and exit 1; bare `rcd` asking
    // what `rcd` is has always been a successful question.
    program.outputHelp();
    return EXIT_OK;
  }
  await program.parseAsync([...argv], { from: "user" });
  return exitCode;
}

/** The whole CLI as one function: argv in, exit code out, everything written
 *  through `io`. The bin is the only thing that touches the process. */
export async function main(argv: string[], io: CliIo): Promise<number> {
  try {
    return await dispatch(argv, io);
  } catch (err) {
    if (err instanceof CommanderError) {
      // `--help`, `--version` and every parse failure have already written
      // their text through `io`; commander's own exit code is the answer.
      return err.exitCode;
    }
    io.err(`rcd: ${errorMessage(err)}\n`);
    return err instanceof CliError ? err.exitCode : EXIT_ERROR;
  }
}
