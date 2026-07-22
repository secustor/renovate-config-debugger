/**
 * Browser shim for renovate/dist/modules/datasource/index.js.
 * The config pipeline never performs datasource lookups — this module is only
 * reached via util/exec/containerbase's eager dynamic import (getPkgReleases
 * for tool-version resolution during real runs). Stubbing it severs the whole
 * datasource/http/git/exec/AWS subtree from the bundle. getToolConfig's pure
 * data table (which validation DOES use) lives in containerbase and stays real.
 */
export function getDatasources(): Map<string, unknown> {
  return new Map();
}

export function getDatasourceList(): string[] {
  return [];
}

export function getDefaultConfig(): Promise<Record<string, unknown>> {
  return Promise.resolve({});
}

export function getDigest(): Promise<string | null> {
  return Promise.resolve(null);
}

export function getPkgReleases(): Promise<null> {
  return Promise.resolve(null);
}

export function getRawPkgReleases(): never {
  throw new Error("datasource lookups are not available in the browser");
}

export function isGetPkgReleasesConfig(): boolean {
  return false;
}

export function supportsDigests(): boolean {
  return false;
}

export function applyDatasourceFilters<T>(releaseResult: T): T {
  return releaseResult;
}
