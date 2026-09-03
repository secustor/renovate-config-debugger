import { describe, expect, it } from "vitest";
import { type FileRun, mapWithLimit, mergeFileRuns } from "./use-repo-deps";

/**
 * Roadmap 093 — the one honesty decision in the discovery loop: a file several
 * extractors ran over (a built-in plus every custom block that claimed it) gets
 * ONE ledger entry, and that entry may not lose an extraction to a failure that
 * happened beside it — plus the bound the file fetches are issued under.
 */

const extracted = (rows: number): FileRun => ({ status: "extracted", rows });

describe("mergeFileRuns", () => {
  it("totals every run's rows", () => {
    expect(mergeFileRuns([extracted(2), extracted(3)])).toEqual({
      outcome: "extracted",
      depCount: 5,
    });
  });

  it("does not let a custom block's failure bury the built-in extraction beside it", () => {
    expect(mergeFileRuns([{ status: "error" }, extracted(1)])).toEqual({
      outcome: "extracted",
      depCount: 1,
    });
  });

  it("counts an extraction whose rows were all skipped as an extraction", () => {
    // file:/workspace: links: the run happened, it just produced no pinnable row.
    expect(mergeFileRuns([extracted(0)])).toEqual({
      outcome: "extracted",
      depCount: 0,
    });
  });

  it("reports a failure only when nothing extracted, and emptiness over nothing", () => {
    expect(mergeFileRuns([{ status: "no-deps" }, { status: "error" }])).toEqual({
      outcome: "error",
      depCount: 0,
    });
    expect(mergeFileRuns([{ status: "no-deps" }, { status: "no-deps" }])).toEqual({
      outcome: "no-deps",
      depCount: 0,
    });
    expect(mergeFileRuns([])).toEqual({ outcome: "no-deps", depCount: 0 });
  });

  it("carries the first failure's reason, and only where the outcome is the failure", () => {
    expect(
      mergeFileRuns([{ status: "error", message: "Invalid regExp: /(/" }, { status: "error" }]),
    ).toEqual({
      outcome: "error",
      depCount: 0,
      error: "Invalid regExp: /(/",
    });
    expect(
      mergeFileRuns([{ status: "error", message: "Invalid regExp: /(/" }, extracted(1)]),
    ).toEqual({ outcome: "extracted", depCount: 1 });
  });
});

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("mapWithLimit", () => {
  const ITEMS = Array.from({ length: 20 }, (_, index) => index);

  it("keeps at most `limit` calls in flight, and answers in input order", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithLimit(ITEMS, 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight -= 1;
      return `#${n}`;
    });

    expect(peak).toBe(3);
    expect(out).toEqual(ITEMS.map((n) => `#${n}`));
  });

  it("walks past an `undefined` element instead of ending there", async () => {
    const items: readonly (number | undefined)[] = [0, undefined, 2];
    await expect(mapWithLimit(items, 2, async (n) => `#${String(n)}`)).resolves.toEqual([
      "#0",
      "#undefined",
      "#2",
    ]);
  });

  it("issues nothing further once one call rejects, and propagates the reason", async () => {
    const started: number[] = [];
    await expect(
      mapWithLimit(ITEMS, 2, async (n) => {
        started.push(n);
        await tick();
        if (n === 1) {
          throw new Error("rate limited");
        }
        return n;
      }),
    ).rejects.toThrow("rate limited");

    // Each worker finishes the item it was already awaiting; neither takes
    // another, so the tail of the walk is never requested.
    expect(started.length).toBeLessThanOrEqual(4);
    expect(started).not.toContain(19);
  });
});
