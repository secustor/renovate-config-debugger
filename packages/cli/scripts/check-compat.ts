#!/usr/bin/env node
/**
 * Roadmap 059: the compat table's top row must describe THIS build.
 *
 * The CLI's answers change when Renovate's code does, so the version has to
 * say which Renovate a release carries — and a hand-maintained table is
 * exactly the kind of thing that goes stale three releases in. This runs as
 * `prebuild`, so a Renovate bump that forgets the table fails the build (and
 * the publish workflow) instead of shipping a lie.
 *
 * Plain Node, no dependencies: it runs before anything is built.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface PackageJson {
  version: string;
  dependencies?: Record<string, string>;
}

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
const readJson = (relative: string): PackageJson => JSON.parse(read(relative)) as PackageJson;

const cli = readJson("../package.json");
const engine = readJson("../../engine/package.json");
const renovate = engine.dependencies?.renovate;

if (!renovate || !/^\d+\.\d+\.\d+$/.test(renovate)) {
  throw new Error(
    `packages/engine must pin renovate to an exact version (found ${JSON.stringify(renovate)})`,
  );
}

const MARKER = "<!-- compat-table -->";
const readme = read("../README.md");
const table = readme.slice(readme.indexOf(MARKER));
if (!readme.includes(MARKER)) {
  throw new Error(`packages/cli/README.md must carry a ${MARKER} marker above the compat table`);
}

// The first row after the marker's header + separator lines.
const row = table
  .split("\n")
  .filter((line) => line.startsWith("|"))
  .at(2);
const cells = (row ?? "")
  .split("|")
  .slice(1, -1)
  .map((cell) => cell.trim().replaceAll("`", ""));

const expected = [cli.version, engine.version, renovate];
const matches = expected.every((value, i) => cells[i] === value);

if (!matches) {
  throw new Error(
    "packages/cli/README.md: the compat table's top row is stale.\n" +
      `  expected: | ${expected.join(" | ")} |\n` +
      `  found:    | ${cells.join(" | ")} |\n` +
      "Add a row for this release (cli version | embedded engine version | renovate pin).",
  );
}

process.stdout.write(
  `compat ok: cli ${cli.version} · engine ${engine.version} · renovate ${renovate}\n`,
);
