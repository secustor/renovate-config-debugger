import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
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

  it("keeps the row actions for the OPEN row, under its record", () => {
    const view = renderTable();
    // A list of two hundred rows each wearing two buttons is chrome nobody
    // asked for — and a row that ends in buttons is a row whose cells stop
    // short of the header's columns.
    expect(view.queryByRole("button", { name: "Pin as test" })).toBeNull();

    const head = view.getByRole("button", { name: /react/ });
    fireEvent.click(head);
    const row = view.container.querySelector(".data-table-row.open");
    const parts = [...(row?.children ?? [])].map((el) => el.className);
    expect(parts.indexOf("data-table-fields")).toBeLessThan(
      parts.indexOf("data-table-row-actions"),
    );

    fireEvent.click(view.getByRole("button", { name: "Pin as test" }));
    expect(onPin).toHaveBeenCalledExactlyOnceWith("react");
    // The action is a SIBLING of the row button, not a child of it — nesting
    // them would make every action click a disclosure toggle too, and the row
    // would have closed under the click.
    expect(head.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens the header with an empty slot the width of a row's caret", () => {
    // The header and the rows below it start on the same edge, which is what
    // puts every column label over its own cells.
    const view = renderTable();
    const head = view.container.querySelector(".data-table-head");
    expect(head?.firstElementChild?.className).toBe("data-table-head-caret");
    expect(head?.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("wears a row's badge with the explanation in its title", () => {
    const view = renderTable();
    const badge = view.getByText("custom.regex");
    expect(badge.getAttribute("title")).toBe("a user-defined rule");
  });

  it("shows neither a View section, a Filter section nor a copy button unasked", () => {
    const view = renderTable();
    openOptions(view);
    expect(view.queryByRole("group", { name: "View" })).toBeNull();
    expect(view.queryByRole("group", { name: "Filter" })).toBeNull();
    expect(view.container.querySelector(".copy-btn")).toBeNull();
  });
});

/**
 * The optional capabilities the artboard specifies and the first consumer had
 * no use for: a view picker with an alternate rendering, a copy button, a quick
 * filter, toned group headers, and a prepared block inside the open row.
 */

const VIEWS = [
  { id: "table", label: "By key" },
  { id: "json", label: "As JSON" },
];

function renderExtras(props: Partial<Parameters<typeof DataTable>[0]> = {}) {
  return render(
    <DataTable
      rows={ROWS}
      columns={COLUMNS}
      groupings={[]}
      leadLabel="Dependency"
      rowNoun={{ one: "dependency", many: "dependencies" }}
      filterPlaceholder="Filter 2 dependencies…"
      {...props}
    />,
  );
}

describe("DataTable — the view picker", () => {
  it("renders as the FIRST section of the gear, and switches to the alt view", () => {
    const view = renderExtras({
      views: VIEWS,
      altView: <pre>{"{}"}</pre>,
      filtersInertTitle: "The JSON view is the whole document",
      quickFilterLabel: "Only changed",
    });
    openOptions(view);

    const labels = [...view.container.querySelectorAll(".data-table-option-label")];
    expect(labels.map((el) => el.textContent)).toEqual(["View", "Filter", "Columns"]);

    // The first view is the table, and it is the one that opens on.
    const picker = view.getByRole("group", { name: "View" });
    expect(
      within(picker).getByRole("button", { name: "By key" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(view.container.querySelector(".data-table-head")).toBeTruthy();

    fireEvent.click(within(picker).getByRole("button", { name: "As JSON" }));
    // Header and rows are GONE — replaced by what the consumer supplied.
    expect(view.container.querySelector(".data-table-head")).toBeNull();
    expect(view.container.querySelectorAll(".data-table-row")).toHaveLength(0);
    expect(view.container.querySelector("pre")?.textContent).toBe("{}");
  });

  it("makes both filters inert while the alt view is up, and says why", () => {
    const view = renderExtras({
      views: VIEWS,
      altView: <pre>{"{}"}</pre>,
      filtersInertTitle: "The JSON view is the whole document",
      quickFilterLabel: "Only changed",
    });
    openOptions(view);
    fireEvent.click(
      within(view.getByRole("group", { name: "View" })).getByRole("button", { name: "As JSON" }),
    );

    const filter = view.getByRole("textbox", { name: "Filter 2 dependencies…" });
    expect(filter.hasAttribute("disabled")).toBe(true);
    expect(filter.getAttribute("title")).toBe("The JSON view is the whole document");
    expect(view.getByRole("checkbox").hasAttribute("disabled")).toBe(true);
  });

  it("is controllable, and a stale id falls back to the table rather than blanking", () => {
    const onViewChange = vi.fn();
    const view = renderExtras({
      views: VIEWS,
      view: "gone",
      onViewChange,
      altView: <pre>{"{}"}</pre>,
    });
    // The controlled value names no view; the table is what is drawn.
    expect(view.container.querySelector(".data-table-head")).toBeTruthy();

    openOptions(view);
    fireEvent.click(
      within(view.getByRole("group", { name: "View" })).getByRole("button", { name: "As JSON" }),
    );
    // Controlled: the owner is told, and nothing moves until it says so.
    expect(onViewChange).toHaveBeenCalledExactlyOnceWith("json");
    expect(view.container.querySelector(".data-table-head")).toBeTruthy();
  });
});

describe("DataTable — the copy button", () => {
  it("appears only when a payload is given, and copies it lazily", async () => {
    const writes: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          writes.push(text);
        },
      },
    });
    const getText = vi.fn(() => "the whole table");
    const view = renderExtras({ copy: { getText, label: "Copy as JSON" } });

    // Lazy: nothing is serialized until the reader asks.
    expect(getText).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Copy as JSON" }));
    });
    expect(writes).toEqual(["the whole table"]);
  });

  it("draws nothing for a slot that is reserved but not ready", () => {
    const view = renderExtras({ copy: null });
    expect(view.container.querySelector(".copy-btn")).toBeNull();
  });
});

