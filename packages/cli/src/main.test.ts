import { describe, expect, test } from "vitest";
import { main } from "./main";
import { fixture, recordingIo } from "./test-harness";

/**
 * Dispatch: help, version, and the argv failures that never reach a command.
 *
 * The per-command suites next to `src/commands/` cover output shapes and exit
 * codes, against the real engine. Resolution semantics are NOT retested by any
 * of them — the engine's golden↔shimmed parity suite owns those, and this CLI
 * runs that same shimmed graph.
 */

describe("dispatch", () => {
  test("--help lists every command and exits 0", async () => {
    const io = recordingIo();
    expect(await main(["--help"], io)).toBe(0);
    for (const name of [
      "validate",
      "digest",
      "run",
      "tree",
      "provenance",
      "resolved",
      "simulate",
      "compare",
      "docs",
    ]) {
      expect(io.stdout).toContain(name);
    }
    expect(io.stdout).toContain("EXPERIMENTAL");
  });

  test("bare `rcv` is the same question as --help, and just as successful", async () => {
    const io = recordingIo();
    expect(await main([], io)).toBe(0);
    expect(io.stdout).toContain("EXPERIMENTAL");
    expect(io.stderr).toBe("");
  });

  test("--version names both versions and exits 0", async () => {
    const io = recordingIo();
    expect(await main(["-v"], io)).toBe(0);
    expect(io.stdout).toMatch(/^rcv \S+ \(renovate \d+\./);
  });

  test("a flag the subcommand does not accept is an error, not a silent no-op", async () => {
    const io = recordingIo();
    expect(await main(["digest", fixture("clean.json"), "--dep", "{}"], io)).toBe(1);
    expect(io.stderr).toContain("--dep");
    expect(io.stdout).toBe("");
  });

  test("an unknown command is an infrastructure error, on stderr", async () => {
    const io = recordingIo();
    expect(await main(["explode"], io)).toBe(1);
    expect(io.stderr).toContain("unknown command 'explode'");
    expect(io.stdout).toBe("");
  });

  test("a per-command --help never runs anything", async () => {
    const io = recordingIo();
    expect(await main(["tree", "--help"], io)).toBe(0);
    expect(io.stdout).toContain("--body");
  });

  test("a bad --format is caught before the pipeline runs", async () => {
    const io = recordingIo();
    expect(await main(["digest", fixture("clean.json"), "--format", "yaml"], io)).toBe(1);
  });

  test("no input at all is an error", async () => {
    const io = recordingIo();
    expect(await main(["digest"], io)).toBe(1);
    expect(io.stderr).toContain("--stdin");
  });
});
