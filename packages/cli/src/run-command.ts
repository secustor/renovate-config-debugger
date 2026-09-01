import type { PipelineInput, TraceResult } from "@renovate-config-debugger/engine";
import type { OptionName, OutputFormat, ParsedArgs } from "./args";
import { outputFormat } from "./args";
import type { Command } from "./command";
import { EXIT_OK, EXIT_REFUSED, type CliIo } from "./io";
import { writeNotes } from "./output";
import { runFromArgs, wouldRefuse } from "./run-input";

/**
 * The shape every config-consuming subcommand has: read the flags, resolve ONE
 * config, write the run's diagnostics to stderr, answer on stdout, and exit on
 * the verdict — `2` when Renovate would refuse the config, `0` otherwise.
 *
 * The exit rule is the point. It was hand-written at nine return sites (four in
 * `provenance.ts` alone), which is nine chances for a command to answer a
 * question correctly and then report the wrong thing to a hook. `rcd compare`
 * deliberately opts out and stays a plain {@link Command}: its exit code
 * reports whether the COMPARISON ran, not whether an input would be refused
 * (roadmap 062, replay-04). `rcd docs`, `rcd mcp` and `rcd extract` opt out
 * because they never resolve a config; `extract` then owns its own verdict —
 * exit `1` when no manager section produced dependencies, which a refusal `2`
 * would misreport.
 *
 * Only the run/exit shape lives here. Help text, flags and every string of the
 * answer stay in the command that owns them.
 */

export interface RunCommandContext<Prepared> {
  args: ParsedArgs;
  io: CliIo;
  format: OutputFormat;
  /** Whatever {@link RunCommandSpec.prepare} returned. */
  prepared: Prepared;
  result: TraceResult;
  /** The input the run was built from — the config text a message cites. */
  input: PipelineInput;
  /** Positionals left after the config file was taken. */
  rest: string[];
}

export interface RunCommandSpec<Prepared> {
  name: string;
  summary: string;
  usage: string[];
  details?: string[];
  options: readonly OptionName[];
  /**
   * Flags parsed and validated BEFORE the run. Deliberately its own phase: a
   * rejected flag must not cost a pipeline run (and its remote preset
   * fetches) first, and several commands read a file of their own here.
   */
  prepare?(args: ParsedArgs, io: CliIo): Prepared | Promise<Prepared>;
  /** Writes the answer. The exit code is not its business. */
  answer(context: RunCommandContext<Prepared>): void | Promise<void>;
}

export function defineRunCommand<Prepared = undefined>(spec: RunCommandSpec<Prepared>): Command {
  return {
    name: spec.name,
    summary: spec.summary,
    usage: spec.usage,
    ...(spec.details ? { details: spec.details } : {}),
    options: spec.options,
    async run(args, io) {
      // First, and before any work: `--format` is the one flag that decides
      // how everything below is written, so a bad value is a bad value now.
      const format = outputFormat(args);
      // A command with no flags of its own prepares nothing — the cast names
      // that case, which the type parameter's `undefined` default declares.
      const prepared = (await spec.prepare?.(args, io)) as Prepared;
      const { result, input, rest, notes } = await runFromArgs(args, io);
      writeNotes(io, notes);
      await spec.answer({ args, io, format, prepared, result, input, rest });
      return wouldRefuse(result) ? EXIT_REFUSED : EXIT_OK;
    },
  };
}
