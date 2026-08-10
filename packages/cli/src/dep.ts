import { readFile } from "node:fs/promises";
import {
  type DependencyDescriptor,
  deriveUpdateType,
  parseInjectedPreset,
} from "@renovate-config-debugger/engine";
import type { OptionName, ParsedArgs } from "./args";
import { stringOption } from "./args";
import { CliError, errorMessage } from "./io";

/**
 * The hypothetical dependency update `simulate`/`compare` evaluate the rules
 * against — JSON on the command line, or a file. Same shape the simulator form
 * fills in: `{ "depName": "react", "currentValue": "17.0.0", "newValue": "18.0.0" }`.
 */
export async function readDependency(
  args: ParsedArgs,
  inline: OptionName,
  fromFile: OptionName,
): Promise<DependencyDescriptor> {
  const literal = stringOption(args, inline);
  const path = stringOption(args, fromFile);
  if (literal && path) {
    throw new CliError(`pass --${inline} or --${fromFile}, not both`);
  }
  let text = literal;
  if (path) {
    try {
      text = await readFile(path, "utf8");
    } catch (err) {
      throw new CliError(`cannot read --${fromFile} "${path}": ${errorMessage(err)}`);
    }
  }
  if (!text) {
    throw new CliError(
      `--${inline} is required, e.g. --${inline} '{"depName":"react","currentValue":"17.0.0","newValue":"18.0.0"}'`,
    );
  }
  let parsed: Record<string, unknown>;
  try {
    // JSON5 object parsing, the same superset the app accepts in its own
    // paste-a-JSON fields.
    parsed = parseInjectedPreset(text);
  } catch (err) {
    throw new CliError(`--${inline}: ${errorMessage(err)}`);
  }
  // Every field of DependencyDescriptor is optional, so the descriptor is
  // whatever subset the caller supplied; the matchers themselves report which
  // fields they could not read (`no-input`), which is a better error than any
  // shape check here could give.
  const dep = parsed as DependencyDescriptor;
  if (!dep.updateType) {
    // The same derivation the simulator form performs before a run: Renovate
    // sets `updateType` from the version pair long before packageRules run.
    const derived = deriveUpdateType(dep.currentValue, dep.newValue, dep.versioning);
    if (derived) {
      return { ...dep, updateType: derived };
    }
  }
  return dep;
}
