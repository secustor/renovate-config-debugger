import { cleanup, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RepoDiscoveryGate } from "./RepoDiscoveryGate";
import { CONNECT_OFFER as CONNECT, EMPTY_VIEW as EMPTY } from "@tools/test/repo-deps";
import type { RepoDepsView } from "@/types/repo";

/**
 * Roadmap 089/090 — the four answers every discovery door gives before the
 * walk has anything to report. Asserted HERE rather than once per consumer:
 * the gate exists so the Dependencies tab, the Extract phase and the Tests
 * tab's From-repository picker cannot drift apart, and a shared guarantee
 * proved three times is three places to forget it.
 */

/** The marker standing for whatever a consumer draws once discovery reported. */
const BODY = "the consumer’s report";

function renderGate(view: RepoDepsView, onRetry: () => void = () => undefined) {
  return render(
    <RepoDiscoveryGate view={view} connect={CONNECT} onRetry={onRetry}>
      <p>{BODY}</p>
    </RepoDiscoveryGate>,
  );
}

const LOADING: RepoDepsView = { ...EMPTY, status: "loading", repo: "acme/webapp" };
const FAILED: RepoDepsView = {
  ...EMPTY,
  status: "error",
  repo: "acme/webapp",
  error: "rate limited",
};
const READY: RepoDepsView = { ...EMPTY, status: "ready", repo: "acme/webapp" };

describe("RepoDiscoveryGate", () => {
  it("offers to connect while no repository is loaded", () => {
    const view = renderGate(EMPTY);
    expect(view.container.textContent).toContain("The repository isn’t loaded in this session");
  });

  it("makes the offer whatever the status claims — no repo, nothing was read", () => {
    // A stale `ready` under an empty repo must still be the offer, never a
    // report about a repository that is not there.
    const view = renderGate({ ...EMPTY, status: "ready" });
    expect(view.container.textContent).toContain("The repository isn’t loaded in this session");
  });

  it("says it is reading, before the walk starts and while it runs", () => {
    for (const status of ["idle", "loading"] as const) {
      const view = renderGate({ ...LOADING, status });
      expect(view.container.textContent).toContain("Reading acme/webapp’s package files…");
      cleanup();
    }
  });

  it("states the failure and offers the retry", () => {
    const onRetry = vi.fn();
    const view = renderGate(FAILED, onRetry);

    expect(view.container.textContent).toContain("Could not read acme/webapp: rate limited");
    fireEvent.click(view.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("draws the consumer's own report once discovery has reported", () => {
    const view = renderGate(READY);
    expect(view.container.textContent).toContain(BODY);
  });

  it("draws the children on the ready branch and on no other", () => {
    for (const view of [EMPTY, { ...LOADING, status: "idle" as const }, LOADING, FAILED]) {
      const rendered = renderGate(view);
      expect(rendered.container.textContent).not.toContain(BODY);
      cleanup();
    }
  });
});
