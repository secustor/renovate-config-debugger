import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RepoPicker } from "./RepoPicker";
import type { RepoPickerView } from "@/types/repo";

/**
 * Roadmap 085 — the row's two gestures. Picking a row fills the reference
 * field and loads nothing (so a row can be inspected first); confirming one,
 * with Enter or a double-click, loads it. The Enter half is the one a plain
 * `<button>` gets wrong on its own: the browser turns the key into a click,
 * which would only pick.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

function picker(overrides: Partial<RepoPickerView> = {}): RepoPickerView {
  return {
    status: "ready",
    rows: [
      {
        name: "acme/webapp",
        note: "TypeScript · 2d ago",
        configFile: "renovate.json",
        selected: false,
      },
    ],
    hiddenMatches: 0,
    onPick: vi.fn(),
    onActivate: vi.fn(),
    ...overrides,
  };
}

function row(view: RepoPickerView) {
  render(<RepoPicker picker={view} user={null} />);
  return screen.getByRole("button", { name: /acme\/webapp/ });
}

describe("RepoPicker rows", () => {
  it("only picks on a single click", () => {
    const view = picker();
    fireEvent.click(row(view));
    expect(view.onPick).toHaveBeenCalledWith("acme/webapp");
    expect(view.onActivate).not.toHaveBeenCalled();
  });

  it("activates on a double click", () => {
    const view = picker();
    fireEvent.doubleClick(row(view));
    expect(view.onActivate).toHaveBeenCalledWith("acme/webapp");
  });

  it("activates on Enter, cancelling the click the key would otherwise make", () => {
    const view = picker();
    const notCancelled = fireEvent.keyDown(row(view), { key: "Enter" });
    expect(view.onActivate).toHaveBeenCalledWith("acme/webapp");
    expect(notCancelled).toBe(false);
  });

  it("leaves Space to the button's own behaviour — select, do not fetch", () => {
    const view = picker();
    fireEvent.keyDown(row(view), { key: " " });
    expect(view.onActivate).not.toHaveBeenCalled();
  });

  it("says how to load only when there are rows to load", () => {
    const hint = "Enter or double-click loads";
    render(<RepoPicker picker={picker()} user={null} />);
    expect(screen.getByText(hint)).toBeTruthy();
    cleanup();
    render(<RepoPicker picker={picker({ status: "loading", rows: [] })} user={null} />);
    expect(screen.queryByText(hint)).toBeNull();
  });
});
