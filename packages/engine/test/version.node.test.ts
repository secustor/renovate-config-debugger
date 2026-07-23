/**
 * Golden twin of version.shimmed.test.ts: roadmap 015's `deriveUpdateType`
 * against real, unshimmed renovate/dist versioning modules — including
 * oracle parity against upstream's own `getUpdateType` + `get`.
 */
import { get as getVersioningApi } from "renovate/dist/modules/versioning/index.js";
import { getUpdateType } from "renovate/dist/workers/repository/process/lookup/update-type.js";
import { describe, expect, it } from "vitest";
import { deriveUpdateType } from "../src/version";

describe("deriveUpdateType (golden)", () => {
  it("derives major/minor/patch from a semver pair, default (semver-coerced) versioning", () => {
    expect(deriveUpdateType("18.2.0", "19.2.0", undefined)).toBe("major");
    expect(deriveUpdateType("4.17.20", "4.18.0", undefined)).toBe("minor");
    expect(deriveUpdateType("4.17.20", "4.17.21", undefined)).toBe("patch");
  });

  it("respects the versioning scheme named in the form", () => {
    expect(deriveUpdateType("18.2.0", "19.2.0", "semver")).toBe("major");
    expect(deriveUpdateType("1.2.3", "1.3.0", "npm")).toBe("minor");
  });

  it("coerces manager-flavored values (docker tags) via the default scheme", () => {
    expect(deriveUpdateType("20-alpine", "22-alpine", undefined)).toBe("major");
    // matches the "GitHub Action" quick-fill's v4 -> v5
    expect(deriveUpdateType("v4", "v5", undefined)).toBe("major");
  });

  it("returns undefined when it can't confidently derive", () => {
    expect(deriveUpdateType(undefined, "1.2.3", undefined)).toBeUndefined();
    expect(deriveUpdateType("1.2.3", undefined, undefined)).toBeUndefined();
    expect(deriveUpdateType("", "1.2.3", undefined)).toBeUndefined();
    // an unparseable "regex:" versioning config throws from `get()` itself
    expect(deriveUpdateType("1.2.3", "1.2.4", "regex:(")).toBeUndefined();
    // ranges aren't versions the scheme can parse
    expect(deriveUpdateType("^4.17.20", "^4.18.0", "npm")).toBeUndefined();
  });

  it("falls back to the default scheme for an unrecognized versioning name, like upstream", () => {
    // upstream's own Versioning schema logs and falls back rather than
    // throwing for a plain unknown name (only malformed configs like
    // "regex:(" throw) — mirrored here rather than silently refusing to derive.
    expect(deriveUpdateType("1.2.3", "1.2.4", "not-a-real-scheme")).toBe("patch");
  });

  it("agrees with upstream getUpdateType + get (oracle parity)", () => {
    const cases: Array<[string, string, string | undefined]> = [
      ["18.2.0", "19.2.0", undefined],
      ["4.17.20", "4.17.21", "semver"],
      ["2.31.0", "2.32.0", "pep440"],
      ["1.0.0", "1.0.0", undefined],
    ];
    for (const [current, next, versioning] of cases) {
      const oracleApi = getVersioningApi(versioning);
      const oracle = getUpdateType({}, oracleApi, current, next);
      expect(deriveUpdateType(current, next, versioning)).toBe(oracle);
    }
  });
});
