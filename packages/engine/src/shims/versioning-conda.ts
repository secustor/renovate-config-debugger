/**
 * Browser stub for renovate/dist/modules/versioning/conda/index.js.
 *
 * The real conda scheme parses versions through `@baszalmstra/rattler`, a
 * Rust-compiled WebAssembly module that inlines to ~3.9 MB of the browser
 * bundle — over half the app — while every other versioning scheme combined
 * is ~0.4 MB. Since the registry (`modules/versioning/api.js`) imports the
 * scheme statically, the only way to keep the WASM out of the bundle is to
 * replace the module. The stub keeps `conda` registered so registry lookups
 * behave normally, but every API call throws an honest error; the simulator
 * surfaces it as a per-clause ⚠ error on `matchCurrentVersion`.
 */

export const id = "conda";

function unsupported(): never {
  throw new Error(
    "conda versioning is not supported in the browser build — its parser is a ~3 MB " +
      "WebAssembly module excluded to keep the bundle small. Use a different `versioning` scheme.",
  );
}

/** Every member of Renovate's VersioningApi, each honestly refusing. */
export const api = {
  isValid: unsupported,
  isVersion: unsupported,
  isSingleVersion: unsupported,
  isStable: unsupported,
  isCompatible: unsupported,
  getMajor: unsupported,
  getMinor: unsupported,
  getPatch: unsupported,
  equals: unsupported,
  isGreaterThan: unsupported,
  isLessThanRange: unsupported,
  getSatisfyingVersion: unsupported,
  minSatisfyingVersion: unsupported,
  getNewValue: unsupported,
  getPinnedValue: unsupported,
  sortVersions: unsupported,
  matches: unsupported,
  subset: unsupported,
  intersects: unsupported,
};
