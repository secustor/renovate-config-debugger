import type { ReactNode } from "react";
import { nf } from "@/lib/format";

/**
 * Roadmap 089 — the standard data table's SHAPES and the three pure decisions
 * it makes (what a filter keeps, how rows fall into groups, which columns are
 * on). DOM-free, so the grouping and the filter are unit-tested without a
 * renderer, the way every other derivation in this app is.
 *
 * The table is deliberately DATA-driven rather than generic over a row type: a
 * consumer builds `DataTableRow`s once — cells keyed by column id, a group
 * title (and optional pills) keyed by grouping id — and the component then
 * needs no callbacks to render, sort or search them. That is what keeps it in
 * `components/`: it can serve a feature without knowing what a row IS, and the
 * shared layer may not import a feature to find out.
 */
import type { TermId } from "@/data/glossary-data";

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
  /** This column's share of the row, as a CSS length: the flex basis BOTH the
   *  header cell and every data cell take, so they cannot disagree. Absent =
   *  the table's own `--dt-cell`, which is right until a consumer's columns
   *  differ in kind — an option's value is wide, the layer that decided it is
   *  one short phrase. */
  width?: string;
}

/** One way to group the rows. The TITLES come off the rows themselves (see
 *  `DataTableRow.groups`), so a grouping is only its identity and its label. */
export interface DataTableGrouping {
  id: string;
  label: string;
}

/**
 * One alternate rendering of the same records. The FIRST view is always the
 * table itself; every other one replaces the table's body with the node the
 * consumer hands over (`DataTable`'s `altView`), because an alternate view of a
 * record set is the consumer's document, not something a shared table could
 * derive.
 */
export interface DataTableView {
  id: string;
  label: string;
}

/** The tones a group-header pill may wear — the SUFFIXES of the app's existing
 *  `.pill-*` classes (`03-presets.css`), so a pill here can only ever be one of
 *  the hues the rest of the app already uses. Absent = `muted`. */
export type DataTablePillTone =
  | "accent"
  | "preset"
  | "inherited"
  | "global"
  | "muted"
  | "ok"
  | "warn"
  | "error"
  | "count";

/** A pill on a group header: what it says, and in which of the app's tones. */
export interface DataTableGroupPill {
  label: string;
  tone?: DataTablePillTone;
}

/** The group a row falls into under one grouping, and the pills it contributes
 *  to that group's header (the design's manager pills on a package-file header,
 *  the layer pills on a decided-by header). Distinct pills, in row order;
 *  absent = this grouping has none. */
export interface DataTableRowGroup {
  title: string;
  /** Deduplicated by label. A pill with no `tone` is the untoned one a manager
   *  name wants — one spelling, so the model needs no normalizer. */
  pills?: readonly DataTableGroupPill[];
  /** Draw the title in the regular UI font rather than the mono face: a group
   *  headed "Your repo config" is prose, a group headed `package.json` is a
   *  path. Any row of the group asking for it decides for the group. */
  plainTitle?: boolean;
}

/** A key/value line of the expanded row's definition list. */
export interface DataTableField {
  label: string;
  value: string;
  /** The glossary entry explaining this label, drawn as the standard hover
   *  card; without one the label falls back to the option-docs key. */
  term?: TermId;
}

/** A button the OPEN row offers, below its fields — "Pin as test", "Open in
 *  simulator". They belong to the open state: a collapsed row is a line in a
 *  list the reader is scanning, not a place to act. */
export interface DataTableAction {
  id: string;
  label: string;
  title?: string;
  onClick: () => void;
}

/**
 * The toolbar's copy affordance. `getText` is LAZY, the rule roadmap 018 set:
 * a table listing hundreds of rows must not serialize its payload on every
 * render just in case somebody clicks. Handing `null` instead reserves the slot
 * for a payload that is not ready yet and draws nothing.
 */
export interface DataTableCopy {
  getText: () => string;
  /** The accessible name — the button is icon-only in the toolbar's chrome. */
  label: string;
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
  /**
   * What the lead cell DRAWS, when the row's subject is more than its text —
   * an option key carrying its docs hover card. `lead` stays the string the
   * filter matches, so a decorated subject can never hide a row from the
   * search box; this replaces only what is painted inside the cell.
   */
  leadNode?: ReactNode;
  /** Column id → cell text. `""` (or a missing key) renders as "not set". */
  cells: Record<string, string>;
  /** The same rule for a cell: column id → what to draw in place of
   *  `cells[id]`. The STRING is still what the filter searches and what the
   *  cell quotes in its `title`. */
  cellNodes?: Record<string, ReactNode>;
  /** Grouping id → where this row lands under it. A grouping a row has no
   *  entry for puts it under {@link UNGROUPED_TITLE}. */
  groups: Record<string, DataTableRowGroup>;
  badge?: DataTableBadge;
  /**
   * A prepared block the open row draws ABOVE its fields — the design's slot
   * for a record that has more to say than a definition list (the effective
   * config's cascade stack). A NODE rather than a callback: the table stays
   * data-driven, and a consumer that has nothing to add simply omits it.
   */
  detail?: ReactNode;
  /** The expanded body's definition list, in the order it should read. */
  fields: DataTableField[];
  actions?: DataTableAction[];
  /** Opted in to the quick filter: when the gear's checkbox is on, only rows
   *  with this set survive. Absent = out. */
  qf?: boolean;
}

