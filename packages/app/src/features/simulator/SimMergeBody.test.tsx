import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ruleEval, simResult } from "@tools/test/simulation";
import { buildMergeStops } from "./merge-stops";
import { SimMergeBody } from "./SimMergeBody";

/**
 * Roadmap 094 retired the positional stepper the merge replay used to be
 * walked with; what it retired NOTHING of is the stop list itself. This is the
 * fast guard on that promise — the e2e suite drives the same list against the
 * production build, but it is excluded from the Stop hook, so the content the
 * ruling committed to keeping is pinned here: every stop in merge order, the
 * flatten stop, and the final stop's config with its Copy control.
 */

const SIM = simResult({
  rules: [ruleEval(0, "matched"), ruleEval(1, "no-match"), ruleEval(2, "matched")],
  finalDependencyConfig: { addLabels: ["from-managers-rule"], automerge: true },
  flattened: {
    updateType: "patch",
    merged: [],
    blocks: { minor: { automerge: true } },
    authoredBlocks: [],
  },
  mergeSteps: [
    {
      kind: "rule",
      ruleIndex: 0,
      before: {},
      after: { addLabels: ["from-managers-rule"] },
      merged: [{ key: "addLabels", after: ["from-managers-rule"] }],
    },
    {
      kind: "rule",
      ruleIndex: 2,
      before: { addLabels: ["from-managers-rule"] },
      after: { addLabels: ["from-managers-rule"], automerge: true },
      merged: [{ key: "automerge", before: false, after: true }],
    },
  ],
});

function renderReplay() {
  return render(
    <SimMergeBody
      finalDependencyConfig={SIM.finalDependencyConfig}
      stops={buildMergeStops(SIM, new Map())}
      showReplay
    />,
  );
}

describe("the merge replay's stop list", () => {
  it("states every stop in merge order — base, each matching rule, flatten, final", () => {
    const view = renderReplay();
    const stops = [...view.container.querySelectorAll(".sim-merge-stop")];
    // The non-matching rule contributes no stop: it merged nothing.
    expect(stops).toHaveLength(5);
    expect(stops.map((li) => li.querySelector(".migration-step-counter")?.textContent)).toEqual([
      "Start",
      "Step 1 of 2",
      "Step 2 of 2",
      "After the rules",
      "Result",
    ]);
    // Each rule stop names its rule and the keys that rule wrote.
    expect(stops[1]?.textContent).toContain("packageRules[0]");
    expect(stops[1]?.textContent).toContain("addLabels");
    expect(stops[2]?.textContent).toContain("packageRules[2]");
    expect(stops[2]?.textContent).toContain("automerge");
  });

  it("keeps the flatten stop's answer to update-type suppression", () => {
    const view = renderReplay();
    const flatten = view.container.querySelectorAll(".sim-merge-stop")[3];
    expect(flatten?.textContent).toContain("Update-type flattening");
    // Nothing merged up, so it says what happened to the one authored block.
    expect(flatten?.textContent).toContain("1 block was consumed");
    expect(flatten?.textContent).toContain("patch");
  });

  it("ends on the resolved config, with its Copy control", () => {
    const view = renderReplay();
    const final = view.container.querySelectorAll(".sim-merge-stop")[4];
    expect(final?.textContent).toContain("Final per-dependency config");
    expect(final?.querySelector(".config-view")?.textContent).toContain("from-managers-rule");
    expect(final?.querySelector(".copy-btn")?.textContent).toContain("Copy config");
  });

  it("falls back to the plain disclosure when nothing merged", () => {
    const view = render(
      <SimMergeBody finalDependencyConfig={{ automerge: true }} stops={[]} showReplay={false} />,
    );
    expect(view.container.querySelector(".sim-merge-stops")).toBeNull();
    expect(view.container.querySelector("details.sim-final")?.textContent).toContain(
      "Show the full resolved dependency config",
    );
  });
});
