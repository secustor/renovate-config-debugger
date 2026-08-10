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
 * `prepare.ts` has just stamped the version, and @semantic-release/git commits
 * it only after publishing succeeds.
 */
import { execFileSync } from "node:child_process";
import { publicPackages, repoRoot } from "./workspace.ts";

const dryRun = process.argv.includes("--dry-run");

for (const pkg of publicPackages()) {
  const args = ["--filter", pkg.name, "publish", "--access", "public", "--no-git-checks"];

  if (dryRun) {
    args.push("--dry-run");
  }

  process.stdout.write(`publishing ${pkg.name}@${pkg.version}${dryRun ? " (dry run)" : ""}\n`);
  execFileSync("pnpm", args, { cwd: repoRoot, stdio: "inherit" });
}
