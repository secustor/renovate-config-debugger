import { describe, expect, test } from "vitest";
import { main } from "../main";
import { fixture, recordingIo } from "../test-harness";

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
