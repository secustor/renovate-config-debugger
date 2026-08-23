import { readdirSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { COMMANDS } from "./main";
import { fixture, runCli } from "./test-harness";

/**
 * Dispatch: help, version, and the argv failures that never reach a command.
 *
 * The per-command suites next to `src/commands/` cover output shapes and exit
 * codes, against the real engine. Resolution semantics are NOT retested by any
 * of them — the engine's golden↔shimmed parity suite owns those, and this CLI
 * runs that same shimmed graph.
 */

/** One module per command, named after it — the convention the registry check
 *  below reads as the list of commands that EXIST. */
function commandModules(): string[] {
  return readdirSync(new URL("./commands/", import.meta.url))
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => file.slice(0, -".ts".length))
    .toSorted();
}

describe("dispatch", () => {
  test("--help lists every registered command and exits 0", async () => {
    const run = await runCli(["--help"]);
    expect(run.code).toBe(0);
    // Over the registry, never a second copy of it: a hand-written list is
    // how `group` and `mcp` came to be shipped untested by this suite.
    for (const command of COMMANDS) {
      expect(run.stdout).toContain(command.name);
    }
    expect(run.stdout).toContain("EXPERIMENTAL");
  });

  test("every command module is registered", () => {
    // The registry and the help/dispatch table cannot drift — `buildProgram`
    // reads this same array — but a command that exists and is not IN it can,
    // and it is unreachable from the CLI without a word of warning.
    expect(COMMANDS.map((command) => command.name).toSorted()).toEqual(commandModules());
  });

  test("bare `rcd` is the same question as --help, and just as successful", async () => {
    const run = await runCli([]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("EXPERIMENTAL");
    expect(run.stderr).toBe("");
  });

  test("--version names both versions and exits 0", async () => {
    const run = await runCli(["-v"]);
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/^rcd \S+ \(renovate \d+\./);
  });

  test("a flag the subcommand does not accept is an error, not a silent no-op", async () => {
    const run = await runCli(["digest", fixture("clean.json"), "--dep", "{}"]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("--dep");
    expect(run.stdout).toBe("");
  });

  test("an unknown command is an infrastructure error, on stderr", async () => {
    const run = await runCli(["explode"]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("unknown command 'explode'");
    expect(run.stdout).toBe("");
  });

  test("a per-command --help never runs anything", async () => {
    const run = await runCli(["tree", "--help"]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("--body");
  });

  test("a bad --format is caught before the pipeline runs", async () => {
    const run = await runCli(["digest", fixture("clean.json"), "--format", "yaml"]);
    expect(run.code).toBe(1);
  });

  test("no input at all is an error", async () => {
    const run = await runCli(["digest"]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("--stdin");
  });
});
