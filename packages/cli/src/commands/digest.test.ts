import { describe, expect, test } from "vitest";
import { fixture, runCli, runJson } from "../../test/harness";

describe("digest", () => {
  test("json carries the paragraph and the numbers behind it", async () => {
    const run = await runJson<{
      digest: string;
      clauses: { id: string }[];
      counts: { presets: number; effectiveOptions: number | null };
    }>(["digest", fixture("clean.json"), "--format", "json"]);
    expect(run.code).toBe(0);
    const digest = run.payload;
    expect(digest.digest).toContain("Renovate accepted this config");
    expect(digest.clauses.map((c) => c.id)).toContain("presets");
    expect(digest.counts.presets).toBe(1);
    // The effective-config tally comes from the app's own module (058's
    // hoist), so it is a number here rather than "still computing".
    expect(digest.counts.effectiveOptions).toBeGreaterThan(0);
  });

  test("pretty output is the paragraph itself", async () => {
    const run = await runCli(["digest", fixture("clean.json")]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("Renovate accepted this config");
    expect(run.stdout).toContain("expanded into 1 preset");
    expect(run.stderr).toBe("");
  });
});
