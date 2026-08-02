import type { ReactElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { writeMark } from "./rule-format";
import { WriteRow } from "./WriteRow";

/**
 * Roadmap 053 layer 7 — the one write row, and the prop matrix the four
 * surfaces that share it actually exercise: a changed key (before → after), an
 * added one (no before), a removed one (a sentinel where a value would be), a
 * write that lost (struck `after` plus the stop that took it), and a thread's
 * beaten value (a `before` alone). What is pinned here is the CONTRACT the
 * surfaces rely on: the two value classes are the only ones values wear, the
 * arrow appears only between two values, and every key goes through OptionKey.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

function row(ui: ReactElement): HTMLElement {
  const view = render(ui);
  const el = view.container.querySelector(".sim-write-row");
  if (!(el instanceof HTMLElement)) {
    throw new Error("no write row rendered");
  }
  return el;
}

describe("WriteRow", () => {
  it("renders a changed key as before → after, with the key as an option key", () => {
    const el = row(
      <WriteRow name="automerge" mark="~" before={{ json: false }} after={{ json: true }} />,
    );
    expect(el.querySelector(".sim-write-mark")?.textContent).toBe("~");
    // A2.1: the key is the option-docs hook everywhere now, not bare <code>.
    expect(el.querySelector(".sim-write-key .opt-key")?.textContent).toBe("automerge");
    expect(el.querySelector(".sim-merged-before")?.textContent).toBe("false");
    expect(el.querySelector(".sim-merged-after")?.textContent).toBe("true");
    expect(el.textContent).toContain("→");
  });

  it("drops the arrow when the row states only one side", () => {
    const added = row(<WriteRow name="schedule" after={{ json: ["before 6am"] }} />);
    expect(added.querySelector(".sim-merged-before")).toBeNull();
    expect(added.textContent).not.toContain("→");

    const beaten = row(<WriteRow name="groupName" mark="⊘" before={{ json: "npm" }} />);
    expect(beaten.querySelector(".sim-merged-after")).toBeNull();
    expect(beaten.querySelector(".sim-merged-before")?.textContent).toBe('"npm"');
    expect(beaten.textContent).not.toContain("→");
  });

  it("prints a sentinel as words rather than JSON-quoting it", () => {
    const el = row(
      <WriteRow name="labels" before={{ json: ["a"] }} after={{ text: "(removed)" }} />,
    );
    expect(el.querySelector(".sim-merged-after")?.textContent).toBe("(removed)");
  });

  it("strikes a write a later stop took away and states the note", () => {
    const el = row(
      <WriteRow
        name="groupName"
        mark="+"
        after={{ json: "npm minor+patch" }}
        struck
        note="· ⊘ overridden in step 3 of 3"
      />,
    );
    expect(el.querySelector(".sim-merged-after")?.className).toContain("overridden");
    expect(el.querySelector(".sim-write-note")?.textContent).toContain("overridden in step 3 of 3");
  });

  it("truncates a value to the surface's own budget", () => {
    const long = "x".repeat(200);
    const short = row(<WriteRow name="k" after={{ json: long }} />);
    const wide = row(<WriteRow name="k" after={{ json: long }} max={80} />);
    // JSON quotes count toward the budget, and the ellipsis is added after it.
    expect(short.querySelector(".sim-merged-after")?.textContent).toHaveLength(61);
    expect(wide.querySelector(".sim-merged-after")?.textContent).toHaveLength(81);
  });

  it("marks a write by what it did to the key", () => {
    expect(writeMark(true, true)).toBe("~");
    expect(writeMark(false, true)).toBe("+");
    expect(writeMark(true, false)).toBe("−");
  });
});
