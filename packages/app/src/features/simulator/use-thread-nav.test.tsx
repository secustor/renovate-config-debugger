import { fireEvent, render } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { stubMatchMedia, stubScrollApis } from "@tools/test/jsdom-stubs";
import { ReturnPill } from "./ReturnPill";
import { threadHeadId, useThreadNav } from "./use-thread-nav";

/**
 * Roadmap 068 — the return pill's exits.
 *
 * Escape used to unmount a real, Tab-reachable `<button>` out from under the
 * focus ring and leave focus on <body>, so the next Tab restarted at the skip
 * link. The pill's other exit — landing on the thread head — had the same hole
 * one layer down: the head can sit inside a results panel that is `hidden`, and
 * a landing nobody can take is not a landing.
 *
 * The harness is the pill itself (its `onFocus`/`onBlur` wiring is half of what
 * is under test since it started reporting its own focus), plus the control a
 * keyboard user would have Tabbed from and a thread head to land on.
 */

beforeAll(() => {
  // jsdom implements neither, and `landOnTarget` calls both.
  stubScrollApis();
  stubMatchMedia();
});

/** The thread head as it really sits: inside a results panel that a tab switch
 *  hides in place rather than unmounting (`ResultsPanel`). */
function ThreadPanel({ hidden }: { hidden: boolean }) {
  return (
    <div hidden={hidden}>
      <button type="button" id={threadHeadId("labels")}>
        labels
      </button>
    </div>
  );
}

function Harness({ headHidden = false }: { headHidden?: boolean }) {
  const nav = useThreadNav(null);
  return (
    <>
      <ThreadPanel hidden={headHidden} />
      <button type="button" data-testid="jump" onClick={() => nav.noteJump("labels")}>
        jump
      </button>
      {nav.returnKey === null ? null : (
        <ReturnPill
          threadKey={nav.returnKey}
          onReturn={nav.returnToThread}
          onFocusFrom={nav.notePillFocus}
        />
      )}
    </>
  );
}

function showPill({ headHidden = false } = {}) {
  const view = render(<Harness headHidden={headHidden} />);
  const jump = view.getByTestId("jump");
  jump.focus();
  fireEvent.click(jump);
  const head = view.container.querySelector<HTMLElement>(`#${threadHeadId("labels")}`);
  if (head === null) {
    throw new Error("the harness rendered no thread head");
  }
  return { view, jump, head, pill: view.getByRole("button", { name: "Back to labels" }) };
}

describe("useThreadNav — dismissing the return pill", () => {
  it("hands focus back to where the user reached the pill from", () => {
    const { view, jump, pill } = showPill();
    pill.focus();
    expect(document.activeElement).toBe(pill);

    fireEvent.keyDown(pill, { key: "Escape" });

    expect(view.queryByRole("button", { name: "Back to labels" })).toBeNull();
    expect(document.activeElement).toBe(jump);
  });

  it("leaves focus alone when Escape is pressed somewhere else", () => {
    const { view, jump } = showPill();
    expect(document.activeElement).toBe(jump);

    // The pill is showing but nobody is standing on it: the press dismisses it
    // and must not yank the user out of whatever they are doing.
    fireEvent.keyDown(jump, { key: "Escape" });

    expect(view.queryByRole("button", { name: "Back to labels" })).toBeNull();
    expect(document.activeElement).toBe(jump);
  });
});

describe("useThreadNav — returning to the thread", () => {
  it("lands on the thread head and spends the pill", () => {
    const { view, head, pill } = showPill();
    pill.focus();

    fireEvent.click(pill);

    expect(document.activeElement).toBe(head);
    expect(view.queryByRole("button", { name: "Back to labels" })).toBeNull();
  });

  it("keeps the pill when the head is inside a hidden results panel", () => {
    // Roadmap 068 review: the pill is `ambient` so the jump layer keeps working
    // under it — press `4` while it shows and the thread head is in a panel
    // that is `hidden` but still mounted. The scroll and the flash go nowhere
    // and `.focus()` is refused, so the return did not happen; clearing the
    // pill regardless destroyed the only way back in the gesture that failed to
    // use it, and dropped focus to <body> as the pill unmounted under it.
    //
    // jsdom models neither `hidden` nor `disabled` as a focus barrier (see
    // `ShortcutSheet`'s own tests), so the refusal is spelled out directly.
    const { view, head, pill } = showPill({ headHidden: true });
    head.focus = () => undefined;
    pill.focus();

    fireEvent.click(pill);

    expect(view.queryByRole("button", { name: "Back to labels" })).not.toBeNull();
    expect(document.activeElement).toBe(pill);
  });
});
