import { cleanup, fireEvent, render } from "@testing-library/react";
import { createPortal } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";
import { useThreadNav } from "./use-thread-nav";

/**
 * Roadmap 067 — the return pill's two exits have to land focus alike. Clicking
 * it lands on the thread head (`landOnTarget`); Escape used to unmount a real,
 * Tab-reachable `<button>` out from under the focus ring and leave focus on
 * <body>, so the next Tab restarted at the skip link.
 *
 * The harness is the pill's shape, not its markup: portalled to <body>, and
 * preceded by the control a keyboard user would have Tabbed from.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

function Harness() {
  const nav = useThreadNav(null);
  return (
    <>
      <button type="button" data-testid="jump" onClick={() => nav.noteJump("labels")}>
        jump
      </button>
      {nav.returnKey === null
        ? null
        : createPortal(
            <button type="button" data-testid="pill" onClick={nav.returnToThread}>
              back
            </button>,
            document.body,
          )}
    </>
  );
}

function showPill() {
  const view = render(<Harness />);
  const jump = view.getByTestId("jump");
  jump.focus();
  fireEvent.click(jump);
  return { view, jump, pill: view.getByTestId("pill") };
}

describe("useThreadNav — dismissing the return pill", () => {
  it("hands focus back to where the user reached the pill from", () => {
    const { view, jump, pill } = showPill();
    pill.focus();
    expect(document.activeElement).toBe(pill);

    fireEvent.keyDown(pill, { key: "Escape" });

    expect(view.queryByTestId("pill")).toBeNull();
    expect(document.activeElement).toBe(jump);
  });

  it("leaves focus alone when Escape is pressed somewhere else", () => {
    const { view, jump } = showPill();
    expect(document.activeElement).toBe(jump);

    // The pill is showing but nobody is standing on it: the press dismisses it
    // and must not yank the user out of whatever they are doing.
    fireEvent.keyDown(jump, { key: "Escape" });

    expect(view.queryByTestId("pill")).toBeNull();
    expect(document.activeElement).toBe(jump);
  });
});
