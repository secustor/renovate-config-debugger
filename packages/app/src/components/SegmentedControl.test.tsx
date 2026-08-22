import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl";

/**
 * Roadmap 036's segmented chrome, now one component. What the four hand-rolled
 * copies disagreed about is exactly what is asserted here: the radio-group
 * semantics (the preset tree's copy had `role="group"` and no `aria-checked`,
 * so which rendering was current reached assistive tech through a CSS class and
 * nothing else), and the `.seg` / `.active` class names, which the CSS and two
 * e2e specs select on.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

type View = "tree" | "table";

const OPTIONS: readonly SegmentedOption<View>[] = [
  { value: "tree", label: "tree" },
  { value: "table", label: "table", title: "the flat table" },
];

describe("SegmentedControl", () => {
  it("says which segment is on, in the markup and not only in CSS", () => {
    const view = render(
      <SegmentedControl label="View" value="tree" options={OPTIONS} onChange={vi.fn()} />,
    );

    const group = view.getByRole("radiogroup", { name: "View" });
    expect(group.className).toBe("seg");

    const [tree, table] = view.getAllByRole("radio");
    expect(tree?.getAttribute("aria-checked")).toBe("true");
    expect(table?.getAttribute("aria-checked")).toBe("false");
    // The e2e specs locate the live segment by this class.
    expect(tree?.className).toBe("active");
    expect(table?.className).toBe("");
    expect(table?.getAttribute("title")).toBe("the flat table");
  });

  it("reports the value it was clicked for, once", () => {
    const onChange = vi.fn();
    const view = render(
      <SegmentedControl label="View" value="tree" options={OPTIONS} onChange={onChange} />,
    );

    fireEvent.click(view.getByRole("radio", { name: "table" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("table");
  });

  it("keeps the caller's own class beside the shared one", () => {
    const view = render(
      <SegmentedControl
        className="theme-switch"
        label="Color theme"
        value="tree"
        options={OPTIONS}
        onChange={vi.fn()}
      />,
    );
    expect(view.getByRole("radiogroup", { name: "Color theme" }).className).toBe(
      "seg theme-switch",
    );
  });
});
