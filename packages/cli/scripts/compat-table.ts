/**
 * The CLI's compatibility facts — shared by the two scripts that care.
 *
 * Every published version states its embedded stack in a
 * `renovateCompatibility` manifest field, keyed by full package name. The npm
 * registry therefore accumulates the release history as a side effect of
 * publishing, and the compat table is rendered FROM the registry while
 * publishing — nothing is committed back to the repository, so nothing in the
 * tree can go stale between releases (the fixed table this replaces failed
 * every Renovate bump PR; see roadmap 067's amendment).
 *
 * Plain Node, no dependencies: `check-compat.ts` runs before anything is built.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The pair that brackets the table's spot in the README. */
export const MARKER_START = "<!-- compat-table -->";
export const MARKER_END = "<!-- /compat-table -->";

/** One row: the published CLI version and what that build embedded. */
export interface CompatRow {
  cli: string;
  /** Embedded versions, keyed by full package name (`renovate`, the engine). */
  compat: Record<string, string>;
}

const resolve = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export const readmePath = resolve("../README.md");
export const cliManifestPath = resolve("../package.json");

interface Manifest {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  renovateCompatibility?: Record<string, string>;
}

const readJson = (path: string): Manifest => JSON.parse(readFileSync(path, "utf8")) as Manifest;

export const readCliManifest = (): Manifest => readJson(cliManifestPath);

/** What the tree currently is — the facts a release of it must state. */
export function currentBuild(): CompatRow {
  const cli = readCliManifest();
  const engine = readJson(resolve("../../engine/package.json"));
  const renovate = engine.dependencies?.renovate;

  if (!renovate || !/^\d+\.\d+\.\d+$/.test(renovate)) {
    throw new Error(
      `packages/engine must pin renovate to an exact version (found ${JSON.stringify(renovate)})`,
    );
  }

  return { cli: cli.version, compat: { [engine.name]: engine.version, renovate } };
}

/**
 * Writes the build's `renovateCompatibility` into the CLI manifest — the copy
 * that publishes, never one that is committed. Returns whether the file
 * changed.
 */
export function stampManifest(build: CompatRow): boolean {
  const before = readFileSync(cliManifestPath, "utf8");
  const manifest = JSON.parse(before) as Record<string, unknown>;
  manifest["renovateCompatibility"] = build.compat;
  const after = `${JSON.stringify(manifest, null, 2)}\n`;

  if (after === before) {
    return false;
  }

  writeFileSync(cliManifestPath, after);
  return true;
}

function isCompat(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((version) => typeof version === "string")
  );
}

const core = (version: string): number[] => (version.split("-")[0] ?? "").split(".").map(Number);

/** Newest-first; numeric on the x.y.z core, plain string on any prerelease. */
function compareDesc(a: string, b: string): number {
  const coreA = core(a);
  const coreB = core(b);

  for (let i = 0; i < 3; i += 1) {
    const diff = (coreB[i] ?? 0) - (coreA[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return b.localeCompare(a);
}

/**
 * The rows already published, newest first — read from the npm packument, so
 * the registry itself is the release history. A 404 means the package has
 * never been published, and versions published before the field existed
 * simply have no row.
 */
export async function publishedRows(cliName: string): Promise<CompatRow[]> {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(cliName)}`, {
    headers: { accept: "application/json" },
  });

  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(`the npm registry answered ${response.status} for ${cliName}`);
  }

  const packument = (await response.json()) as {
    versions?: Record<string, { renovateCompatibility?: unknown }>;
  };

  return Object.entries(packument.versions ?? {})
    .flatMap(([version, manifest]) => {
      const compat = manifest.renovateCompatibility;
      return isCompat(compat) ? [{ cli: version, compat }] : [];
    })
    .toSorted((a, b) => compareDesc(a.cli, b.cli));
}

/** Column order: every compat key, in order of first appearance, newest row first. */
function columnsOf(rows: CompatRow[]): string[] {
  const seen: string[] = [];
  for (const row of rows) {
    for (const name of Object.keys(row.compat)) {
      if (!seen.includes(name)) {
        seen.push(name);
      }
    }
  }
  return seen;
}

/** The trimmed cells of a markdown table line. */
export function cells(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

/**
 * The rows as a markdown table, columns padded to their widest cell — a
 * two-digit minor would otherwise leave the table ragged. Headers are the
 * full package names; a version published without a value gets an em dash.
 */
export function render(cliName: string, rows: CompatRow[]): string[] {
  const columns = columnsOf(rows);
  const header = [cliName, ...columns].map((name) => `\`${name}\``);
  const body = rows.map((row) => [row.cli, ...columns.map((name) => row.compat[name] ?? "—")]);
  const widths = header.map((cell, column) =>
    Math.max(cell.length, ...body.map((row) => (row[column] ?? "").length)),
  );
  const line = (row: string[]): string =>
    `| ${row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join(" | ")} |`;

  return [
    line(header),
    `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`,
    ...body.map(line),
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
export function stampReadme(cliName: string, rows: CompatRow[]): boolean {
  const region = readRegion();
  const before = region.lines.join("\n");
  const after = [
    ...region.lines.slice(0, region.start),
    "",
    ...render(cliName, rows),
    "",
    ...region.lines.slice(region.end),
  ].join("\n");

  if (after === before) {
    return false;
  }

  writeFileSync(readmePath, after);
  return true;
}
