import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtractPhase } from "./ExtractPhase";
import type { RepoConnectOffer, RepoDep, RepoDepsView } from "@/types/repo";

/**
 * Roadmap 090 — the Extract phase as it is rendered: its four pre-report
 * states (none of which may be a track of zeros), the node that is selected
 * first, and what each node's card opens onto.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

const CONNECT: RepoConnectOffer = {
  suggestion: null,
  onConnect: () => undefined,
  onOpenLoad: () => undefined,
};

function dep(name: string, file: string, manager: string): RepoDep {
  return {
    key: `${file}:0:${name}`,
    depName: name,
    value: "1.0.0",
    meta: `${file} · 1.0.0`,
    manager,
    packageFile: file,
    fill: { depName: name, manager, packageFile: file },
  };
}

const EMPTY: RepoDepsView = {
  status: "idle",
  repo: "",
  deps: [],
  files: [],
  managersConsidered: 0,
  truncated: false,
  error: null,
};

const READY: RepoDepsView = {
  ...EMPTY,
  status: "ready",
  repo: "acme/webapp",
  deps: [dep("react", "package.json", "npm"), dep("node", "Dockerfile", "dockerfile")],
  files: [
    {
      path: "package.json",
      managers: ["npm"],
      extractedBy: "npm",
      depCount: 1,
      outcome: "extracted",
    },
    {
      path: "Dockerfile",
      managers: ["dockerfile"],
      extractedBy: "dockerfile",
      depCount: 1,
      outcome: "extracted",
    },
    {
      path: "docs/package.json",
      managers: ["npm"],
      extractedBy: null,
      depCount: 0,
      outcome: "not-read",
    },
    {
      path: ".github/workflows/ci.yml",
      managers: ["github-actions"],
      extractedBy: null,
      depCount: 0,
      outcome: "no-deps",
    },
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
  it("offers to connect a repository when none is loaded", () => {
    const onOpenLoad = vi.fn();
    const view = renderPhase(EMPTY, { connect: { ...CONNECT, onOpenLoad } });

    expect(view.container.textContent).toContain("The repository isn’t loaded in this session");
    // Above all: no track of zeros claiming a walk that never ran.
    expect(view.container.querySelector(".stage-rail")).toBeNull();
  });

  it("says it is reading while discovery runs", () => {
    const view = renderPhase({ ...EMPTY, status: "loading", repo: "acme/webapp" });
    expect(view.container.textContent).toContain("Reading acme/webapp’s package files…");
    expect(view.container.querySelector(".stage-rail")).toBeNull();
  });

  it("states a failure and offers the retry", () => {
    const onRetry = vi.fn();
    const view = renderPhase(
      { ...EMPTY, status: "error", repo: "acme/webapp", error: "rate limited" },
      { onRetry },
    );

    expect(view.container.textContent).toContain("Could not read acme/webapp: rate limited");
    fireEvent.click(view.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("says nothing matched rather than drawing an empty track", () => {
    const view = renderPhase({ ...EMPTY, status: "ready", repo: "acme/webapp" });
    expect(view.container.textContent).toContain("No package files matched in acme/webapp");
    expect(view.container.querySelector(".stage-rail")).toBeNull();
  });
});

describe("ExtractPhase report", () => {
  it("opens on the phase's result, with the three steps beside it", () => {
    const view = renderPhase(READY);

    const nodes = [...view.container.querySelectorAll(".stage-rail-btn")];
    expect(nodes.map((node) => node.textContent)).toEqual([
      "Match managers3",
      "Scan files3 package files",
      "Extract deps+2",
    ]);
    expect(view.container.querySelector(".card-title")?.textContent).toBe(
      "Extract deps — 2 dependencies from acme/webapp",
    );
    // Grouped by the manager that read them, opening onto the deps themselves.
    fireEvent.click(view.getByRole("button", { name: /npm/ }));
    expect(view.getByText("react")).toBeTruthy();
  });

  it("hands the reader on to the Dependencies tab rather than repeating it", () => {
    const onOpenDependencies = vi.fn();
    const view = renderPhase(READY, { onOpenDependencies });

    fireEvent.click(view.getByRole("button", { name: "Open the Dependencies tab" }));
    expect(onOpenDependencies).toHaveBeenCalledOnce();
  });

  it("shows every matched file under Match managers, unread ones included", () => {
    const view = renderPhase(READY);

    fireEvent.click(view.getByRole("button", { name: /Match managers/ }));
    expect(view.container.querySelector(".card-title")?.textContent).toBe(
      "Match managers — 3 of 100 managers matched files",
    );
    fireEvent.click(view.getByRole("button", { name: /npm/ }));
    expect(view.getByText("docs/package.json")).toBeTruthy();
    // The cap dropped it, so nothing is claimed about its contents.
    expect(view.getByText("not read")).toBeTruthy();
    expect(view.container.textContent).toContain("97 other managers matched no files.");
  });

  it("lists only the files discovery actually read under Scan files", () => {
    const view = renderPhase(READY);

    fireEvent.click(view.getByRole("button", { name: /Scan files/ }));
    expect(view.container.querySelector(".card-title")?.textContent).toBe(
      "Scan files — 3 package files scanned",
    );
    expect(view.queryByText("docs/package.json")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: /package\.json/ }));
    expect(view.getByText("react")).toBeTruthy();
  });
});
