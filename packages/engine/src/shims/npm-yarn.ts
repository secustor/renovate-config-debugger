/**
 * Browser stub for renovate/dist/modules/manager/npm/extract/yarn.js, whose
 * real implementation drags @yarnpkg/core + @yarnpkg/parsers in at module
 * scope (roadmap 078). Unlike the other extract-graph stubs these two entry
 * points DO run during npm's single-file extract, so they return the honest
 * "no yarn context" answers instead of throwing:
 *
 * - `isZeroInstall` reads .yarnrc.yml for a zero-install marker — without a
 *   yarn cache in the store the answer is false.
 * - `extractYarnCatalogs` resolves yarn catalog: protocol deps — no catalogs
 *   without a parseable yarnrc, so no extra deps.
 *
 * The lockfile readers only run on the multi-file postExtract path, which the
 * single-file extraction deliberately skips.
 */

export function isZeroInstall(_yarnrcYmlPath: string): Promise<boolean> {
  return Promise.resolve(false);
}

export function extractYarnCatalogs(): Promise<unknown[]> {
  return Promise.resolve([]);
}

export function getYarnLock(_filePath: string): Promise<{
  isYarn1: boolean;
  lockfileVersion?: number;
  lockedVersions: Record<string, string>;
}> {
  return Promise.resolve({ isYarn1: false, lockedVersions: {} });
}

export function getYarnVersionFromLock(_lockfile: unknown): string {
  return "";
}

export function getZeroInstallPaths(_yarnrcYml: string): string[] {
  return [];
}
