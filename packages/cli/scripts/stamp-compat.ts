#!/usr/bin/env node
/**
 * Roadmap 067: write the compat row for the version being released, and
 * render the table into the README that ships.
 *
 * Runs in semantic-release's `prepare`, after `tools/release/prepare.ts` has
 * stamped the version and before `build` runs `check-compat.ts` against it.
 * The row's three cells are all facts about the tree — the CLI version, the
 * engine version, the exact `renovate` pin — so there is nothing here for a
 * human to get wrong, and nothing that has to be remembered at release time.
 *
 * Two writes: the row goes into `compat.json` (the history, which the release
 * commit carries back to main), and the whole history is rendered between the
 * README's markers (which ships in the npm tarball and deliberately does NOT
 * go back to main — the repository copy stays a template).
 *
 * Idempotent: re-running it after a failed release step replaces that
 * version's row instead of adding a second one.
 */
import { currentBuild, readHistory, stampReadme, writeHistory } from "./compat-table.ts";

const row = currentBuild();
const historyChanged = writeHistory(row);
const readmeChanged = stampReadme(readHistory());

process.stdout.write(
  `${historyChanged || readmeChanged ? "stamped" : "compat row already current"}: ` +
    `| ${row.cli} | ${row.engine} | ${row.renovate} |\n`,
);