describe("DataTable — the quick filter", () => {
  const QF_ROWS: DataTableRow[] = [
    { key: "a", lead: "react", cells: {}, groups: {}, fields: [], qf: true },
    { key: "b", lead: "node", cells: {}, groups: {}, fields: [] },
  ];

  it("keeps only the opted-in rows, together with the text filter", () => {
    const view = renderExtras({ rows: QF_ROWS, quickFilterLabel: "Only pinned" });
    expect(view.container.querySelectorAll(".data-table-row")).toHaveLength(2);

    openOptions(view);
    fireEvent.click(view.getByRole("checkbox", { name: "Only pinned" }));
    expect(view.container.querySelectorAll(".data-table-row")).toHaveLength(1);
    expect(view.getByText("react")).toBeTruthy();

    // AND, not either: the text filter still narrows what is left.
    fireEvent.change(view.getByRole("textbox", { name: "Filter 2 dependencies…" }), {
      target: { value: "node" },
    });
    expect(view.container.querySelectorAll(".data-table-row")).toHaveLength(0);
  });

  it("is controllable, so an owner can reset it", () => {
    const onQuickFilter = vi.fn();
    const view = renderExtras({
      rows: QF_ROWS,
      quickFilterLabel: "Only pinned",
      quickFilterOn: false,
      onQuickFilter,
    });
    openOptions(view);
    fireEvent.click(view.getByRole("checkbox", { name: "Only pinned" }));
    expect(onQuickFilter).toHaveBeenCalledExactlyOnceWith(true);
    // Controlled: the table did not narrow itself.
    expect(view.container.querySelectorAll(".data-table-row")).toHaveLength(2);
  });
});

describe("DataTable — the controlled filter", () => {
  it("shows the owner's query and reports edits without adopting them", () => {
    const onQuery = vi.fn();
    const view = renderExtras({ query: "node", onQuery });

    const filter = view.getByRole("textbox", { name: "Filter 2 dependencies…" });
    expect((filter as HTMLInputElement).value).toBe("node");
    expect(view.container.querySelectorAll(".data-table-row")).toHaveLength(1);

    fireEvent.change(filter, { target: { value: "react" } });
    expect(onQuery).toHaveBeenCalledExactlyOnceWith("react");
    expect((filter as HTMLInputElement).value).toBe("node");
  });
});

