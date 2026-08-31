import { describe, expect, it } from "vitest";
import { discoveryCaveats, tallyDiscovery } from "./discovery-caveats";
import type { RepoDepFile, RepoDepFileOutcome, RepoDepsView } from "@/types/repo";

/**
 * The shared discovery arithmetic — one pass over the ledger, so the three
 * surfaces that print these numbers cannot disagree with each other.
 */

function file(path: string, outcome: RepoDepFileOutcome): RepoDepFile {
  return { path, managers: ["npm"], extractedBy: null, depCount: 0, outcome };
}

function view(files: RepoDepFile[], truncated = false): RepoDepsView {
  return {
    status: "ready",
    repo: "acme/webapp",
    deps: [],
    files,
    managersConsidered: 10,
    truncated,
    error: null,
  };
}

describe("tallyDiscovery", () => {
  it("counts every outcome, and nothing twice", () => {
    const tally = tallyDiscovery(
      view([
        file("a", "extracted"),
        file("b", "extracted"),
        file("c", "no-deps"),
        file("d", "not-read"),
        file("e", "unreadable"),
        file("f", "error"),
      ]),
    );
    expect(tally).toEqual({ extracted: 2, empty: 1, notRead: 1, unreadable: 1, errored: 1 });
  });
});

describe("discoveryCaveats", () => {
  it("stays silent when the walk answered for every matched file", () => {
    expect(discoveryCaveats(view([file("a", "extracted"), file("b", "no-deps")]))).toEqual([]);
  });

  it("names each shortfall separately — the cap, the unreadable, the failed", () => {
    const clauses = discoveryCaveats(
      view([
        file("a", "not-read"),
        file("b", "not-read"),
        file("c", "unreadable"),
        file("d", "error"),
      ]),
    );
    expect(clauses).toHaveLength(3);
    expect(clauses[0]).toContain("2 matched files not read");
    expect(clauses[1]).toBe("1 matched file could not be read");
    expect(clauses[2]).toBe("extraction failed for 1 matched file");
  });

  it("adds the truncation clause when the tree listing was cut short", () => {
    const clauses = discoveryCaveats(view([], true));
    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toContain("truncated");
  });
});