/** How a group header counts its rows. Both spellings, because `pluralWord`'s
 *  "add an s" rule is wrong for the first noun this table was built for
 *  (dependency → dependencies), and a table's noun is the caller's word rather
 *  than a derivation of it. */
export interface DataTableNoun {
  one: string;
  many: string;
}

/** `12 dependencies` / `1 dependency` — {@link plural}'s job for the nouns
 *  {@link DataTableNoun} exists because `plural` cannot spell. Here rather than
 *  at the two sites that need it (the group header's count, a consumer's filter
 *  placeholder) so the table and its callers count in the same words. */
export function countNoun(n: number, noun: DataTableNoun): string {
  return `${nf.format(n)} ${n === 1 ? noun.one : noun.many}`;
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
  /** Normalized: both the plain `pill` and the toned `pills` a row declares
   *  arrive here in one shape, so the header renders one list. */
  pills: DataTableGroupPill[];
  /** The title wants the regular UI font rather than the mono face. */
  plainTitle: boolean;
  rows: DataTableRow[];
}

/**
 * The two filters, composed: the gear's quick filter first (it is a claim about
 * the rows themselves — "only the ones I touched"), then the case-insensitive
 * substring search over everything the row can SAY — its lead, every cell
 * (including the columns currently switched off, because a reader searching for
 * a manager name should find it whether or not that column is on), and its
 * group titles.
 *
 * They compose with AND rather than either winning: a reader who has both on is
 * asking for the intersection, and the toolbar shows both states at once.
 */
export function filterDataRows(
  rows: readonly DataTableRow[],
  query: string,
  quickFilterOn = false,
): DataTableRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter(
    (row) => (!quickFilterOn || row.qf === true) && (q === "" || rowHaystack(row).includes(q)),
  );
}

/**
 * The view actually in force. A consumer that resets the view per run — or a
 * stale id from anywhere — must not blank the table, so an id no list member
 * carries falls back to the FIRST view, which is by definition the table
 * itself. No views at all = nothing to pick, and the table is all there is.
 */
export function activeView(
  views: readonly DataTableView[],
  requested: string | null,
): DataTableView | null {
  const first = views[0];
  if (first === undefined) {
    return null;
  }
  return views.find((view) => view.id === requested) ?? first;
}

/** Whether the table body is what should be drawn — true whenever the active
 *  view is the first one, and true when there are no views at all. */
export function isTableView(views: readonly DataTableView[], requested: string | null): boolean {
  const active = activeView(views, requested);
  return active === null || active.id === views[0]?.id;
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
    return [{ title: null, pills: [], plainTitle: false, rows: [...rows] }];
  }
  const groups = new Map<string, DataTableGroup>();
  for (const row of rows) {
    const entry = row.groups[groupingId];
    const title = entry?.title ?? UNGROUPED_TITLE;
    let group = groups.get(title);
    if (!group) {
      group = { title, pills: [], plainTitle: entry?.plainTitle === true, rows: [] };
      groups.set(title, group);
    }
    group.rows.push(row);
    for (const pill of rowGroupPills(entry)) {
      if (!group.pills.some((seen) => seen.label === pill.label)) {
        group.pills.push(pill);
      }
    }
  }
  return [...groups.values()];
}

/** A row's contribution to its group header. A label-less pill would render as
 *  an empty bubble, so it is dropped here rather than by every consumer.
 *  Deduplication is the caller's, by label. */
function rowGroupPills(entry: DataTableRowGroup | undefined): readonly DataTableGroupPill[] {
  return (entry?.pills ?? []).filter((pill) => pill.label !== "");
}

/** The class list a group-header pill wears: the app's `.pill` plus one of its
 *  existing tones, never a color of this table's own. */
export function groupPillClass(pill: DataTableGroupPill): string {
  return `pill pill-${pill.tone ?? "muted"}`;
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
