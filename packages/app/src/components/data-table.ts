/**
 * Roadmap 089 — the standard data table's SHAPES and the three pure decisions
 * it makes (what a filter keeps, how rows fall into groups, which columns are
 * on). DOM-free, so the grouping and the filter are unit-tested without a
 * renderer, the way every other derivation in this app is.
 *
 * The table is deliberately DATA-driven rather than generic over a row type: a
 * consumer builds `DataTableRow`s once — cells keyed by column id, a group
 * title (and an optional pill) keyed by grouping id — and the component then
 * needs no callbacks to render, sort or search them. That is what keeps it in
 * `components/`: it can serve a feature without knowing what a row IS, and the
 * shared layer may not import a feature to find out.
 */

/** One column the reader can turn on and off. `defaultOn` is the state the
 *  table opens in — the design's Columns section is a set of toggles, not a
 *  chooser that starts empty. */
export interface DataTableColumn {
  id: string;
  label: string;
  defaultOn: boolean;
  /** Rendered in the mono face — values that are literally code (a version
   *  range, a file path) rather than prose. */
  mono?: boolean;
}

/** One way to group the rows. The TITLES come off the rows themselves (see
 *  `DataTableRow.groups`), so a grouping is only its identity and its label. */
export interface DataTableGrouping {
  id: string;
  label: string;
}

/** The group a row falls into under one grouping, and the token it contributes
 *  to that group's header pills (the design's manager pills on a package-file
 *  header). Distinct pills, in row order; absent = this grouping has none. */
export interface DataTableRowGroup {
  title: string;
  pill?: string;
}

/** A key/value line of the expanded row's definition list. */
export interface DataTableField {
  label: string;
  value: string;
}

/** A button at the row's right — "Pin as test", "Open in simulator". */
export interface DataTableAction {
  id: string;
  label: string;
  title?: string;
  onClick: () => void;
}

/** The amber note a row wears beside its name: what it says, and why. */
export interface DataTableBadge {
  text: string;
  title: string;
}

export interface DataTableRow {
  /** Stable across renders — the expansion set is keyed by it. */
  key: string;
  /** The lead cell, always shown, always mono (it is the row's subject). */
  lead: string;
  /** Column id → cell text. `""` (or a missing key) renders as "not set". */
  cells: Record<string, string>;
  /** Grouping id → where this row lands under it. A grouping a row has no
   *  entry for puts it under {@link UNGROUPED_TITLE}. */
  groups: Record<string, DataTableRowGroup>;
  badge?: DataTableBadge;
  /** The expanded body's definition list, in the order it should read. */
  fields: DataTableField[];
  actions?: DataTableAction[];
}

/** How a group header counts its rows. Both spellings, because `pluralWord`'s
 *  "add an s" rule is wrong for the first noun this table was built for
 *  (dependency → dependencies), and a table's noun is the caller's word rather
 *  than a derivation of it. */
export interface DataTableNoun {
  one: string;
  many: string;
}

/** The "None" pill's id in the Group by section — a real grouping id is never
 *  empty, so this cannot collide with one. */
export const NO_GROUPING = "";

/** What a row with no answer for the active grouping is filed under. */
export const UNGROUPED_TITLE = "—";

/** One rendered group: its header line and the rows beneath it. */
export interface DataTableGroup {
  /** null = not grouped at all; the table then draws no header. */
  title: string | null;
  pills: string[];
  rows: DataTableRow[];
}

/**
 * Case-insensitive substring search over everything the row can SAY — its
 * lead, every cell (including the columns currently switched off, because a
 * reader searching for a manager name should find it whether or not that
 * column is on), and its group titles.
 */
export function filterDataRows(rows: readonly DataTableRow[], query: string): DataTableRow[] {
  const q = query.trim().toLowerCase();
  if (q === "") {
    return [...rows];
  }
  return rows.filter((row) => rowHaystack(row).includes(q));
}

function rowHaystack(row: DataTableRow): string {
  const parts = [row.lead, ...Object.values(row.cells)];
  for (const group of Object.values(row.groups)) {
    parts.push(group.title);
  }
  return parts.join(" ").toLowerCase();
}

/**
 * Rows into groups, in FIRST-APPEARANCE order — the rows arrive in the order
 * their source produced them (extraction walks a repository's files in tree
 * order), and re-sorting the groups alphabetically would throw that away for
 * nothing.
 *
 * `groupingId` of null is the "None" pill: one anonymous group holding every
 * row, so the caller renders one list and no headers.
 */
export function groupDataRows(
  rows: readonly DataTableRow[],
  groupingId: string | null,
): DataTableGroup[] {
  if (groupingId === null) {
    return [{ title: null, pills: [], rows: [...rows] }];
  }
  const groups = new Map<string, DataTableGroup>();
  for (const row of rows) {
    const entry = row.groups[groupingId];
    const title = entry?.title ?? UNGROUPED_TITLE;
    let group = groups.get(title);
    if (!group) {
      group = { title, pills: [], rows: [] };
      groups.set(title, group);
    }
    group.rows.push(row);
    if (entry?.pill !== undefined && entry.pill !== "" && !group.pills.includes(entry.pill)) {
      group.pills.push(entry.pill);
    }
  }
  return [...groups.values()];
}

/** The columns currently on, in the order they were declared — the header row
 *  and every row's cells walk this one list, so they cannot disagree. */
export function activeColumns(
  columns: readonly DataTableColumn[],
  visible: ReadonlySet<string>,
): DataTableColumn[] {
  return columns.filter((column) => visible.has(column.id));
}

/** The set a table opens with. */
export function defaultVisibleColumns(columns: readonly DataTableColumn[]): ReadonlySet<string> {
  return new Set(columns.filter((column) => column.defaultOn).map((column) => column.id));
}
