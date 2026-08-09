import { describe, expect, test } from "vitest";
import { main } from "../main";
import { fixture, recordingIo } from "../test-harness";

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
