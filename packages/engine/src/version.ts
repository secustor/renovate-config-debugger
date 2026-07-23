import pkg from "renovate/package.json";
import { getUpdateType, getVersioningApi } from "./renovate-adapter";

/** Version of the bundled Renovate whose code processes every config. */
export const renovateVersion: string = pkg.version;

/**
 * Roadmap 015: derive an update's `updateType` (major/minor/patch) from
 * `currentValue`/`newValue`, via the versioning scheme the simulator form's
 * own `versioning` field names — the same two upstream calls a real
 * dependency lookup makes (`lib/workers/repository/process/lookup/update-type.ts`:
 * `getMajor`/`getMinor` comparisons, falling back to `isSame` when the
 * scheme defines it) before `updateType` is ever set on a real update. Only
 * ever returns `major`/`minor`/`patch` — `pin`/`digest`/`rollback`/`bump`/
 * `replacement` are never derivable from a version pair alone and stay
 * whatever the user (or a quick-fill) set explicitly.
 *
 * Returns undefined — "can't derive, leave whatever's there alone" — when
 * either value is blank, the versioning name isn't one Renovate recognizes,
 * or either value isn't a version the scheme can parse (e.g. a range like
 * `^4.17.20`, or literal gibberish).
 */
export function deriveUpdateType(
  currentValue: string | undefined,
  newValue: string | undefined,
  versioning: string | undefined,
): "major" | "minor" | "patch" | undefined {
  const current = currentValue?.trim();
  const next = newValue?.trim();
  if (!current || !next) {
    return undefined;
  }
  let versioningApi;
  try {
    versioningApi = getVersioningApi(versioning?.trim() || undefined);
  } catch {
    // Unregistered versioning name — same as a real run, which would fail
    // config validation long before reaching this point.
    return undefined;
  }
  if (!versioningApi.isVersion(current) || !versioningApi.isVersion(next)) {
    return undefined;
  }
  return getUpdateType({}, versioningApi, current, next);
}
