/**
 * Shimmed twin of extract.node.test.ts: the exact module graph the browser
 * bundle uses — managers read through the in-memory shims/fs.ts store, the
 * datasource classes load over the http/git/aws stubs — and the output must
 * match the golden project's file snapshots byte-for-byte, proving the shims
 * do not alter extraction behavior.
 */
import { describe, expect, it } from "vitest";
import { EXTRACTABLE_MANAGERS, extractDeps } from "../src/index";
import { EXTRACT_CASES, extractFixture, extractSnapshotPath } from "./extract-cases";
import { must } from "./helpers";

describe("extractDeps (shimmed)", () => {
  it("covers every mapped manager with a fixture", () => {
    expect(EXTRACT_CASES.map((c) => c.manager).toSorted()).toEqual(EXTRACTABLE_MANAGERS.toSorted());
  });

  for (const c of EXTRACT_CASES) {
    it(`extracts ${c.fixture} with ${c.manager}, byte-identical to golden`, async () => {
      // Explicit manager, as in the golden twin: a case names the parser it
      // exercises; several managers can claim the same filename.
      const outcome = await extractDeps({
        fileName: c.fileName,
        content: extractFixture(c.fixture),
        manager: c.manager,
      });
      if (!outcome.ok) {
        throw new Error(`expected extraction to succeed: ${outcome.message}`);
      }
      await expect(JSON.stringify(outcome.file, null, 2)).toMatchFileSnapshot(
        extractSnapshotPath(c.manager),
      );
    });
  }

  it("round-trips support files through the in-memory fs store", async () => {
    const outcome = await extractDeps({
      fileName: "Cargo.toml",
      content: extractFixture("Cargo.toml"),
      supportFiles: [{ fileName: "Cargo.lock", content: extractFixture("Cargo.lock") }],
    });
    if (!outcome.ok) {
      throw new Error(`expected extraction to succeed: ${outcome.message}`);
    }
    const serde = must(
      outcome.file.deps.find((dep) => dep.depName === "serde"),
      "a serde dep",
    );
    expect(serde.lockedVersion).toBe("1.0.203");
  });

  it("resets the memory cache and file store between extractions", async () => {
    // github-actions memoizes its lockfile read under a fixed memory-cache
    // key; an UNPARSEABLE lock marks every action dep digestManagedExternally.
    // The path is upstream's fixed `actionsLockFile`, not a workflow sibling.
    const withLock = await extractDeps({
      fileName: ".github/workflows/ci.yml",
      content: extractFixture("ci.yml"),
      supportFiles: [{ fileName: ".github/workflows/actions.lock", content: "not json" }],
    });
    if (!withLock.ok) {
      throw new Error(`expected extraction to succeed: ${withLock.message}`);
    }
    const flagged = withLock.file.deps.filter(
      (dep) => (dep as { digestManagedExternally?: boolean }).digestManagedExternally,
    );
    expect(flagged.length).toBeGreaterThan(0);

    // Without the support file the flag must be gone — a stale memoized
    // lockfile promise (or a stale store) would keep it.
    const withoutLock = await extractDeps({
      fileName: ".github/workflows/ci.yml",
      content: extractFixture("ci.yml"),
    });
    if (!withoutLock.ok) {
      throw new Error(`expected extraction to succeed: ${withoutLock.message}`);
    }
    for (const dep of withoutLock.file.deps) {
      expect(
        (dep as { digestManagedExternally?: boolean }).digestManagedExternally,
      ).toBeUndefined();
    }
  });
});
