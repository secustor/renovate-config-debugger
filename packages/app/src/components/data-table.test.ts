import { describe, expect, it } from "vitest";
import {
  activeColumns,
  activeView,
  type DataTableColumn,
  type DataTableRow,
  type DataTableView,
  defaultVisibleColumns,
  filterDataRows,
  groupDataRows,
  groupPillClass,
  isTableView,
  UNGROUPED_TITLE,
} from "./data-table";

/**
 * Roadmap 089 — the standard data table's three decisions, tested without a
 * renderer: what the filter keeps, how rows fall into groups, and which
 * columns are on. The component test beside this one asserts that the table
 * DRAWS these answers; this one asserts the answers.
 */

const COLUMNS: readonly DataTableColumn[] = [
  { id: "value", label: "Current value", defaultOn: true, mono: true },
  { id: "datasource", label: "Datasource", defaultOn: true },
  { id: "manager", label: "Manager", defaultOn: false },
];

function row(
  key: string,
  lead: string,
  cells: Record<string, string>,
  groups: DataTableRow["groups"] = {},
): DataTableRow {
  return { key, lead, cells, groups, fields: [] };
}

const ROWS: readonly DataTableRow[] = [
  row(
    "a",
    "react",
    { value: "17.0.0", datasource: "npm", manager: "npm" },
    { file: { title: "package.json", pill: "npm" }, manager: { title: "npm" } },
  ),
  row(
    "b",
    "lodash",
    { value: "4.0.0", datasource: "npm", manager: "npm" },
    { file: { title: "package.json", pill: "npm" }, manager: { title: "npm" } },
  ),
  row(
    "c",
    "node",
    { value: "20", datasource: "docker", manager: "dockerfile" },
    { file: { title: "Dockerfile", pill: "dockerfile" }, manager: { title: "dockerfile" } },
  ),
];

describe("filterDataRows", () => {
  it("keeps everything for an empty (or blank) query", () => {
    expect(filterDataRows(ROWS, "")).toHaveLength(3);
    expect(filterDataRows(ROWS, "   ")).toHaveLength(3);
  });

  it("matches the lead, any cell, and the group titles — case-insensitively", () => {
    expect(filterDataRows(ROWS, "REACT").map((r) => r.key)).toEqual(["a"]);
    // A cell of a column that is currently switched OFF still matches: the
    // reader searching for a manager should find it either way.
    expect(filterDataRows(ROWS, "dockerfile").map((r) => r.key)).toEqual(["c"]);
    expect(filterDataRows(ROWS, "package.json").map((r) => r.key)).toEqual(["a", "b"]);
  });

  it("returns nothing rather than everything when nothing matches", () => {
    expect(filterDataRows(ROWS, "zzz")).toEqual([]);
  });
});

describe("filterDataRows + the quick filter", () => {
  const QF: readonly DataTableRow[] = [
    { ...row("a", "react", { value: "17.0.0" }), qf: true },
    row("b", "lodash", { value: "4.0.0" }),
    { ...row("c", "node", { value: "20" }), qf: true },
  ];

  it("is off by default — a row model carrying `qf` changes nothing until asked", () => {
    expect(filterDataRows(QF, "").map((r) => r.key)).toEqual(["a", "b", "c"]);
  });

  it("keeps only the opted-in rows when on", () => {
    expect(filterDataRows(QF, "", true).map((r) => r.key)).toEqual(["a", "c"]);
  });

  it("composes with the text filter as AND, not either winning", () => {
    expect(filterDataRows(QF, "react", true).map((r) => r.key)).toEqual(["a"]);
    // b matches the text but never opted in.
    expect(filterDataRows(QF, "lodash", true)).toEqual([]);
    // …and it still matches with the quick filter off.
    expect(filterDataRows(QF, "lodash", false).map((r) => r.key)).toEqual(["b"]);
  });
});

