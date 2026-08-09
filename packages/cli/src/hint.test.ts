import { beforeEach, describe, expect, test } from "vitest";
import { HINT_MARKER, resetPluginHintForTest } from "./hint";
import { main } from "./main";
import { fixture, recordingIo } from "./test-harness";

// Roadmap 060: the plugin hint is latched once per process.
beforeEach(resetPluginHintForTest);

describe("the Claude Code plugin hint (roadmap 060)", () => {
  test("is emitted on --help, on stderr, only inside Claude Code", async () => {
    const inside = recordingIo({ env: { CLAUDECODE: "1" } });
    await main(["--help"], inside);
    expect(inside.stderr).toContain(HINT_MARKER);
    expect(inside.stdout).not.toContain("claude-code-hint");

    resetPluginHintForTest();
    const outside = recordingIo();
    await main(["--help"], outside);
    expect(outside.stderr).toBe("");
  });

  test("is emitted when a subcommand is guessed wrong", async () => {
    const io = recordingIo({ env: { CLAUDECODE: "1" } });
    expect(await main(["treee"], io)).toBe(1);
    expect(io.stderr).toContain(HINT_MARKER);
  });

  test("is emitted at most once per process", async () => {
    const io = recordingIo({ env: { CLAUDECODE: "1" } });
    await main(["--help"], io);
    await main(["--help"], io);
    expect(io.stderr.split(HINT_MARKER)).toHaveLength(2);
  });

  test("is withheld from an invocation that asked for machine output", async () => {
    // Not just off stdout: an agent merges the streams with `2>&1`, and the
    // marker prints before the payload.
    for (const argv of [
      ["digest", fixture("clean.json"), "--format", "json"],
      ["digest", "--format=json", fixture("clean.json")],
    ]) {
      resetPluginHintForTest();
      const io = recordingIo({ env: { CLAUDECODE: "1" } });
      expect(await main(argv, io)).toBe(0);
      expect(io.json()).toHaveProperty("digest");
      expect(io.stderr).toBe("");
    }
  });

  test("is withheld from `mcp`, which owns stdio for the whole session", async () => {
    // Dispatch only — the hint is decided before the command runs, so the
    // argv failure below is the cheapest way to reach that decision.
    const io = recordingIo({ env: { CLAUDECODE: "1" } });
    expect(await main(["mcp", "--dep", "{}"], io)).toBe(1);
    expect(io.stderr).not.toContain(HINT_MARKER);
  });
});
