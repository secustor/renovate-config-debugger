import type { DescriptionProvenance, ProvenanceLayer } from "@renovate-config-debugger/engine";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { buildDescriptionLedger, type DescriptionLedger } from "@/lib/description-ledger";
import { BlameLedger } from "./BlameLedger";

/**
 * Roadmap 069 (PR 3): the ledger's honesty marks, over hand-built provenance.
 *
 * The wording is unit-tested (`lib/description-ledger.test.ts`,
 * `lib/drop-reasons.test.ts`) and the row's integration with the Effective
 * config is covered by that component's own test; what only a render can prove
 * is that the `≈` reaches the rows that need it — the ones a real run produces
 * only by degrading, which no fixture config can be relied on to do.
 */

afterEach(cleanup);

const DASHBOARD: ProvenanceLayer = { kind: "preset", nodeId: "p1", name: ":dependencyDashboard" };

function ledgerOf(provenance: Partial<DescriptionProvenance>): DescriptionLedger {
  const built = buildDescriptionLedger({
    entries: [],
    unattributed: [],
    finalLength: (provenance.entries?.length ?? 0) + (provenance.unattributed?.length ?? 0),
    dropped: [],
    ruleDescriptions: [],
    degraded: false,
    ...provenance,
  });
  if (!built) {
    throw new Error("expected a ledger, got null");
  }
  return built;
}

test("marks an approximate row, duplicates included", () => {
  // The duplicate cell renders no chip at all — before 069's review it also
  // rendered no mark, so an approximate repeat read as a confident accusation
  // ("repo config repeats it") against a layer the engine had guessed.
  const ledger = ledgerOf({
    entries: [
      {
        index: 0,
        value: "Dashboard.",
        viaTopLevel: DASHBOARD,
        node: { nodeId: "p1", name: ":dependencyDashboard" },
      },
      {
        index: 1,
        value: "Dashboard.",
        viaTopLevel: { kind: "repo" },
        node: { nodeId: "root", name: "(input config)" },
        duplicateOfIndex: 0,
        approximate: true,
      },
    ],
    degraded: true,
  });

  const view = render(<BlameLedger ledger={ledger} />);
  const rows = [...view.container.querySelectorAll<HTMLElement>(".desc-ledger-row")];
  const duplicate = rows[1];
  if (!duplicate) {
    throw new Error(`expected two rows, got ${rows.length}`);
  }

  // The confident row is unmarked…
  expect(rows[0]?.querySelector(".desc-approx-mark")).toBeNull();
  // …and the guessed one carries the shared mark plus the hedged wording.
  expect(duplicate.querySelector(".desc-approx-mark")).not.toBeNull();
  expect(within(duplicate).getByText("duplicate of #1")).toBeTruthy();
  expect(duplicate.textContent).toContain("probably repeated by repo config");
  // …under the shared caveat, not a second wording of it.
  expect(view.container.querySelector(".desc-approx-caveat")).not.toBeNull();
  expect(view.container.querySelector(".desc-ledger-caveat")).toBeNull();
});

test("marks an approximate drop and hedges its reason", () => {
  const ledger = ledgerOf({
    entries: [{ index: 0, value: "Kept.", viaTopLevel: { kind: "repo" } }],
    dropped: [
      {
        value: "Group Jest packages.",
        node: { nodeId: "n5", name: "group:recommended" },
        reason: "ignore-deps-quirk",
        droppedBy: { nodeId: "n6", name: "group:jestPlusTypes" },
        approximate: true,
      },
    ],
  });

  const view = render(<BlameLedger ledger={ledger} />);
  // The footer is closed by default — it is a footnote.
  fireEvent.click(view.getByText("Not included: 1 description Renovate dropped"));

  const dropped = view.container.querySelector<HTMLElement>(".desc-ledger-row.dropped");
  if (!dropped) {
    throw new Error("the opened footer rendered no dropped row");
  }
  expect(dropped.querySelector(".desc-approx-mark")).not.toBeNull();
  expect(dropped.textContent).toContain("exact preset unknown");
});

test("gives a non-string member its own line rather than skipping it", () => {
  const ledger = ledgerOf({
    entries: [
      {
        index: 0,
        value: "Keep this.",
        viaTopLevel: { kind: "repo" },
        node: { nodeId: "root", name: "(input config)" },
      },
    ],
    unattributed: [{ index: 1, value: 42 }],
  });

  const view = render(<BlameLedger ledger={ledger} />);
  const rows = [...view.container.querySelectorAll<HTMLElement>(".desc-ledger-row")];

  expect(rows).toHaveLength(2);
  expect(rows.map((row) => row.querySelector(".desc-ledger-idx")?.textContent)).toEqual(["1", "2"]);
  expect(rows[1]?.className).toContain("unattributed");
  expect(rows[1]?.textContent).toContain("42");
  expect(rows[1]?.textContent).toContain("no preset can be credited");
});
