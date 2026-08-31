import { describe, expect, it } from "vitest";
import {
  type BuildIdentity,
  commitUrl,
  formatCommitTime,
  formatVersion,
  parseBuildIdentity,
  shortCommit,
  verifyCommands,
} from "./build-info";

const IDENTITY: BuildIdentity = {
  repo: "secustor/renovate-config-debugger",
  commit: "d58538fab3a0000000000000000000000000000f",
  version: "0.2.0",
  versionDistance: 0,
  commitTime: "2026-08-25T14:02:33+02:00",
};

describe("parseBuildIdentity", () => {
  it("accepts the injected shape", () => {
    expect(parseBuildIdentity({ ...IDENTITY })).toEqual(IDENTITY);
  });

  it("nulls the optional halves without dropping the identity", () => {
    expect(parseBuildIdentity({ repo: IDENTITY.repo, commit: IDENTITY.commit })).toEqual({
      repo: IDENTITY.repo,
      commit: IDENTITY.commit,
      version: null,
      versionDistance: null,
      commitTime: null,
    });
  });

  it("refuses an identity without a commit — nothing to verify", () => {
    expect(parseBuildIdentity({ repo: IDENTITY.repo, commit: null, version: "1.0.0" })).toBeNull();
    expect(parseBuildIdentity({ repo: "", commit: IDENTITY.commit })).toBeNull();
    expect(parseBuildIdentity(undefined)).toBeNull();
    expect(parseBuildIdentity("d58538f")).toBeNull();
  });
});

describe("the derived display values", () => {
  it("short sha and commit link", () => {
    expect(shortCommit(IDENTITY)).toBe("d58538f");
    expect(commitUrl(IDENTITY)).toBe(
      `https://github.com/secustor/renovate-config-debugger/commit/${IDENTITY.commit}`,
    );
  });

  it("renders the committer date in UTC, or refuses garbage", () => {
    expect(formatCommitTime("2026-08-25T14:02:33+02:00")).toBe("2026-08-25 12:02 UTC");
    expect(formatCommitTime("not a date")).toBeNull();
  });

  it("says whether the build IS the tagged release or sits after it", () => {
    expect(formatVersion(IDENTITY)).toBe("v0.2.0");
    expect(formatVersion({ ...IDENTITY, versionDistance: 3 })).toBe("v0.2.0 + 3 commits");
    expect(formatVersion({ ...IDENTITY, versionDistance: 1 })).toBe("v0.2.0 + 1 commit");
    // An unknown distance must not claim exactness IN WORDS — the bare tag is
    // today's display, no better and no worse.
    expect(formatVersion({ ...IDENTITY, versionDistance: null })).toBe("v0.2.0");
    expect(formatVersion({ ...IDENTITY, version: null })).toBeNull();
  });
});

describe("verifyCommands", () => {
  it("targets the deployment the reader is on, and the repo the build named", () => {
    const commands = verifyCommands(IDENTITY, "https://renovate.secustor.dev");
    expect(commands.attest).toContain("curl -sO https://renovate.secustor.dev/build-manifest.json");
    expect(commands.attest).toContain(
      "gh attestation verify build-manifest.json -R secustor/renovate-config-debugger",
    );
    expect(commands.rebuild).toBe(
      [
        "git clone https://github.com/secustor/renovate-config-debugger && cd renovate-config-debugger",
        `git checkout ${IDENTITY.commit}`,
        "mise install && mise run verify-build https://renovate.secustor.dev",
      ].join("\n"),
    );
  });
});
