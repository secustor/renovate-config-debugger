import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResultsBoundary } from "./ResultsBoundary";

/**
 * The invariant the boundary exists for: a throw in the results tree — a
 * rejected `lazy()` chunk is the real case — must not take the config half
 * down with it. Before this component there was no boundary anywhere in the
 * app, so the same throw unmounted the root to a blank page.
 */

function Boom(): never {
  throw new Error("results chunk failed to load");
}

beforeEach(() => {
  // React logs the caught error itself; the run is zero-tolerance about noise.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ResultsBoundary", () => {
  it("renders its children when nothing throws", () => {
    render(
      <ResultsBoundary>
        <p>results</p>
      </ResultsBoundary>,
    );
    expect(screen.getByText("results")).not.toBeNull();
  });

  it("shows the failure panel and leaves the sibling config column mounted", () => {
    render(
      <div>
        <textarea defaultValue="{}" aria-label="config" />
        <ResultsBoundary>
          <Boom />
        </ResultsBoundary>
      </div>,
    );

    expect(screen.getByRole("alert").textContent).toContain("The results couldn’t be shown");
    expect(screen.getByLabelText("config")).not.toBeNull();
  });
});
