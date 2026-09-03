import { describe, expect, it } from "vitest";
import { type FileRun, mergeFileRuns } from "./use-repo-deps";

/**
 * Roadmap 093 — the one honesty decision in the discovery loop: a file several
 * extractors ran over (a built-in plus every custom block that claimed it) gets
 * ONE ledger entry, and that entry may not lose an extraction to a failure that
 * happened beside it.
 */

const extracted = (manager: string, rows: number): FileRun => ({
  status: "extracted",
  manager,
  rows,
});

describe("mergeFileRuns", () => {
  it("totals every run's rows", () => {
    expect(mergeFileRuns([extracted("npm", 2), extracted("custom.regex", 3)])).toEqual({
      outcome: "extracted",
      depCount: 5,
    });
  });

  it("does not let a failing block bury the extraction beside it", () => {
    expect(mergeFileRuns([{ status: "error" }, extracted("custom.regex", 1)])).toEqual({
      outcome: "extracted",
      depCount: 1,
    });
  });

  it("counts an extraction whose rows were all skipped as an extraction", () => {
    // file:/workspace: links: the run happened, it just produced no pinnable row.
    expect(mergeFileRuns([extracted("npm", 0)])).toEqual({
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
      mergeFileRuns([{ status: "error", message: "Invalid regExp: /(/" }, extracted("npm", 1)]),
    ).toEqual({ outcome: "extracted", depCount: 1 });
  });
});
