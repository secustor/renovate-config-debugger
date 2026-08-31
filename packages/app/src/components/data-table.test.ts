import { describe, expect, it } from "vitest";
import {
  activeColumns,
  type DataTableColumn,
  type DataTableRow,
  defaultVisibleColumns,
  filterDataRows,
  groupDataRows,
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

describe("groupDataRows", () => {
  it("groups in first-appearance order and collects distinct pills", () => {
    const groups = groupDataRows(ROWS, "file");
    expect(groups.map((g) => g.title)).toEqual(["package.json", "Dockerfile"]);
    expect(groups[0]?.rows.map((r) => r.key)).toEqual(["a", "b"]);
    // Two npm rows contribute ONE pill.
    expect(groups[0]?.pills).toEqual(["npm"]);
    expect(groups[1]?.pills).toEqual(["dockerfile"]);
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

  it("a row with no answer for the grouping is filed, not dropped", () => {
    const orphan = row("d", "orphan", {});
    const groups = groupDataRows([...ROWS, orphan], "file");
    expect(groups.at(-1)?.title).toBe(UNGROUPED_TITLE);
    expect(groups.at(-1)?.rows.map((r) => r.key)).toEqual(["d"]);
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
