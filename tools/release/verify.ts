#!/usr/bin/env node
/**
 * Roadmap 067 — semantic-release's `verifyConditions` step.
 *
 * Two things worth failing on before any version is computed:
 *
 * 1. **A baseline tag has to exist.** With no tag matching `tagFormat`,
 *    semantic-release calls the first release `1.0.0`. This project is
 *    deliberately `0.x` (059: experimental, breaking changes in the minor), so
 *    that default would ship a stability promise nobody made — and it is
 *    silent, which is the bad part. One tag turns it back into arithmetic.
 * 2. **A publish token has to exist**, unless this is a dry run. Otherwise the
 *    run does the analysis, writes the changelog, builds the bundle, and dies
 *    at the last step with the tree half-stamped.
 *
 * `RELEASE_DRY_RUN` comes from the workflow input rather than from the exec
 * plugin's template variables — the workflow owns that switch, and threading
 * it through the environment keeps it readable at both ends.
 */
import { execFileSync } from "node:child_process";
import { publicPackages, repoRoot } from "./workspace.ts";

const dryRun = process.env.RELEASE_DRY_RUN === "true";

const packages = publicPackages();

if (packages.length === 0) {
  throw new Error(
    "no public workspace packages — every manifest is `private: true`, so there is nothing to release",
  );
}

const tags = execFileSync("git", ["tag", "--list", "v[0-9]*"], {
  cwd: repoRoot,
  encoding: "utf8",
})
  .split("\n")
  .filter((line) => line.length > 0);

if (tags.length === 0 && process.env.RELEASE_ALLOW_UNTAGGED !== "true") {
  // Numeric collation, so 0.10.0 sorts above 0.9.0 rather than below it.
  const byVersion = new Intl.Collator(undefined, { numeric: true });
  const seed =
    packages
      .map((pkg) => pkg.version)
      .toSorted((a, b) => byVersion.compare(a, b))
      .at(-1) ?? "0.1.0";
  throw new Error(
    "no `v*` tag in this repository, so semantic-release would call the first release 1.0.0.\n" +
      `This project releases 0.x on purpose. Seed the history with the version the tree already claims:\n` +
      `  git tag v${seed} <the commit that set it> && git push origin v${seed}\n` +
      "Set RELEASE_ALLOW_UNTAGGED=true only if 1.0.0 is genuinely what you want.",
  );
}

if (!dryRun && !process.env.NODE_AUTH_TOKEN && !process.env.NPM_TOKEN) {
  throw new Error(
    "no npm token in the environment (NODE_AUTH_TOKEN/NPM_TOKEN) — set the NPM_TOKEN repository secret",
  );
}

process.stdout.write(
  `release covers ${packages.length} package(s): ${packages.map((pkg) => pkg.name).join(", ")}\n`,
);
