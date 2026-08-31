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
 * 2. **The job has to be able to mint an OIDC token**, unless this is a dry
 *    run. There is no npm token anywhere in this project — publishing is
 *    authenticated by npm trusted publishing, so the credential is minted per
 *    job by GitHub and the only local precondition is the `id-token: write`
 *    permission. Checking it here costs nothing and turns a failure at the
 *    very last step, with the tree already stamped and the bundle already
 *    built, into a failure before any of that happened.
 *
 * What this deliberately does NOT check is the trusted-publisher record on
 * npmjs.com — that it names this repository, this workflow file, and every
 * package being published. Only the registry can answer that, and it answers
 * at publish time with a 404.
 *
 * `RELEASE_DRY_RUN` comes from the workflow input rather than from the exec
 * plugin's template variables — the workflow owns that switch, and threading
 * it through the environment keeps it readable at both ends.
 */
import { execFileSync } from "node:child_process";
import { releasablePackages, repoRoot } from "./workspace.ts";

const dryRun = process.env.RELEASE_DRY_RUN === "true";

const packages = releasablePackages();

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

// These two are injected by Actions only when the job requests `id-token:
// write`; they are the request URL and bearer token pnpm uses to ask GitHub for
// the token npm exchanges for publish rights.
const canMintOidc = Boolean(
  process.env.ACTIONS_ID_TOKEN_REQUEST_URL && process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
);

if (!dryRun && !canMintOidc) {
  throw new Error(
    "cannot mint an OIDC token, so the publish would have nothing to authenticate with.\n" +
      "This project publishes with npm trusted publishing and holds no npm token:\n" +
      "  · in CI — the job is missing `permissions: id-token: write`\n" +
      "  · locally — a real release cannot run here; trusted publishing only works from CI.\n" +
      "    Dispatch .github/workflows/release.yml instead, or set RELEASE_DRY_RUN=true to rehearse.",
  );
}

if (process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN) {
  // Not fatal — it could be a read-only token for private dependencies — but it
  // makes a failure mode invisible. pnpm prefers the OIDC token when the
  // exchange succeeds; when it does NOT, it logs "Skipped OIDC: …" and falls
  // back to whatever credentials it can find. With no token present that
  // fallback has nothing to use and the publish fails loudly, which is what we
  // want. With one present, a broken trusted-publisher record would instead
  // publish quietly under the token and nobody would learn it is broken.
  process.stderr.write(
    "warning: an npm token is in the environment. Trusted publishing needs none," +
      " and its presence lets a failed OIDC exchange fall back to token auth silently.\n",
  );
}

process.stdout.write(
  `release covers ${packages.length} package(s): ${packages.map((pkg) => pkg.name).join(", ")}\n`,
);
