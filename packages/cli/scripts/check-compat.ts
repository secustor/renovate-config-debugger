#!/usr/bin/env node
/**
 * Roadmap 059: the compat table's top row must describe THIS build.
 *
 * The CLI's answers change when Renovate's code does, so the version has to
 * say which Renovate a release carries — and a hand-maintained table is
 * exactly the kind of thing that goes stale three releases in. This runs as
 * part of `build`, so a Renovate bump that forgets the table fails the build
 * (and the release workflow) instead of shipping a lie.
 *
 * Roadmap 067 made the row a release artefact rather than a hand edit:
 * `stamp-compat.ts` writes it from the same data this reads. That does not
 * make the check redundant — the release stamps one row, and this is what
 * catches every other way the table can stop being true (a Renovate bump on
 * main, a manual edit, a botched merge).
 *
 * Plain Node, no dependencies: it runs before anything is built.
 */
import { currentBuild, topRow } from "./compat-table.ts";

const expected = currentBuild();
const found = topRow();
const matches = expected.every((value, i) => found[i]?.replaceAll("`", "") === value);

if (!matches) {
  throw new Error(
    "packages/cli/README.md: the compat table's top row is stale.\n" +
      `  expected: | ${expected.join(" | ")} |\n` +
      `  found:    | ${found.join(" | ")} |\n` +
      "Add a row for this release (cli version | embedded engine version | renovate pin),\n" +
      "or run `node packages/cli/scripts/stamp-compat.ts` to write it.",
  );
}

process.stdout.write(
  `compat ok: cli ${expected[0]} · engine ${expected[1]} · renovate ${expected[2]}\n`,
);
