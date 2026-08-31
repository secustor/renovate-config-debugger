import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PinHeadRow } from "./PinHeadRow";

/**
 * Roadmap 091: a seeded pin has to LOOK seeded. The chip is the only thing
 * that distinguishes a starter from a test the reader wrote, and its title is
 * where the invitation to replace it lives — a pin nobody made, wearing
 * nothing, would read as a test the reader forgot writing.
 */

describe("PinHeadRow", () => {
  it("marks a starter, and says what it is for", () => {
    const view = render(
      <PinHeadRow
        check={{ status: "pending" }}
        name="lodash"
        context="4.17.20 → 4.18.0 · npm · minor"
        summary="1 rule matched"
        starter={true}
      />,
    );
    const chip = view.container.querySelector(".pin-starter");
    expect(chip?.textContent).toBe("starter");
    expect(chip?.getAttribute("title")).toContain("packageRules");
  });

  it("says nothing on a pin the reader made", () => {
    const view = render(
      <PinHeadRow
        check={{ status: "pending" }}
        name="lodash"
        context="4.17.20 → 4.18.0 · npm · minor"
        summary="1 rule matched"
      />,
    );
    expect(view.container.querySelector(".pin-starter")).toBeNull();
    expect(view.container.querySelector(".pin-name")?.textContent).toBe("lodash");
  });
});
