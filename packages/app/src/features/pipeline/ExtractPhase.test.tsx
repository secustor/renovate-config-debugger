import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtractPhase } from "./ExtractPhase";
import { type ExtractNodeId, extractNodes } from "./extract-phase";
import {
  CONNECT_OFFER as CONNECT,
  EMPTY_VIEW as EMPTY,
  repoDep as dep,
  walkFile,
} from "@tools/test/repo-deps";
import type { RepoDepsView } from "@/types/repo";

/**
 * Roadmap 090 — the Extract phase as it is rendered: that its pre-report
 * states go through the shared gate (none of which may be a track of zeros),
 * the node that is selected first, and what each node's card opens onto.
 *
 * What the nodes SAY is `extract-phase.ts`' own question, asked in
 * `extract-phase.test.ts`; the sentences are read from that derivation here
 * rather than restated, so a wording change lands in one file.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

const READY: RepoDepsView = {
  ...EMPTY,
  status: "ready",
  repo: "acme/webapp",
  deps: [dep("react", "package.json", "npm"), dep("node", "Dockerfile", "dockerfile")],
  files: [
    walkFile("package.json", ["npm"], { extractedBy: "npm", depCount: 1, outcome: "extracted" }),
    walkFile("Dockerfile", ["dockerfile"], {
      extractedBy: "dockerfile",
      depCount: 1,
      outcome: "extracted",
    }),
    walkFile("docs/package.json", ["npm"]),
    walkFile(".github/workflows/ci.yml", ["github-actions"], { outcome: "no-deps" }),
  ],
  managersConsidered: 100,
};

function renderPhase(view: RepoDepsView, over: Partial<Parameters<typeof ExtractPhase>[0]> = {}) {
  return render(
    <ExtractPhase
      view={view}
      connect={CONNECT}
      onRetry={vi.fn()}
      onOpenDependencies={vi.fn()}
      {...over}
    />,
  );
}

describe("ExtractPhase states", () => {
  // What the three pre-report states SAY is `RepoDiscoveryGate.test.tsx`'s;
  // what is this phase's is that they go through the gate at all — above all,
  // that none of them leaves a track of zeros claiming a walk that never ran.
  it("answers the pre-report states through the shared discovery gate", () => {
    const view = renderPhase(EMPTY);
    expect(view.container.textContent).toContain("The repository isn’t loaded in this session");
    expect(view.container.querySelector(".stage-rail")).toBeNull();
  });

  it("says nothing matched rather than drawing an empty track", () => {
    const view = renderPhase({ ...EMPTY, status: "ready", repo: "acme/webapp" });
    expect(view.container.textContent).toContain("No package files matched in acme/webapp");
    expect(view.container.querySelector(".stage-rail")).toBeNull();
  });
});

/** The card header the phase draws for a node, per the derivation. */
function headingFor(id: ExtractNodeId): string {
  const node = extractNodes(READY).find((candidate) => candidate.id === id);
  if (node === undefined) {
    throw new Error(`no ${id} node`);
  }
  return `${node.label} — ${node.outcome}`;
}

function selectNode(view: RenderResult, id: ExtractNodeId) {
  const button = view.container.querySelector(`[data-extract-node="${id}"]`);
  if (button === null) {
    throw new Error(`no ${id} node on the track`);
  }
  fireEvent.click(button);
}

function heading(view: RenderResult): string {
  return view.container.querySelector(".card-title")?.textContent ?? "";
}

/** What the open card's rows lead with — a manager, or a file path. */
function rowLeads(view: RenderResult): string[] {
  return [...view.container.querySelectorAll(".extract-row-lead")].map(
    (el) => el.textContent ?? "",
  );
}

describe("ExtractPhase report", () => {
  it("draws the three steps in order and opens on the phase's result", () => {
    const view = renderPhase(READY);

    const nodes = [...view.container.querySelectorAll(".stage-rail-btn")];
    expect(nodes.map((node) => node.getAttribute("data-extract-node"))).toEqual([
      "managers",
      "files",
      "deps",
    ]);
    expect(nodes.map((node) => node.getAttribute("aria-pressed"))).toEqual([
      "false",
      "false",
      "true",
    ]);
    expect(heading(view)).toBe(headingFor("deps"));
  });

  it("gives each step its own card, headed by that step's outcome", () => {
    const view = renderPhase(READY);

    selectNode(view, "managers");
    expect(heading(view)).toBe(headingFor("managers"));
    // The managers card leads with managers, and carries the walk's footnotes.
    expect(rowLeads(view)).toContain("npm");
    expect(view.container.querySelector(".extract-notes")).toBeTruthy();

    selectNode(view, "files");
    expect(heading(view)).toBe(headingFor("files"));
    expect(rowLeads(view)).toContain("package.json");
    expect(view.container.querySelector(".extract-notes")).toBeNull();
  });

  it("opens a row onto what that step produced", () => {
    const view = renderPhase(READY);

    // The deps card groups by the manager that read them; the row opens onto
    // the dependencies themselves.
    const row = view.getByRole("button", { name: /npm/ });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(view.getByText("react")).toBeTruthy();
  });

  it("hands the reader on to the Dependencies tab rather than repeating it", () => {
    const onOpenDependencies = vi.fn();
    const view = renderPhase(READY, { onOpenDependencies });

    fireEvent.click(view.getByRole("button", { name: "Open the Dependencies tab" }));
    expect(onOpenDependencies).toHaveBeenCalledOnce();
  });
});
