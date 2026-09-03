import { type DependencyDescriptor, parseInjectedPreset } from "@renovate-config-debugger/engine";
import { isPlainObject } from "@renovate-config-debugger/engine/is";
import type { OptionName, ParsedArgs } from "./args";
import { listOption, stringOption } from "./args";
import { CliError, errorMessage } from "./io";
import { finishDescriptor } from "./questions/dependency";
import { readTextFile } from "./run-input";

/**
 * The hypothetical dependency update `simulate`/`compare` evaluate the rules
 * against — JSON on the command line, or a file. Same shape the simulator form
 * fills in: `{ "depName": "react", "currentValue": "17.0.0", "newValue": "18.0.0" }`.
 *
 * `group` (roadmap 074) takes SEVERAL: `--dep` repeatedly, or `--deps-file`
 * with a JSON array of the same objects.
 *
 * ONE asymmetry, stated because the two flags otherwise read as the same
 * input: a single descriptor (`--dep`, `--dep-file`, `--dep-b`, `--dep-b-file`)
 * is parsed as JSON5 — the superset the app accepts in its own paste-a-JSON
 * fields, and the one Renovate accepts for a preset file — while `--deps-file`
 * is parsed as strict JSON. The engine exposes exactly one JSON5 entry point
 * (`parseInjectedPreset`) and it parses an OBJECT; there is no array shape to
 * hand a batch file to, and giving the CLI its own JSON5 parser to close a
 * one-flag gap costs a dependency in the package whose build is a
 * dependency-free bundle. The ENTRIES are finished identically either way, so
 * only the punctuation of the file itself differs; `--help` and the README say
 * so where they name the flag.
 */

/** One descriptor, parsed and finished the way a real lookup would finish it. */
function parseDescriptor(text: string, what: string): DependencyDescriptor {
  let parsed: Record<string, unknown>;
  try {
    // JSON5 object parsing, the same superset the app accepts in its own
    // paste-a-JSON fields.
    parsed = parseInjectedPreset(text);
  } catch (err) {
    throw new CliError(`${what}: ${errorMessage(err)}`);
  }
  return finishDescriptor(parsed as DependencyDescriptor);
}

export async function readDependency(
  args: ParsedArgs,
  inline: OptionName,
  fromFile: OptionName,
): Promise<DependencyDescriptor> {
  const inlineValues = listOption(args, inline);
  // `--dep` is repeatable for `group`'s sake; here a second occurrence would
  // be silently last-one-wins, which is never what the caller meant.
  if (inlineValues.length > 1) {
    throw new CliError(
      `--${inline} was given ${inlineValues.length} times — this command evaluates ONE update; ` +
        "`rcd group` is the command that takes several",
    );
  }
  const literal = inlineValues[0] ?? stringOption(args, inline);
  const path = stringOption(args, fromFile);
  if (literal && path) {
    throw new CliError(`pass --${inline} or --${fromFile}, not both`);
  }
  const text = path ? await readTextFile(path, `--${fromFile}`) : literal;
  if (!text) {
    throw new CliError(
      `--${inline} is required, e.g. --${inline} '{"depName":"react","currentValue":"17.0.0","newValue":"18.0.0"}'`,
    );
  }
  return parseDescriptor(text, `--${inline}`);
}

/**
 * The batch input: every `--dep` occurrence, then the `--deps-file` array.
 * At least two — one update is `simulate`'s question, and a "group" of one
 * would answer it with a worse tool.
 */
export async function readDependencies(args: ParsedArgs): Promise<DependencyDescriptor[]> {
  const deps = listOption(args, "dep").map((text, index) =>
    parseDescriptor(text, `--dep (occurrence ${index + 1})`),
  );
  const path = stringOption(args, "deps-file");
  if (path) {
    const text = await readTextFile(path, "--deps-file");
    let parsed: unknown;
    // Strict JSON, unlike the inline forms above — see this module's header.
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new CliError(`--deps-file "${path}": ${errorMessage(err)}`);
    }
    if (!Array.isArray(parsed)) {
      throw new CliError(`--deps-file "${path}" must hold a JSON array of dependency objects`);
    }
    for (const [index, entry] of parsed.entries()) {
      if (!isPlainObject(entry)) {
        throw new CliError(`--deps-file "${path}" entry #${index} is not an object`);
      }
      deps.push(finishDescriptor(entry as DependencyDescriptor));
    }
  }
  if (deps.length < 2) {
    throw new CliError(
      "group needs at least two updates (`--dep` repeatedly, or `--deps-file` with a JSON " +
        "array) — for a single update, `rcd simulate` is the question",
    );
  }
  return deps;
}
