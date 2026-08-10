/**
 * The README's compat table, as data — shared by the two scripts that care.
 *
 * `check-compat.ts` (roadmap 059) asserts the top row describes this build and
 * runs as part of `build`; `stamp-compat.ts` (roadmap 067) writes that row
 * during a release, once semantic-release has decided the version. They have
 * to agree on the marker, the column order and the row format, so that
 * agreement lives here rather than in two parsers that drift.
 *
 * Plain Node, no dependencies: `check-compat.ts` runs before anything is built.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The comment that marks where the table starts, so prose above it can move. */
export const MARKER = "<!-- compat-table -->";

/** One row: the CLI version, the engine build it embeds, the Renovate pin. */
export type CompatRow = [cli: string, engine: string, renovate: string];

const HEADER: CompatRow = ["`cli`", "embedded `engine`", "`renovate`"];

interface PackageJson {
  version: string;
  dependencies?: Record<string, string>;
}

const resolve = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export const readmePath = resolve("../README.md");

const readJson = (relative: string): PackageJson =>
  JSON.parse(readFileSync(resolve(relative), "utf8")) as PackageJson;

/** What the tree currently is — the row a release of it must carry. */
export function currentBuild(): CompatRow {
  const cli = readJson("../package.json");
  const engine = readJson("../../engine/package.json");
  const renovate = engine.dependencies?.renovate;

  if (!renovate || !/^\d+\.\d+\.\d+$/.test(renovate)) {
    throw new Error(
      `packages/engine must pin renovate to an exact version (found ${JSON.stringify(renovate)})`,
    );
  }

  return [cli.version, engine.version, renovate];
}

interface Table {
  /** Data rows, newest first — the header and separator are regenerated. */
  rows: CompatRow[];
  /** Line indices of the table block within the README, for splicing back. */
  start: number;
  end: number;
  lines: string[];
}

function cells(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

/** Locates the table under the marker and returns its rows, header stripped. */
export function readTable(readme = readFileSync(readmePath, "utf8")): Table {
  const lines = readme.split("\n");
  const marker = lines.findIndex((line) => line.trim() === MARKER);

  if (marker === -1) {
    throw new Error(`packages/cli/README.md must carry a ${MARKER} marker above the compat table`);
  }

  let start = marker + 1;
  while (start < lines.length && lines[start]?.trim() === "") {
    start += 1;
  }

  let end = start;
  while (end < lines.length && lines[end]?.startsWith("|")) {
    end += 1;
  }

  // The header and its separator are the first two lines; everything after is
  // release history, oldest at the bottom.
  const rows = lines.slice(start + 2, end).map((line) => cells(line) as CompatRow);

  return { rows, start, end, lines };
}

/** The top data row, or an empty row when the table has no releases yet. */
export function topRow(table = readTable()): CompatRow {
  return table.rows[0] ?? (["", "", ""] as CompatRow);
}

/**
 * Re-renders the whole table with the columns padded to their widest cell —
 * a two-digit minor would otherwise leave the table ragged, and the diff of a
 * release should be the new row, not a re-alignment of every old one.
 */
function render(rows: CompatRow[]): string[] {
  const all = [HEADER, ...rows];
  const widths = HEADER.map((_, column) =>
    Math.max(...all.map((row) => (row[column] ?? "").length)),
  );
  const line = (row: CompatRow): string =>
    `| ${row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join(" | ")} |`;

  return [
    line(HEADER),
    `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`,
    ...rows.map(line),
  ];
}

/**
 * Puts `row` at the top of the table, replacing a row for the same CLI version
 * rather than stacking a duplicate — re-running a release after a failed step
 * has to be a no-op, not a second row.
 *
 * Returns whether the file changed.
 */
export function writeRow(row: CompatRow): boolean {
  const table = readTable();
  const rest = table.rows.filter((existing) => existing[0] !== row[0]);
  const rendered = render([row, ...rest]);
  const before = table.lines.join("\n");
  const after = [
    ...table.lines.slice(0, table.start),
    ...rendered,
    ...table.lines.slice(table.end),
  ].join("\n");

  if (after === before) {
    return false;
  }

  writeFileSync(readmePath, after);
  return true;
}
