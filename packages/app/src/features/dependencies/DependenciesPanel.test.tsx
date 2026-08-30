import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DependenciesPanel } from "./DependenciesPanel";
import type { RepoConnectOffer, RepoDep, RepoDepsView } from "@/types/repo";

/**
 * Roadmap 089 — the Dependencies tab's four states. Each one is a different
 * honest answer, and the panel must never show a table for any of them: "not
 * loaded" is an offer, "loading" and "failed" are statuses, and "nothing
 * found" is a fact about the repository rather than an empty list.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

const CONNECT: RepoConnectOffer = {
  suggestion: null,
  onConnect: () => undefined,
  onOpenLoad: () => undefined,
};

const EMPTY: RepoDepsView = {
  status: "idle",
  repo: "",
  deps: [],
  fileCount: 0,
  skippedFiles: 0,
  files: [],
  managersConsidered: 0,
  truncated: false,
  error: null,
};

const DEP: RepoDep = {
  key: "package.json:0:react",
  depName: "react",
  value: "^17.0.0",
  meta: "package.json · ^17.0.0",
  manager: "npm",
  packageFile: "package.json",
  fill: { depName: "react", currentValue: "^17.0.0", datasource: "npm", manager: "npm" },
};

function renderPanel(view: RepoDepsView, connect: RepoConnectOffer = CONNECT, onRetry = vi.fn()) {
  return render(
    <DependenciesPanel
      view={view}
      connect={connect}
      onRetry={onRetry}
      onPin={vi.fn()}
      onOpenInSimulator={vi.fn()}
    />,
  );
}

describe("DependenciesPanel", () => {
  it("offers to connect a repository when none is loaded", () => {
    const onOpenLoad = vi.fn();
    const view = renderPanel(EMPTY, { ...CONNECT, onOpenLoad });

    expect(view.container.textContent).toContain("The repository isn’t loaded in this session");
    fireEvent.click(view.getByRole("button", { name: "load a repository…" }));
    expect(onOpenLoad).toHaveBeenCalledOnce();
    // No table, and above all no "0 dependencies" — nothing has been read.
    expect(view.container.querySelector(".data-table")).toBeNull();
  });

  it("says it is reading while discovery runs", () => {
    const view = renderPanel({ ...EMPTY, status: "loading", repo: "acme/webapp" });
    expect(view.container.textContent).toContain("Reading acme/webapp’s package files…");
  });

  it("states a failure and offers the retry", () => {
    const onRetry = vi.fn();
    const view = renderPanel(
      { ...EMPTY, status: "error", repo: "acme/webapp", error: "rate limited" },
      CONNECT,
      onRetry,
    );

    expect(view.container.textContent).toContain("Could not read acme/webapp: rate limited");
    fireEvent.click(view.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
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
      fileCount: 1,
      skippedFiles: 2,
    });

    expect(
      view.getByRole("textbox", { name: /Filter 1 dependency across 1 package file/ }),
    ).toBeTruthy();
    expect(view.getByText("react")).toBeTruthy();
    expect(view.getByText("from acme/webapp")).toBeTruthy();
    // The honest accounting rides under the table, cap and all.
    expect(view.container.textContent).toContain("2 matched files not read");
  });
});
