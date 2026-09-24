import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DependenciesPanel } from "./DependenciesPanel";
import {
  CONNECT_OFFER as CONNECT,
  EMPTY_VIEW as EMPTY,
  logView,
  repoDep,
} from "@tools/test/repo-deps";
import type { RepoDepsView } from "@/types/repo";

/**
 * Roadmap 089 — the Dependencies tab. The three pre-report states are the
 * shared `RepoDiscoveryGate`'s and are proved in its own suite; what is the
 * panel's own is that it routes through the gate, that "nothing found" is a
 * fact about the repository rather than an empty list, and what the table says
 * once discovery reports.
 */

const DEP = repoDep("react", "package.json", "npm", {
  value: "^17.0.0",
  meta: "package.json · ^17.0.0",
  fill: { depName: "react", currentValue: "^17.0.0", datasource: "npm", manager: "npm" },
});

function renderPanel(
  view: RepoDepsView,
  over: Partial<Parameters<typeof DependenciesPanel>[0]> = {},
) {
  return render(
    <DependenciesPanel
      view={view}
      connect={CONNECT}
      onRetry={vi.fn()}
      onPin={vi.fn()}
      onOpenInSimulator={vi.fn()}
      {...over}
    />,
  );
}

describe("DependenciesPanel", () => {
  // What the three pre-report states SAY is `RepoDiscoveryGate.test.tsx`'s;
  // what is this panel's is that they go through the gate at all, and that none
  // of them can leave a table claiming "0 dependencies" behind.
  it("answers the pre-report states through the shared discovery gate", () => {
    const view = renderPanel(EMPTY);
    expect(view.container.textContent).toContain("The repository isn’t loaded in this session");
    expect(view.container.querySelector(".data-table")).toBeNull();
  });

  it("says nothing was found rather than drawing an empty table", () => {
    const view = renderPanel({ ...EMPTY, status: "ready", repo: "acme/webapp" });
    expect(view.container.textContent).toContain("No dependencies detected");
    expect(view.container.querySelector(".data-table")).toBeNull();
  });

  it("draws the table, its totals and its provenance once discovery reports", () => {
    const view = renderPanel({
      ...EMPTY,
      status: "ready",
      repo: "acme/webapp",
      deps: [DEP],
      files: [
        {
          path: "package.json",
          managers: ["npm"],
          depCount: 1,
          outcome: "extracted",
        },
        {
          path: "Dockerfile",
          managers: ["dockerfile"],
          depCount: 0,
          outcome: "no-deps",
        },
        {
          path: "a/Chart.yaml",
          managers: ["helmv3"],
          depCount: 0,
          outcome: "not-read",
        },
        {
          path: "b/Chart.yaml",
          managers: ["helmv3"],
          depCount: 0,
          outcome: "not-read",
        },
      ],
    });

    expect(
      view.getByRole("textbox", { name: /Filter 1 dependency across 1 package file/ }),
    ).toBeTruthy();
    expect(view.getByText("react")).toBeTruthy();
    expect(view.getByText("from acme/webapp")).toBeTruthy();
    // The honest accounting rides under the table: the files that held nothing,
    // and the ones the cap left unread — every count off the same ledger.
    expect(view.container.textContent).toContain("1 matched file did not contain any dependencies");
    expect(view.container.textContent).toContain("2 matched files not read");
  });

  it("draws no footnote when every matched file was read and contributed", () => {
    const view = renderPanel({
      ...EMPTY,
      status: "ready",
      repo: "acme/webapp",
      deps: [DEP],
      files: [
        {
          path: "package.json",
          managers: ["npm"],
          depCount: 1,
          outcome: "extracted",
        },
      ],
    });
    expect(view.container.querySelector(".data-table-note")).toBeNull();
  });

  it("offers the two acts on the OPENED row, not on every line of the list", () => {
    const onPin = vi.fn();
    const view = renderPanel(
      { ...EMPTY, status: "ready", repo: "acme/webapp", deps: [DEP] },
      { onPin },
    );
    expect(view.queryByRole("button", { name: "Pin as test" })).toBeNull();

    fireEvent.click(view.getByRole("button", { name: /react/ }));
    expect(view.getByRole("button", { name: "Open in simulator" })).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Pin as test" }));
    expect(onPin).toHaveBeenCalledExactlyOnceWith(DEP.fill);
  });

  describe("from a Renovate log (roadmap 095)", () => {
    it("names the log, never platform=local's 'local', and draws the table", () => {
      const view = renderPanel(logView([DEP]));
      const text = view.container.textContent;
      expect(text).toContain("from Renovate log (v44.97.5)");
      expect(text).not.toContain("local");
      expect(text).not.toContain("isn’t loaded");
      expect(view.container.querySelector(".data-table")).not.toBeNull();
    });

    it("names the log's slug when it has one", () => {
      const view = renderPanel(logView([DEP], { slug: "acme/webapp" }));
      expect(view.container.textContent).toContain("from Renovate log of acme/webapp (v44.97.5)");
    });

    it("notes a Renovate version other than the pinned one", () => {
      const view = renderPanel(logView([DEP], { renovateVersion: "43.0.0" }));
      expect(view.container.querySelector(".data-table-note")?.textContent).toContain(
        "the log was written by Renovate v43.0.0; this debugger runs v44.97.5",
      );
    });

    it("says the log listed nothing rather than blaming a repository", () => {
      const view = renderPanel(logView([]));
      expect(view.container.textContent).toContain(
        "No dependencies in the Renovate log (v44.97.5) you loaded",
      );
    });
  });
});
