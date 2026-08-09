import { describe, expect, test } from "vitest";
import { main } from "../src/main";
import { fixture, recordingIo } from "./harness";

/**
 * Output shapes and exit codes, against the real engine. Resolution semantics
 * are NOT retested here — the engine's golden↔shimmed parity suite owns those,
 * and this CLI runs that same shimmed graph.
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

describe("input", () => {
  test("a config file that is not there fails the run and names the path", async () => {
    const io = recordingIo();
    expect(await main(["digest", fixture("nope.json")], io)).toBe(1);
    expect(io.stderr).toContain("cannot read config file");
    expect(io.stderr).toContain("nope.json");
    expect(io.stdout).toBe("");
  });

  test("a config that cannot be parsed is Renovate refusing it, not a failed run", async () => {
    const io = recordingIo();
    expect(await main(["validate", fixture("broken.json5"), "--format", "json"], io)).toBe(2);
    const report = io.json() as {
      accepted: boolean;
      stageStatus: { parse: string; validate: string };
      messages: { message: string }[];
    };
    expect(report.accepted).toBe(false);
    expect(report.stageStatus.parse).toBe("error");
    // Nothing downstream of a failed parse ran, so the verdict is the parse.
    expect(report.stageStatus.validate).toBe("skipped");
    expect(report.messages[0]?.message).toContain("JSON5.parse error");
  });
});

describe("validate", () => {
  test("a config Renovate accepts exits 0", async () => {
    const io = recordingIo();
    expect(await main(["validate", fixture("clean.json"), "--format", "json"], io)).toBe(0);
    expect(io.json()).toMatchObject({ accepted: true, messages: [] });
  });

  test("a config Renovate would refuse exits 2 and explains why", async () => {
    const io = recordingIo();
    expect(await main(["validate", fixture("invalid.json"), "--format", "json"], io)).toBe(2);
    const report = io.json() as {
      accepted: boolean;
      messages: { severity: string; message: string; docsUrl?: string }[];
    };
    expect(report.accepted).toBe(false);
    expect(report.messages[0]?.severity).toBe("error");
    expect(report.messages[0]?.message).toContain("labels");
  });

  test("pretty output leads with the verdict", async () => {
    const io = recordingIo();
    expect(await main(["validate", fixture("invalid.json")], io)).toBe(2);
    expect(io.stdout).toContain("REFUSE");
  });
});

describe("digest", () => {
  test("json carries the paragraph and the numbers behind it", async () => {
    const io = recordingIo();
    expect(await main(["digest", fixture("clean.json"), "--format", "json"], io)).toBe(0);
    const digest = io.json() as {
      digest: string;
      clauses: { id: string }[];
      counts: { presets: number; effectiveOptions: number | null };
    };
    expect(digest.digest).toContain("Renovate accepted this config");
    expect(digest.clauses.map((c) => c.id)).toContain("presets");
    expect(digest.counts.presets).toBe(1);
    // The effective-config tally comes from the app's own module (058's
    // hoist), so it is a number here rather than "still computing".
    expect(digest.counts.effectiveOptions).toBeGreaterThan(0);
  });

  test("pretty output is the paragraph itself", async () => {
    const io = recordingIo();
    expect(await main(["digest", fixture("clean.json")], io)).toBe(0);
    expect(io.stdout).toContain("Renovate accepted this config");
    expect(io.stdout).toContain("expanded into 1 preset");
    expect(io.stderr).toBe("");
  });
});

describe("run", () => {
  test("without --select the trace is the small selection, not the firehose", async () => {
    const io = recordingIo();
    expect(await main(["run", fixture("clean.json"), "--format", "json"], io)).toBe(0);
    const result = io.json() as Record<string, unknown>;
    expect(Object.keys(result)).toEqual([
      "renovateVersion",
      "stageStatus",
      "errors",
      "warnings",
      "finalConfig",
    ]);
  });

  test("--select trims the trace to the named slices", async () => {
    const io = recordingIo();
    expect(
      await main(["run", fixture("clean.json"), "--format", "json", "--select", "status"], io),
    ).toBe(0);
    const result = io.json() as Record<string, unknown>;
    expect(Object.keys(result)).toEqual(["renovateVersion", "stageStatus"]);
  });

  test("an unknown slice is rejected", async () => {
    const io = recordingIo();
    expect(await main(["run", fixture("clean.json"), "--select", "everything"], io)).toBe(1);
    expect(io.stderr).toContain("--select");
  });

  test("reads the config from stdin", async () => {
    const io = recordingIo({ stdin: '{"labels":["from-stdin"]}' });
    expect(await main(["run", "--stdin", "--format", "json", "--select", "final"], io)).toBe(0);
    const result = io.json() as { finalConfig: { labels: string[] } };
    expect(result.finalConfig.labels).toEqual(["from-stdin"]);
  });
});

describe("tree", () => {
  test("structure and stats, no bodies", async () => {
    const io = recordingIo();
    expect(await main(["tree", fixture("clean.json"), "--format", "json"], io)).toBe(0);
    const tree = io.json() as {
      summary: { resolved: number };
      root: { children: { name: string; ownOptions: number }[] };
    };
    expect(tree.summary.resolved).toBe(1);
    expect(tree.root.children[0]?.name).toBe(":dependencyDashboard");
    expect(JSON.stringify(tree)).not.toContain("dependencyDashboardTitle");
  });

  test("--node --body is how a body is asked for", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "tree",
          fixture("clean.json"),
          "--node",
          ":dependencyDashboard",
          "--body",
          "input",
          "--format",
          "json",
        ],
        io,
      ),
    ).toBe(0);
    const node = io.json() as { body: string; input: { dependencyDashboard: boolean } };
    expect(node.body).toBe("input");
    expect(node.input.dependencyDashboard).toBe(true);
  });

  test("--body without --node is refused", async () => {
    const io = recordingIo();
    expect(await main(["tree", fixture("clean.json"), "--body", "input"], io)).toBe(1);
    expect(io.stderr).toContain("one node at a time");
  });
});

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
});

describe("resolved", () => {
  test("keeps internal presets by default", async () => {
    const io = recordingIo();
    expect(await main(["resolved", fixture("clean.json"), "--format", "json"], io)).toBe(0);
    const output = io.json() as { mode: string; config: { extends?: string[] } };
    expect(output.mode).toBe("keep-internal");
    expect(output.config.extends).toEqual([":dependencyDashboard"]);
  });

  test("--mode full leaves no preset reference behind", async () => {
    const io = recordingIo();
    expect(
      await main(["resolved", fixture("clean.json"), "--mode", "full", "--format", "json"], io),
    ).toBe(0);
    const output = io.json() as { mode: string; config: Record<string, unknown> };
    expect(output.mode).toBe("full");
    expect(output.config.extends).toBeUndefined();
    // …because what `:dependencyDashboard` sets is now written out directly.
    expect(output.config.dependencyDashboard).toBe(true);
  });

  test("--include-defaults writes out the options nothing set", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "resolved",
          fixture("clean.json"),
          "--mode",
          "full",
          "--include-defaults",
          "--format",
          "json",
        ],
        io,
      ),
    ).toBe(0);
    const output = io.json() as { includeDefaults: boolean; config: Record<string, unknown> };
    expect(output.includeDefaults).toBe(true);
    // Neither the fixture nor the preset mentions rangeStrategy.
    expect(output.config.rangeStrategy).toBe("auto");
    // `extends` is back only as its own default — empty, so still no reference.
    expect(output.config.extends).toEqual([]);
  });

  test("--include-defaults only makes sense fully expanded", async () => {
    const io = recordingIo();
    expect(await main(["resolved", fixture("clean.json"), "--include-defaults"], io)).toBe(1);
    expect(io.stderr).toContain("--mode full");
  });
});

describe("simulate", () => {
  test("reports a verdict per rule with clause-level evidence", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "simulate",
          fixture("grouped.json"),
          "--dep",
          '{"depName":"react","packageName":"react","currentValue":"17.0.0","newValue":"18.0.0"}',
          "--format",
          "json",
        ],
        io,
      ),
    ).toBe(0);
    const sim = io.json() as {
      dep: { updateType?: string };
      rules: { verdict: string; clauses: { key: string; state: string }[] }[];
    };
    // updateType was not given, so it was derived from the version pair.
    expect(sim.dep.updateType).toBe("major");
    expect(sim.rules[0]?.verdict).toBe("matched");
    expect(sim.rules[0]?.clauses[0]).toMatchObject({ key: "matchPackageNames", state: "matched" });
  });

  test("a dependency no rule matches is a verdict, not an error", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "simulate",
          fixture("grouped.json"),
          "--dep",
          '{"depName":"lodash","packageName":"lodash","currentValue":"4.17.20","newValue":"4.17.21"}',
          "--format",
          "json",
        ],
        io,
      ),
    ).toBe(0);
    const sim = io.json() as {
      rules: { verdict: string; clauses: { key: string; state: string }[] }[];
      mergeSteps: unknown[];
    };
    expect(sim.rules[0]?.verdict).toBe("no-match");
    expect(sim.rules[0]?.clauses[0]).toMatchObject({
      key: "matchPackageNames",
      state: "no-match",
    });
    // Nothing matched, so nothing was merged for this dependency.
    expect(sim.mergeSteps).toEqual([]);
  });

  test("a dependency is required", async () => {
    const io = recordingIo();
    expect(await main(["simulate", fixture("grouped.json")], io)).toBe(1);
    expect(io.stderr).toContain("--dep");
  });
});

describe("compare", () => {
  test("two configs, one dependency: the edit oracle", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "compare",
          fixture("clean.json"),
          fixture("grouped.json"),
          "--dep",
          '{"depName":"react","packageName":"react"}',
          "--format",
          "json",
        ],
        io,
      ),
    ).toBe(0);
    const comparison = io.json() as {
      noChange: boolean;
      matchedOnlyInB: { label: string }[];
      configDelta: { key: string }[];
    };
    expect(comparison.noChange).toBe(false);
    expect(comparison.matchedOnlyInB[0]?.label).toBe("matchPackageNames");
    expect(comparison.configDelta.map((d) => d.key)).toContain("groupName");
  });

  test("the same config twice changes nothing", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "compare",
          fixture("grouped.json"),
          fixture("grouped.json"),
          "--dep",
          '{"depName":"react","packageName":"react"}',
          "--format",
          "json",
        ],
        io,
      ),
    ).toBe(0);
    expect(io.json()).toMatchObject({ noChange: true });
  });

  test("pretty output leads with the verdict, then the evidence", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "compare",
          fixture("clean.json"),
          fixture("grouped.json"),
          "--dep",
          '{"depName":"react","packageName":"react"}',
        ],
        io,
      ),
    ).toBe(0);
    expect(io.stdout.split("\n")[0]).toBe("Behavior differs between A and B.");
    expect(io.stdout).toContain("Matched only in B:");
    expect(io.stdout).toContain("groupName");
  });
});

describe("docs", () => {
  test("an option's metadata for the pinned Renovate", async () => {
    const io = recordingIo();
    expect(await main(["docs", "packageRules", "--format", "json"], io)).toBe(0);
    const doc = io.json() as { name: string; url: string; renovateVersion: string };
    expect(doc.name).toBe("packageRules");
    expect(doc.url).toContain("docs.renovatebot.com");
    expect(doc.renovateVersion).toMatch(/^\d+\./);
  });

  test("--search lists candidates", async () => {
    const io = recordingIo();
    expect(await main(["docs", "matchPackage", "--search", "--format", "json"], io)).toBe(0);
    const found = io.json() as { matches: { name: string }[] };
    expect(found.matches.map((m) => m.name)).toContain("matchPackageNames");
  });

  test("an option that does not exist points at --search", async () => {
    const io = recordingIo();
    expect(await main(["docs", "nopeNotAnOption"], io)).toBe(1);
    expect(io.stderr).toContain("--search");
  });
});
