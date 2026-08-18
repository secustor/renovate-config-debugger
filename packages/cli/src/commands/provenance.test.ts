import { describe, expect, test } from "vitest";
import { main } from "../main";
import { fixture, recordingIo } from "../test-harness";

describe("provenance", () => {
  test("lists the options some layer set, with the winning layer", async () => {
    const io = recordingIo();
    expect(await main(["provenance", fixture("clean.json"), "--format", "json"], io)).toBe(0);
    const report = io.json() as {
      tally: { keys: number; overridden: number };
      keys: { key: string; winner: string }[];
    };
    expect(report.tally.keys).toBeGreaterThan(0);
    expect(report.keys.find((k) => k.key === "labels")?.winner).toBe("repo");
  });

  test("one key gives the whole override chain", async () => {
    const io = recordingIo();
    expect(
      await main(["provenance", fixture("clean.json"), "labels", "--format", "json"], io),
    ).toBe(0);
    const entry = io.json() as { key: string; chain: { layer: string; action: string }[] };
    expect(entry.key).toBe("labels");
    expect(entry.chain.at(-1)?.layer).toBe("repo");
  });

  test("a key nothing set is an error, not an empty answer", async () => {
    const io = recordingIo();
    expect(await main(["provenance", fixture("clean.json"), "notAnOption"], io)).toBe(1);
  });

  /** Replay-03 (3 CLI sessions): "winner: defaults" on a key a packageRule
   *  sets read as the effective value for an update the rule covers. The MCP's
   *  get_provenance carried the pointer; the CLI did not. */
  test("a key packageRules can also set carries the per-dependency note", async () => {
    const io = recordingIo();
    expect(
      await main(["provenance", fixture("grouped.json"), "groupName", "--format", "json"], io),
    ).toBe(0);
    const entry = io.json() as { note?: string };
    expect(entry.note).toContain("1 packageRule can set `groupName` per-dependency");
    expect(entry.note).toContain("Simulate a dependency");

    // Pretty output prints the same pointer…
    const pretty = recordingIo();
    expect(await main(["provenance", fixture("grouped.json"), "groupName"], pretty)).toBe(0);
    expect(pretty.stdout).toContain("Simulate a dependency");

    // …and a key no rule touches carries no such caveat.
    const untouched = recordingIo();
    expect(
      await main(["provenance", fixture("grouped.json"), "labels", "--format", "json"], untouched),
    ).toBe(0);
    expect((untouched.json() as { note?: string }).note).toBeUndefined();
  });

  /** Replay-03: a second positional key used to be silently dropped, which
   *  read as "the first key's chain is the whole answer". */
  test("two positional keys are an error, not a silently answered first one", async () => {
    const io = recordingIo();
    expect(await main(["provenance", fixture("clean.json"), "labels", "automerge"], io)).toBe(1);
    expect(io.stderr).toContain("one key per call");
  });
});

/**
 * Roadmap 071: `packageRules` is the key Renovate CONCATENATES, so "who
 * overrode whom" is the wrong question for it. It answers with one contiguous
 * merged-index range per contributing layer — the `#N layer` list it replaced
 * carried one line per rule and no way to tell which of YOUR rules that was.
 */
describe("provenance packageRules", () => {
  interface RuleReport {
    total: number;
    mergeSemantics: string;
    note: string;
    source?: string;
    contributions: { layer: string; kind: string; from: number; to: number; rules?: string[] }[];
  }

  async function report(args: string[]): Promise<RuleReport> {
    const io = recordingIo();
    expect(
      await main(
        ["provenance", fixture("mixed-rules.json"), "packageRules", "--format", "json", ...args],
        io,
      ),
    ).toBe(0);
    return io.json() as RuleReport;
  }

  test("ranges per layer, digest lines carrying the merged index", async () => {
    const answer = await report([]);
    expect(answer.mergeSemantics).toBe("concat");
    expect(answer.total).toBe(4);
    expect(answer.contributions.map((c) => [c.layer, c.from, c.to])).toEqual([
      ["preset :disablePeerDependencies", 0, 0],
      ["repo", 1, 3],
    ]);
    const repo = answer.contributions[1];
    expect(repo?.rules?.[0]).toBe('1 matchPackageNames: ["react"] → groupName');
    expect(answer.note).toContain("index - from");
  });

  test("--source repo answers with just the rules you wrote", async () => {
    const answer = await report(["--source", "repo"]);
    expect(answer.source).toBe("repo");
    expect(answer.contributions).toHaveLength(1);
    expect(answer.contributions[0]?.kind).toBe("repo");
    // Still the merged indexes — the scope narrows the view, not the array.
    expect(answer.contributions[0]?.from).toBe(1);
  });

  test("--rule prints one merged rule's body, cited in both index schemes", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "provenance",
          fixture("mixed-rules.json"),
          "packageRules",
          "--rule",
          "1",
          "--format",
          "json",
        ],
        io,
      ),
    ).toBe(0);
    const one = io.json() as {
      layer: string;
      sourceIndex: number;
      citation: string;
      rule: unknown;
    };
    expect(one).toMatchObject({ layer: "repo", sourceIndex: 0 });
    expect(one.citation).toContain("merged packageRules[1]");
    expect(one.rule).toEqual({ matchPackageNames: ["react"], groupName: "react monorepo" });
  });

  test("--rule and --source belong to the rule array, and say so elsewhere", async () => {
    const io = recordingIo();
    expect(
      await main(["provenance", fixture("mixed-rules.json"), "labels", "--rule", "0"], io),
    ).toBe(1);
    expect(io.stderr).toContain("--rule/--source");
  });

  test("pretty output is one header per layer, not one line per rule", async () => {
    const io = recordingIo();
    expect(await main(["provenance", fixture("mixed-rules.json"), "packageRules"], io)).toBe(0);
    expect(io.stdout).toContain("4 merged rules, concatenated");
    expect(io.stdout).toContain("repo — merged packageRules[1]–[3] (your packageRules[0]–[2])");
    expect(io.stdout).toContain('1 matchPackageNames: ["react"] → groupName');
  });
});
