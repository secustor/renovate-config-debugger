#!/usr/bin/env node
/**
 * Roadmap 059/067: the compat table is templated — this asserts the tree is
 * in the state it should be, as part of `build`.
 *
 * On an ordinary build the README must carry only the marker pair: the rows
 * are data (`compat.json`) and the rendered table is a release artefact, so
 * rendered rows sitting in the repository copy are a hand edit or a merge
 * resurrecting the fixed table 067 originally committed — the thing that made
 * every Renovate bump PR fail against a row nobody is allowed to write.
 *
 * During a release (`RCD_RELEASE=1`, set by release.config.mjs after
 * `stamp-compat.ts` has run) the assertion flips: the history's top row must
 * describe this exact build, and the README between the markers must be that
 * history rendered — a release cannot publish without stating its Renovate.
 *
 * Plain Node, no dependencies: it runs before anything is built.
 */
import { COLUMNS, currentBuild, readHistory, readRegion, render } from "./compat-table.ts";

const build = currentBuild();
const history = readHistory();
const region = readRegion();
const between = region.lines.slice(region.start, region.end);

if (process.env["RCD_RELEASE"] === "1") {
  const top = history[0];

  if (!top || COLUMNS.some((column) => top[column] !== build[column])) {
    throw new Error(
      "packages/cli/compat.json: the top row does not describe this build.\n" +
        `  expected: ${JSON.stringify(build)}\n` +
        `  found:    ${JSON.stringify(top ?? null)}\n` +
        "Run `node packages/cli/scripts/stamp-compat.ts` (release.config.mjs chains it before this build).",
    );
  }

  const expected = render(history);
  const found = between.filter((line) => line.trim() !== "");

  if (found.length !== expected.length || expected.some((line, i) => found[i] !== line)) {
    throw new Error(
      "packages/cli/README.md: the stamped compat table does not match compat.json.\n" +
        "Run `node packages/cli/scripts/stamp-compat.ts` to re-render it.",
    );
  }

  process.stdout.write(
    `compat ok (release): cli ${build.cli} · engine ${build.engine} · renovate ${build.renovate}\n`,
  );
} else {
  const stray = between.filter((line) => line.trimStart().startsWith("|"));

  if (stray.length > 0) {
    throw new Error(
      "packages/cli/README.md: a rendered compat table is sitting in the repository copy.\n" +
        "The rows live in packages/cli/compat.json; the table is rendered between the\n" +
        "markers at release time (scripts/stamp-compat.ts). Remove the rendered rows.",
    );
  }

  process.stdout.write(
    `compat ok: renovate pinned at ${build.renovate}, ${history.length} released row(s) in compat.json\n`,
  );
}
