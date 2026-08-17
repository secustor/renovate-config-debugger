#!/usr/bin/env node
/**
 * Roadmap 059/067: the compat table and the `renovateCompatibility` manifest
 * field are release artefacts — this asserts the tree is in the state it
 * should be, as part of `build`.
 *
 * On an ordinary build both must be absent: the repository README carries
 * only the marker pair and the manifest no compatibility field, so there is
 * no committed claim about a release for a Renovate bump to invalidate — the
 * fixed table this replaces failed every bot PR (roadmap 067's amendment).
 *
 * During a release (`RCD_RELEASE=1`, set by release.config.mjs after
 * `stamp-compat.ts` has run) the assertion flips: the manifest field and the
 * README table's top row must both describe this exact build — a release
 * cannot publish without stating its Renovate.
 *
 * Plain Node, no dependencies and no network: it runs before anything is
 * built, and the registry fetch stays in `stamp-compat.ts`.
 */
import { cells, currentBuild, readCliManifest, readRegion } from "./compat-table.ts";

const build = currentBuild();
const manifest = readCliManifest();
const region = readRegion();
const between = region.lines.slice(region.start, region.end);

if (process.env["RCD_RELEASE"] === "1") {
  const stamped = manifest.renovateCompatibility;
  const names = Object.keys(build.compat);
  const manifestOk =
    stamped !== undefined &&
    Object.keys(stamped).length === names.length &&
    names.every((name) => stamped[name] === build.compat[name]);

  if (!manifestOk) {
    throw new Error(
      "packages/cli/package.json: renovateCompatibility does not describe this build.\n" +
        `  expected: ${JSON.stringify(build.compat)}\n` +
        `  found:    ${JSON.stringify(stamped ?? null)}\n` +
        "Run `node packages/cli/scripts/stamp-compat.ts` (release.config.mjs chains it before this build).",
    );
  }

  const table = between.filter((line) => line.trim() !== "");
  const header = cells(table[0] ?? "").map((cell) => cell.replaceAll("`", ""));
  const top = cells(table[2] ?? "");
  const tableOk =
    header[0] === manifest.name &&
    header.length === names.length + 1 &&
    top[0] === build.cli &&
    header.slice(1).every((name, i) => top[i + 1] === build.compat[name]);

  if (!tableOk) {
    throw new Error(
      "packages/cli/README.md: the stamped compat table's top row does not describe this build.\n" +
        `  expected: ${build.cli} → ${JSON.stringify(build.compat)}\n` +
        `  found:    ${JSON.stringify(table.slice(0, 3))}\n` +
        "Run `node packages/cli/scripts/stamp-compat.ts` to re-render it.",
    );
  }

  process.stdout.write(`compat ok (release): ${build.cli} → ${JSON.stringify(build.compat)}\n`);
} else {
  if (manifest.renovateCompatibility !== undefined) {
    throw new Error(
      "packages/cli/package.json: renovateCompatibility is a release artefact —\n" +
        "stamp-compat.ts writes it while publishing, and the repository copy must\n" +
        "not carry it. Remove the field.",
    );
  }

  const stray = between.filter((line) => line.trimStart().startsWith("|"));

  if (stray.length > 0) {
    throw new Error(
      "packages/cli/README.md: a rendered compat table is sitting in the repository copy.\n" +
        "The table is rendered between the markers while publishing, from the registry's\n" +
        "record of published versions (scripts/stamp-compat.ts). Remove the rendered rows.",
    );
  }

  process.stdout.write(`compat ok: renovate pinned at ${build.compat["renovate"]}\n`);
}
