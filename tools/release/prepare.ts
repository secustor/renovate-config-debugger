#!/usr/bin/env node
/**
 * Roadmap 067 — semantic-release's `prepare` step: put the computed version
 * into every public package, and give each one the licence text.
 *
 * Usage: `node tools/release/prepare.ts <version>`
 *
 * One version for all of them, deliberately. The packages are cut from the
 * same tree and answer with the same embedded Renovate, so "which CLI matches
 * which engine" should never be a question a consumer has to look up — the
 * numbers are equal by construction. The cost is releasing a package that did
 * not change; at 0.x, against a repository this size, that is cheaper than a
 * compatibility matrix.
 *
 * The build is NOT run here — `release.config.mjs` chains it after this script
 * (and after `stamp-compat.ts`), because `packages/cli`'s `check-compat.ts`
 * has to see the stamped version and the freshly stamped compat row.
 *
 * Nothing commits the stamp: 067's amendment made a release change no tracked
 * file, so this tree lives for the length of the job and is thrown away.
 */
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { releasablePackages, repoRoot, setVersion } from "./workspace.ts";

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version)) {
  throw new Error(
    `usage: node tools/release/prepare.ts <version> (got ${JSON.stringify(version)})`,
  );
}

const packages = releasablePackages();

const rootLicense = join(repoRoot, "LICENSE");

if (!existsSync(rootLicense)) {
  throw new Error(`${rootLicense} is missing — AGPL-3.0-only has to travel with every tarball`);
}

for (const pkg of packages) {
  setVersion(pkg, version);

  // The licence lives once, at the root, and is copied into each tarball at
  // release time rather than duplicated in the tree (the copies are
  // gitignored). package.json states AGPL-3.0-only; the text has to be there
  // to back it up.
  copyFileSync(rootLicense, join(pkg.dir, "LICENSE"));

  process.stdout.write(`prepared ${pkg.name}@${version}\n`);
}