describe("views", () => {
  const VIEWS: readonly DataTableView[] = [
    { id: "table", label: "By key" },
    { id: "json", label: "As JSON" },
  ];

  it("no views at all is the table, and nothing to pick", () => {
    expect(activeView([], "json")).toBeNull();
    expect(isTableView([], "json")).toBe(true);
  });

  it("falls back to the FIRST view for an id no list member carries", () => {
    // A consumer that resets the view per run, or a stale id from anywhere,
    // must not blank the table.
    expect(activeView(VIEWS, "gone")?.id).toBe("table");
    expect(activeView(VIEWS, null)?.id).toBe("table");
    expect(isTableView(VIEWS, "gone")).toBe(true);
  });

  it("the first view is the table; any other one is not", () => {
    expect(isTableView(VIEWS, "table")).toBe(true);
    expect(isTableView(VIEWS, "json")).toBe(false);
    expect(activeView(VIEWS, "json")?.label).toBe("As JSON");
  });
});

describe("groupDataRows", () => {
  it("groups in first-appearance order and collects distinct pills", () => {
    const groups = groupDataRows(ROWS, "file");
    expect(groups.map((g) => g.title)).toEqual(["package.json", "Dockerfile"]);
    expect(groups[0]?.rows.map((r) => r.key)).toEqual(["a", "b"]);
    // Two npm rows contribute ONE pill, and the untoned spelling normalizes
    // into the same shape the toned one arrives in.
    expect(groups[0]?.pills).toEqual([{ label: "npm" }]);
    expect(groups[1]?.pills).toEqual([{ label: "dockerfile" }]);
  });

  it("a grouping with no pills declared gets none", () => {
    expect(groupDataRows(ROWS, "manager").map((g) => g.pills)).toEqual([[], []]);
  });

  it("null is one anonymous group holding every row", () => {
    const groups = groupDataRows(ROWS, null);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.title).toBeNull();
    expect(groups[0]?.rows).toHaveLength(3);
  });

  it("collects TONED pills, deduplicated by label, and honours plainTitle", () => {
    const layered: DataTableRow[] = [
      {
        ...row("a", "labels", {}),
        groups: {
          layer: {
            title: "Your repo config",
            plainTitle: true,
            pills: [{ label: "repo", tone: "accent" }],
          },
        },
      },
      {
        ...row("b", "prConcurrentLimit", {}),
        groups: {
          layer: {
            title: "Your repo config",
            pills: [
              { label: "repo", tone: "accent" },
              { label: "config:recommended", tone: "preset" },
            ],
          },
        },
      },
    ];
    const groups = groupDataRows(layered, "layer");
    expect(groups).toHaveLength(1);
    expect(groups[0]?.plainTitle).toBe(true);
    expect(groups[0]?.pills).toEqual([
      { label: "repo", tone: "accent" },
      { label: "config:recommended", tone: "preset" },
    ]);
  });

  it("a mono grouping stays mono, and an ungrouped run has no plain title either", () => {
    expect(groupDataRows(ROWS, "file").every((g) => g.plainTitle)).toBe(false);
    expect(groupDataRows(ROWS, null)[0]?.plainTitle).toBe(false);
  });

  it("a row with no answer for the grouping is filed, not dropped", () => {
    const orphan = row("d", "orphan", {});
    const groups = groupDataRows([...ROWS, orphan], "file");
    expect(groups.at(-1)?.title).toBe(UNGROUPED_TITLE);
    expect(groups.at(-1)?.rows.map((r) => r.key)).toEqual(["d"]);
  });
});

describe("groupPillClass", () => {
  it("is the app's own pill plus one of its existing tones — muted by default", () => {
    expect(groupPillClass({ label: "npm" })).toBe("pill pill-muted");
    expect(groupPillClass({ label: "repo", tone: "accent" })).toBe("pill pill-accent");
    expect(groupPillClass({ label: "presets", tone: "preset" })).toBe("pill pill-preset");
  });
});

describe("columns", () => {
  it("opens on the defaults", () => {
    expect([...defaultVisibleColumns(COLUMNS)]).toEqual(["value", "datasource"]);
  });

  it("keeps DECLARATION order, not the order they were switched on", () => {
    const shown = activeColumns(COLUMNS, new Set(["manager", "value"]));
    expect(shown.map((c) => c.id)).toEqual(["value", "manager"]);
  });
});
