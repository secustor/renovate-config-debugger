import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingLaunch } from "./Landing";

/**
 * The landing's dogfood shortcut is the second trigger of the same repo load
 * the form's submit fires, and the hook has no staleness token — serializing
 * the loads is entirely what gating every trigger on `repoLoading` does.
 */
function renderLaunch(analyzing: boolean) {
  render(
    <LandingLaunch
      onTryExample={() => {}}
      onAnalyzeThisProject={() => {}}
      analyzing={analyzing}
      running={false}
      onRun={() => {}}
      onRunIntent={() => {}}
      blockedReason={null}
    />,
  );
}

describe("LandingLaunch", () => {
  it("disables the dogfood shortcut while a repo load is in flight", () => {
    renderLaunch(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Loading…" }).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Analyze this project" })).toBeNull();
  });

  it("offers it again once nothing is loading", () => {
    renderLaunch(false);
    const shortcut = screen.getByRole<HTMLButtonElement>("button", {
      name: "Analyze this project",
    });
    expect(shortcut.disabled).toBe(false);
  });
});
