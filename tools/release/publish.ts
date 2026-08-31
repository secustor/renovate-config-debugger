#!/usr/bin/env node
/**
 * Roadmap 067 — semantic-release's `publish` step: every public package to npm.
 *
 * Usage: `node tools/release/publish.ts [--dry-run]`
 *
 * `pnpm publish`, not `npm publish` or @semantic-release/npm: pnpm is the only
 * one of the three that rewrites `workspace:*` specifiers to real ranges while
 * packing. `packages/cli` happens to inline its workspace deps at build time
 * and so has none left in the tarball, but the next public package will not
 * necessarily, and a literal `workspace:*` in a published manifest is a broken
 * install nobody notices until someone runs it.
 *
 * `--no-git-checks` because the working tree is legitimately dirty here:
 * `prepare.ts` and `stamp-compat.ts` have just written the version and the
 * compat facts into the tree. Nothing commits them — 067's amendment made a
 * release change no tracked file — so the dirt is expected and discarded.
 *
 * No credential is passed or read. pnpm performs the npm trusted-publishing
 * exchange itself — it asks GitHub for an OIDC token and trades it with the
 * registry for short-lived publish rights on this one package. That happens
 * with no flag: pnpm's publish path enables OIDC by default. A 404 here
 * therefore means "the registry does not recognise this repository/workflow as
 * a trusted publisher for that package", not "wrong password": check the
 * package's trusted-publisher record on npmjs.com, and that it still names
 * `.github/workflows/release.yml`.
 *
 * Do NOT add `--batch`. It publishes every package in one request through a
 * code path that turns OIDC off, so the release would fall back to looking for
 * a token that does not exist.
 */
import { execFileSync } from "node:child_process";
import { releasablePackages, repoRoot } from "./workspace.ts";

const dryRun = process.argv.includes("--dry-run");

for (const pkg of releasablePackages()) {
  const args = ["--filter", pkg.name, "publish", "--access", "public", "--no-git-checks"];

  if (dryRun) {
    args.push("--dry-run");
  }

  process.stdout.write(`publishing ${pkg.name}@${pkg.version}${dryRun ? " (dry run)" : ""}\n`);
  execFileSync("pnpm", args, { cwd: repoRoot, stdio: "inherit" });
}
