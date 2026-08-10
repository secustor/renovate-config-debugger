#!/usr/bin/env node
/**
 * Roadmap 059: the compat table's top row must describe THIS build.
 *
 * The CLI's answers change when Renovate's code does, so the version has to
 * say which Renovate a release carries — and a hand-maintained table is
 * exactly the kind of thing that goes stale three releases in. This runs from
 * `build`, so a Renovate bump that forgets the table fails the build (and the
 * publish workflow) instead of shipping a lie.
 *
 * Two strengths, because a build and a release are different claims:
 *
 * - by default (every `pnpm build`, so every PR) the top row must describe the
 *   DEPENDENCIES of this tree — the embedded engine and the Renovate pin. A
 *   bump PR fixes a stale table by editing those cells.
 * - `--release` additionally requires the row's `cli` cell to be the version
 *   being published. Only `publish-cli.yml` passes it: requiring it everywhere
 *   would mean every automated Renovate bump could only go green by bumping
 *   the CLI version and adding a row, i.e. cutting a release inside a
 *   dependency bump.
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
if (!readme.includes(MARKER)) {
  throw new Error(`packages/cli/README.md must carry a ${MARKER} marker above the compat table`);
}
const table = readme.slice(readme.indexOf(MARKER));

// The first row after the marker's header + separator lines.
const row = table
  .split("\n")
  .filter((line) => line.startsWith("|"))
  .at(2);
const cells = (row ?? "")
  .split("|")
  .slice(1, -1)
  .map((cell) => cell.trim().replaceAll("`", ""));

// A release claims the row is about THIS version; a build only claims it
// describes the dependencies this tree carries.
const release = process.argv.includes("--release");
const expected = [cli.version, engine.version, renovate];
const checked = release ? [0, 1, 2] : [1, 2];
const stale = checked.filter((i) => cells[i] !== expected[i]);

if (stale.length > 0) {
  throw new Error(
    "packages/cli/README.md: the compat table's top row is stale.\n" +
      `  expected: | ${(release ? expected : ["…", expected[1], expected[2]]).join(" | ")} |\n` +
      `  found:    | ${cells.join(" | ")} |\n` +
      (release
        ? "Add a row for this release (cli version | embedded engine version | renovate pin)."
        : "Update the top row's dependency cells to match this tree — no version bump needed."),
  );
}

process.stdout.write(
  `compat ok${release ? " (release)" : ""}: cli ${cli.version} · engine ${engine.version} · renovate ${renovate}\n`,
);
