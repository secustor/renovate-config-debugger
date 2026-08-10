import type { OptionName, ParsedArgs } from "./args";
import type { CliIo } from "./io";

/**
 * One subcommand = one question an agent asks. The verbs mirror the web app's
 * tabs rather than the engine's functions: `--help` is an agent's primary
 * discovery surface, and the projections differ in output shape, defaults and
 * arguments, so separate verbs beat one command with many flags.
 */
export interface Command {
  name: string;
  /** One line, listed by `rcd --help`. */
  summary: string;
  /** Usage lines shown by `rcd <name> --help`, without the leading `rcd `. */
  usage: string[];
  /** Longer explanation for `rcd <name> --help`. */
  details?: string[];
  options: readonly OptionName[];
  run(args: ParsedArgs, io: CliIo): Promise<number>;
}
