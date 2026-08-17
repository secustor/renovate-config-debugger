#!/usr/bin/env node
/**
 * Roadmap 067: state the release's compatibility where it publishes.
 *
 * Runs in semantic-release's `prepare`, after `tools/release/prepare.ts` has
 * stamped the version and before `build` runs `check-compat.ts` against it.
 * Two writes, both to the working tree only — a release commits nothing back:
 *
 * - `renovateCompatibility` goes into the CLI manifest, embedded versions
 *   keyed by full package name, so the registry accumulates the release
 *   history as a side effect of publishing (readable with
 *   `pnpm view @renovate-config-debugger/cli renovateCompatibility`).
 * - The compat table is rendered between the README's markers from the
 *   registry's published rows plus this release's, so the README that ships
 *   to npm carries the full table while the repository copy stays a template.
 *
 * Every cell is a fact about the tree or the registry — nothing here for a
 * human to get wrong. Idempotent: re-running after a failed release step
 * replaces this version's row instead of stacking a second one.
 */
import {
  currentBuild,
  publishedRows,
  readCliManifest,
  stampManifest,
  stampReadme,
} from "./compat-table.ts";

const build = currentBuild();
const cliName = readCliManifest().name;
const manifestChanged = stampManifest(build);
const published = await publishedRows(cliName);
const rows = [build, ...published.filter((row) => row.cli !== build.cli)];
const readmeChanged = stampReadme(cliName, rows);

process.stdout.write(
  `${manifestChanged || readmeChanged ? "stamped" : "already current"}: ` +
    `${build.cli} → ${JSON.stringify(build.compat)} (${rows.length}-row table)\n`,
);