describe("DataTable — toned group heads and the row's detail block", () => {
  const LAYER_ROWS: DataTableRow[] = [
    {
      key: "labels",
      lead: "labels",
      cells: { value: "[dependencies]" },
      groups: {
        layer: {
          title: "Your repo config",
          plainTitle: true,
          pills: [{ label: "repo", tone: "accent" }],
        },
      },
      detail: <div className="cascade">renovate.json → config:recommended</div>,
      fields: [{ label: "type", value: "array" }],
    },
  ];

  it("draws a plain title and the pills in the app's existing tones", () => {
    const view = renderExtras({
      rows: LAYER_ROWS,
      groupings: [{ id: "layer", label: "Layer" }],
      defaultGroupingId: "layer",
    });

    const title = view.container.querySelector(".data-table-group-title");
    expect(title?.textContent).toBe("Your repo config");
    expect(title?.className).toContain("plain");

    const pill = view.container.querySelector(".data-table-group-pills .pill");
    expect(pill?.textContent).toBe("repo");
    // An existing tone class, not a color of the table's own.
    expect(pill?.className).toBe("pill pill-accent");
  });

  it("renders the prepared detail block ABOVE the fields, only while open", () => {
    const view = renderExtras({
      rows: LAYER_ROWS,
      groupings: [{ id: "layer", label: "Layer" }],
      defaultGroupingId: "layer",
    });
    expect(view.container.querySelector(".cascade")).toBeNull();

    fireEvent.click(view.getByRole("button", { name: /labels/ }));
    const row = view.container.querySelector(".data-table-row.open");
    expect(row?.querySelector(".cascade")?.textContent).toBe("renovate.json → config:recommended");
    // Order is the design's: the block, then the definition list.
    const parts = [...(row?.children ?? [])].map((el) => el.className);
    expect(parts.indexOf("data-table-row-detail")).toBeLessThan(parts.indexOf("data-table-fields"));
  });
});

/**
 * Roadmap 092 — what the Effective-config tab needed the row model to gain, and
 * the rule all three follow: the STRINGS stay the table's (the filter searches
 * them, a cell quotes them in its title), and the nodes only change what is
 * painted. A consumer that passes none of them is unaffected.
 */
describe("DataTable — rich cells and consumer-driven expansion", () => {
  const RICH: readonly DataTableRow[] = [
    {
      key: "labels",
      lead: "labels",
      leadNode: <em className="opt">labels</em>,
      cells: { value: "2 rules", manager: "" },
      cellNodes: { value: <strong className="framed">2 rules — 1 yours</strong> },
      groups: {},
      fields: [],
    },
    { key: "plain", lead: "plain", cells: { value: "17.0.0" }, groups: {}, fields: [] },
  ];

  const WIDE: readonly DataTableColumn[] = [
    { id: "value", label: "Current value", defaultOn: true, mono: true, width: "16rem" },
    { id: "manager", label: "Manager", defaultOn: false },
  ];

  function renderOpenKeys(openKeys: ReadonlySet<string>) {
    return (
      <DataTable
        rows={ROWS}
        columns={COLUMNS}
        groupings={[]}
        leadLabel="Dependency"
        rowNoun={{ one: "dependency", many: "dependencies" }}
        filterPlaceholder="Filter 2 dependencies…"
        openKeys={openKeys}
      />
    );
  }

  it("draws the prepared lead and cell nodes, keeping the text searchable", () => {
    const view = renderExtras({ rows: RICH });

    expect(view.container.querySelector(".data-table-lead .opt")?.textContent).toBe("labels");
    const cell = view.container.querySelector(".data-table-cell");
    expect(cell?.querySelector(".framed")?.textContent).toBe("2 rules — 1 yours");
    // The string is what the cell quotes, and what the filter matches.
    expect(cell?.getAttribute("title")).toBe("2 rules");

    fireEvent.change(view.getByRole("textbox", { name: "Filter 2 dependencies…" }), {
      target: { value: "2 rules" },
    });
    expect(view.container.querySelectorAll(".data-table-row")).toHaveLength(1);
  });

  it("gives a column its own width, in the header and in every cell", () => {
    const view = renderExtras({ rows: RICH, columns: WIDE });

    const head = view.container.querySelector<HTMLElement>(".data-table-head-cell");
    expect(head?.style.flexBasis).toBe("16rem");
    const cells = [...view.container.querySelectorAll<HTMLElement>(".data-table-cell")];
    expect(cells.map((cell) => cell.style.flexBasis)).toEqual(["16rem", "16rem"]);
  });

  it("opens the rows the consumer asks for, then hands the carets back", () => {
    const view = render(renderOpenKeys(new Set(["a"])));
    // Honoured on the FIRST render — the cross-tab link that arrives with the
    // table rather than after it.
    expect(view.container.querySelectorAll(".data-table-row.open")).toHaveLength(1);
    expect(view.getByRole("button", { name: /react/ }).getAttribute("aria-expanded")).toBe("true");

    // The reader's own click wins from there.
    fireEvent.click(view.getByRole("button", { name: /react/ }));
    expect(view.container.querySelectorAll(".data-table-row.open")).toHaveLength(0);

    // …and a NEW set is a new assignment (a run landing, a second link).
    view.rerender(renderOpenKeys(new Set(["b"])));
    const open = view.container.querySelector(".data-table-row.open");
    expect(open?.querySelector(".data-table-lead")?.textContent).toBe("node");
  });
});
