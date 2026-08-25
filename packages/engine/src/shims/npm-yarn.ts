/**
 * Browser stub for renovate/dist/modules/manager/npm/extract/yarn.js, whose
 * real implementation drags @yarnpkg/core + @yarnpkg/parsers in at module
 * scope (roadmap 078). The entry points that can run during npm's single-file
 * extract return upstream's own answers for their inputs, not invented ones:
 *
 * - `isZeroInstall` reads .yarnrc.yml for a zero-install marker — without a
 *   parseable yarn config (parseSyml is @yarnpkg/parsers) the answer is false.
 * - `extractYarnCatalogs` resolves yarn catalog: protocol deps from plain
 *   package.json data — no yarn library involved upstream either, so this one
 *   is the REAL logic: renovate's own extractCatalogDeps plus the sibling
 *   yarn.lock check through the same fs the manager reads.
 * - `getYarnLock` cannot parse a lockfile here, so it gives upstream's own
 *   parse-failure answer (`isYarn1: true`), and `getYarnVersionFromLock` is
 *   upstream's pure mapping, copied.
 *
 * The lockfile readers only run on the multi-file postExtract path, which the
 * single-file extraction deliberately skips.
 */
import type { PackageDependency } from "../renovate-adapter";
import { getSiblingFileName, localPathExists } from "./fs";
import { extractCatalogDeps } from "./renovate-internals";

export function isZeroInstall(_yarnrcYmlPath: string): Promise<boolean> {
  return Promise.resolve(false);
}

interface YarnCatalogs {
  catalog?: Record<string, string>;
  catalogs?: Record<string, Record<string, string>>;
}

/** Upstream's shape, upstream's data path: the catalogs come from the parsed
 *  package.json, so nothing here needs a yarn library. */
export async function extractYarnCatalogs(
  catalogs: YarnCatalogs,
  packageFile: string,
  hasPackageManager: boolean,
): Promise<{
  deps: PackageDependency[];
  managerData: { yarnLock?: string; hasPackageManager: boolean };
}> {
  const yarnCatalogs: { name: string; dependencies: Record<string, string> }[] = [];
  if (catalogs.catalog !== undefined) {
    yarnCatalogs.push({ name: "default", dependencies: catalogs.catalog });
  }
  for (const [name, dependencies] of Object.entries(catalogs.catalogs ?? {})) {
    yarnCatalogs.push({ name, dependencies });
  }
  const deps = extractCatalogDeps(yarnCatalogs, "yarn");
  const filePath = getSiblingFileName(packageFile, "yarn.lock");
  const yarnLock = (await localPathExists(filePath)) ? filePath : undefined;
  return {
    deps,
    managerData: { ...(yarnLock === undefined ? {} : { yarnLock }), hasPackageManager },
  };
}

export function getYarnLock(_filePath: string): Promise<{
  isYarn1: boolean;
  lockfileVersion?: number;
  lockedVersions: Record<string, string>;
}> {
  // Upstream's own answer when the lockfile cannot be parsed.
  return Promise.resolve({ isYarn1: true, lockedVersions: {} });
}

/** Upstream's pure mapping, copied verbatim. */
export function getYarnVersionFromLock(lockfile: {
  isYarn1: boolean;
  lockfileVersion?: number;
}): string {
  const { lockfileVersion, isYarn1 } = lockfile;
  if (isYarn1) {
    return "^1.22.18";
  }
  if (lockfileVersion !== undefined && lockfileVersion >= 12) {
    return ">=4.0.0";
  }
  if (lockfileVersion !== undefined && lockfileVersion >= 10) {
    return "^4.0.0";
  }
  if (lockfileVersion !== undefined && lockfileVersion >= 8) {
    return "^3.0.0";
  }
  if (lockfileVersion !== undefined && lockfileVersion >= 6) {
    return "^2.2.0";
  }
  return "^2.0.0";
}

export function getZeroInstallPaths(_yarnrcYml: string): string[] {
  return [];
}
