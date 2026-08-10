#!/usr/bin/env node
/**
 * Roadmap 067: write the compat row for the version being released.
 *
 * Runs in semantic-release's `prepare`, after `tools/release/prepare.ts` has
 * stamped the version and before `build` runs `check-compat.ts` against it.
 * The row's three cells are all facts about the tree — the CLI version, the
 * engine version, the exact `renovate` pin — so there is nothing here for a
 * human to get wrong, and nothing that has to be remembered at release time.
 *
 * Idempotent: re-running it after a failed release step replaces that
 * version's row instead of adding a second one.
 */
import { currentBuild, writeRow } from "./compat-table.ts";

const row = currentBuild();
const changed = writeRow(row);

process.stdout.write(
  `${changed ? "stamped" : "compat row already current"}: | ${row.join(" | ")} |\n`,
);
