/**
 * Roadmap 067: which packages a release covers, and where they live.
 *
 * "Public" is not a list maintained here — it is `private: false` in a
 * workspace manifest. Today that is `packages/cli` alone; when 056 unprivates
 * the engine it joins the release with no edit to any of this, which is the
 * point: one version number, one tag, one GitHub release, and whatever set of
 * packages currently declares itself publishable.
 *
 * `pnpm list` is the source of truth rather than a glob over `packages/*`,
 * so the answer always matches what pnpm itself considers the workspace.
 *
 * Plain Node, `node:` builtins only — these run under `node file.ts` (type
 * stripping) exactly like the agent hooks next door.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export interface WorkspacePackage {
  name: string;
  version: string;
  /** Absolute path to the package directory. */
  dir: string;
  /** Absolute path to the package's `package.json`. */
  manifest: string;
}

interface PnpmListEntry {
  name: string;
  version: string;
  path: string;
  private: boolean;
}

export const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

/** Every workspace package that is not `private` — the release's payload. */
function publicPackages(): WorkspacePackage[] {
  const raw = execFileSync("pnpm", ["list", "--recursive", "--depth", "-1", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    // pnpm writes its progress banner to stderr; only stdout is the answer.
    stdio: ["ignore", "pipe", "ignore"],
  });

  const entries = JSON.parse(raw) as PnpmListEntry[];
  return entries
    .filter((entry) => !entry.private)
    .map((entry) => ({
      name: entry.name,
      version: entry.version,
      dir: entry.path,
      manifest: join(entry.path, "package.json"),
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

/** The release's payload, or the reason there isn't one — both release scripts
 *  refuse the same way rather than publishing nothing. */
export function releasablePackages(): WorkspacePackage[] {
  const packages = publicPackages();

  if (packages.length === 0) {
    throw new Error(
      "no public workspace packages — every manifest is `private: true`, so there is nothing to release",
    );
  }

  return packages;
}

/**
 * Rewrites the `version` field in place, touching nothing else.
 *
 * A parse/serialize round-trip would reorder nothing but would still reflow
 * the file to whatever `JSON.stringify` feels like; these manifests are
 * formatted by oxfmt, and the stamped tree is thrown away with the job (067's
 * amendment: a release commits nothing back), so keeping the edit surgical is
 * what makes a `git diff` in the job readable at all.
 */
export function setVersion(pkg: WorkspacePackage, version: string): boolean {
  const before = readFileSync(pkg.manifest, "utf8");
  const after = before.replace(/^(\s*"version":\s*)"[^"]*"/m, `$1"${version}"`);

  if (after === before) {
    if (!/^\s*"version":/m.test(before)) {
      throw new Error(`${pkg.manifest} has no "version" field to stamp`);
    }
    return false;
  }

  writeFileSync(pkg.manifest, after);
  return true;
}
