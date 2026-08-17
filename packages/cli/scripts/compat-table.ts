/**
 * The CLI's compat history, as data — shared by the two scripts that care.
 *
 * The rows live in `compat.json`, newest first; the README in the repository
 * carries only a marker pair. `stamp-compat.ts` (roadmap 067) upserts the row
 * for the version being released and renders the table between the markers,
 * so the rendered table exists only in the README that ships to npm.
 * `check-compat.ts` (roadmap 059) runs inside `build` and asserts whichever
 * state the tree should be in. No human ever writes a row, which is the
 * point: a Renovate bump on main has no committed table to go stale against.
 *
 * Plain Node, no dependencies: `check-compat.ts` runs before anything is built.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The pair that brackets the table's spot in the README. */
export const MARKER_START = "<!-- compat-table -->";
export const MARKER_END = "<!-- /compat-table -->";

/** One row: the CLI version, the engine build it embeds, the Renovate pin. */
export interface CompatRow {
  cli: string;
  engine: string;
  renovate: string;
}

export const COLUMNS = ["cli", "engine", "renovate"] as const;

const HEADER = ["`cli`", "embedded `engine`", "`renovate`"];

const VERSION = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/;

const resolve = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export const readmePath = resolve("../README.md");
export const historyPath = resolve("../compat.json");

interface PackageJson {
  version: string;
  dependencies?: Record<string, string>;
}

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

  return { cli: cli.version, engine: engine.version, renovate };
}

function isRow(value: unknown): value is CompatRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return COLUMNS.every((column) => {
    const cell = (value as Record<string, unknown>)[column];
    return typeof cell === "string" && VERSION.test(cell);
  });
}

/** The release history, newest first, shape-checked. */
export function readHistory(): CompatRow[] {
  const parsed: unknown = JSON.parse(readFileSync(historyPath, "utf8"));

  if (!Array.isArray(parsed) || !parsed.every(isRow)) {
    throw new Error(
      "packages/cli/compat.json must be an array of {cli, engine, renovate} version rows, newest first",
    );
  }

  return parsed;
}

/**
 * Puts `row` at the top of the history, replacing a row for the same CLI
 * version rather than stacking a duplicate — re-running a release after a
 * failed step has to be a no-op, not a second row.
 *
 * Returns whether the file changed.
 */
export function writeHistory(row: CompatRow): boolean {
  const rest = readHistory().filter((existing) => existing.cli !== row.cli);
  const before = readFileSync(historyPath, "utf8");
  const after = `${JSON.stringify([row, ...rest], null, 2)}\n`;

  if (after === before) {
    return false;
  }

  writeFileSync(historyPath, after);
  return true;
}

/**
 * The rows as a markdown table, columns padded to their widest cell — a
 * two-digit minor would otherwise leave the table ragged, and the diff of a
 * release should be the new row, not a re-alignment of every old one.
 */
export function render(rows: CompatRow[]): string[] {
  const cells = rows.map((row) => COLUMNS.map((column) => row[column]));
  const all = [HEADER, ...cells];
  const widths = HEADER.map((_, column) =>
    Math.max(...all.map((row) => (row[column] ?? "").length)),
  );
  const line = (row: string[]): string =>
    `| ${row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join(" | ")} |`;

  return [
    line(HEADER),
    `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`,
    ...cells.map(line),
  ];
}

interface Region {
  /** Every line of the README, for splicing back. */
  lines: string[];
  /** Index of the first line after the start marker. */
  start: number;
  /** Index of the end-marker line. */
  end: number;
}

/** Locates the marker pair and the lines between them. */
export function readRegion(readme = readFileSync(readmePath, "utf8")): Region {
  const lines = readme.split("\n");
  const start = lines.findIndex((line) => line.trim() === MARKER_START);
  const end = lines.findIndex((line) => line.trim() === MARKER_END);

  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `packages/cli/README.md must bracket the compat table's spot with ${MARKER_START} … ${MARKER_END}`,
    );
  }

  return { lines, start: start + 1, end };
}

/**
 * Renders `rows` between the markers, replacing whatever sits there (the
 * repository copy's placeholder note included). Returns whether the file
 * changed.
 */
export function stampReadme(rows: CompatRow[]): boolean {
  const region = readRegion();
  const before = region.lines.join("\n");
  const after = [
    ...region.lines.slice(0, region.start),
    "",
    ...render(rows),
    "",
    ...region.lines.slice(region.end),
  ].join("\n");

  if (after === before) {
    return false;
  }

  writeFileSync(readmePath, after);
  return true;
}
