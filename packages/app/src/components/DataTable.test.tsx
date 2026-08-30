import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable } from "./DataTable";
import type { DataTableColumn, DataTableGrouping, DataTableRow } from "./data-table";

/**
 * Roadmap 089 — the standard data table as the reader operates it: the
 * grouping, the column toggles, the filter, a row opening into its record, and
 * the row actions firing with nothing else attached to them.
 *
 * Prop-driven throughout (no engine, no shims): the table's whole contract is
 * the row model it is handed, which is exactly what makes it a `components/`
 * citizen.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

const COLUMNS: readonly DataTableColumn[] = [
  { id: "value", label: "Current value", defaultOn: true, mono: true },
  { id: "manager", label: "Manager", defaultOn: false },
];

const GROUPINGS: readonly DataTableGrouping[] = [
  { id: "file", label: "Package file" },
  { id: "manager", label: "Manager" },
];

const onPin = vi.fn();

const ROWS: readonly DataTableRow[] = [
  {
    key: "a",
    lead: "react",
    cells: { value: "17.0.0", manager: "npm" },
    groups: { file: { title: "package.json", pill: "npm" }, manager: { title: "npm" } },
    fields: [
      { label: "depName", value: "react" },
      { label: "datasource", value: "npm" },
    ],
    actions: [{ id: "pin", label: "Pin as test", onClick: () => onPin("react") }],
  },
  {
    key: "b",
    lead: "node",
    cells: { value: "20", manager: "dockerfile" },
    groups: { file: { title: "Dockerfile", pill: "dockerfile" }, manager: { title: "dockerfile" } },
    badge: { text: "custom.regex", title: "a user-defined rule" },
    fields: [{ label: "depName", value: "node" }],
  },
];

function renderTable() {
  return render(
    <DataTable
      rows={ROWS}
      columns={COLUMNS}
      groupings={GROUPINGS}
      defaultGroupingId="file"
      leadLabel="Dependency"
      rowNoun={{ one: "dependency", many: "dependencies" }}
      filterPlaceholder="Filter 2 dependencies…"
      contextNote="from acme/webapp"
    />,
  );
}

/** The gear's popover exists only while open — every options assertion goes
 *  through here rather than hunting for a panel that is not rendered. */
function openOptions(view: ReturnType<typeof renderTable>) {
  fireEvent.click(view.getByRole("button", { name: "Display options" }));
}

describe("DataTable", () => {
  it("draws the header, the default grouping and the default columns", () => {
    const view = renderTable();

    // The lead column plus the ONE column that is on by default; the header
    // and the rows walk the same list, so `Manager` appears in neither.
    expect(view.getByText("Dependency")).toBeTruthy();
    expect(view.getByText("Current value")).toBeTruthy();
    expect(view.queryByText("Manager")).toBeNull();

    // Grouped by package file, in first-appearance order, each header
    // carrying the managers that read it and its own count.
    const groups = view.container.querySelectorAll(".data-table-group-title");
    expect([...groups].map((el) => el.textContent)).toEqual(["package.json", "Dockerfile"]);
    expect(view.container.querySelectorAll(".data-table-group-count")[0]?.textContent).toBe(
      "1 dependency",
    );
    expect(view.container.querySelector(".data-table-group-pills")?.textContent).toBe("npm");
    expect(view.getByText("from acme/webapp")).toBeTruthy();
  });

  it("regroups and ungroups from the gear", () => {
    const view = renderTable();
    openOptions(view);

    // Scoped: "Manager" is both a grouping and a column, and the popover shows
    // a pill for each.
    const groupBy = view.getByRole("group", { name: "Group by" });
    fireEvent.click(within(groupBy).getByRole("button", { name: "Manager" }));
    expect(
      [...view.container.querySelectorAll(".data-table-group-title")].map((el) => el.textContent),
    ).toEqual(["npm", "dockerfile"]);

    // "None" draws one list and no headers at all.
    fireEvent.click(within(groupBy).getByRole("button", { name: "None" }));
    expect(view.container.querySelectorAll(".data-table-group-head")).toHaveLength(0);
    expect(view.container.querySelectorAll(".data-table-row")).toHaveLength(2);
  });

  it("toggles a column on and off, header and cells together", () => {
    const view = renderTable();
    openOptions(view);

    // Inside the Columns section — the Group by section has a same-named pill.
    const columns = view.getByRole("group", { name: "Columns" });
    const manager = within(columns).getByRole("button", { name: "Manager" });
    expect(manager.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(manager);
    expect(manager.getAttribute("aria-pressed")).toBe("true");
    expect(view.container.querySelector(".data-table-head")?.textContent).toContain("Manager");
    expect(view.getByTitle("dockerfile")).toBeTruthy();

    fireEvent.click(manager);
    expect(view.queryByTitle("dockerfile")).toBeNull();
  });

  it("filters over everything a row says, and says so when nothing matches", () => {
    const view = renderTable();
    const filter = view.getByRole("textbox", { name: "Filter 2 dependencies…" });

    fireEvent.change(filter, { target: { value: "dockerfile" } });
    expect(view.container.querySelectorAll(".data-table-row")).toHaveLength(1);
    expect(view.getByText("node")).toBeTruthy();

    fireEvent.change(filter, { target: { value: "nothing-here" } });
    expect(view.container.querySelectorAll(".data-table-row")).toHaveLength(0);
    expect(view.container.textContent).toContain("Nothing matches");
  });

  it("opens a row onto its record and closes it again", () => {
    const view = renderTable();
    const head = view.getByRole("button", { name: /react/ });
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(view.queryByText("datasource")).toBeNull();

    fireEvent.click(head);
    expect(head.getAttribute("aria-expanded")).toBe("true");
    // The definition list is the descriptor, field by field.
    expect(view.getByText("datasource")).toBeTruthy();

    fireEvent.click(head);
    expect(view.queryByText("datasource")).toBeNull();
  });

  it("fires a row action without also toggling the row", () => {
    const view = renderTable();
    const head = view.getByRole("button", { name: /react/ });

    fireEvent.click(view.getByRole("button", { name: "Pin as test" }));
    expect(onPin).toHaveBeenCalledExactlyOnceWith("react");
    // The action is a SIBLING of the row button, not a child of it — nesting
    // them would make every action click a disclosure toggle too.
    expect(head.getAttribute("aria-expanded")).toBe("false");
  });

  it("wears a row's badge with the explanation in its title", () => {
    const view = renderTable();
    const badge = view.getByText("custom.regex");
    expect(badge.getAttribute("title")).toBe("a user-defined rule");
  });
});
