import { describe, expect, it } from "vitest";
import {
  type BuildIdentity,
  commitUrl,
  formatCommitTime,
  parseBuildIdentity,
  shortCommit,
  verifyCommands,
} from "./build-info";

const IDENTITY: BuildIdentity = {
  repo: "secustor/renovate-config-debugger",
  commit: "d58538fab3a0000000000000000000000000000f",
  version: "0.2.0",
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
});

describe("verifyCommands", () => {
  it("targets the deployment the reader is on, and the repo the build named", () => {
    const commands = verifyCommands(IDENTITY, "https://renovate.secustor.dev");
    expect(commands.attest).toContain("curl -sO https://renovate.secustor.dev/build-manifest.json");
    expect(commands.attest).toContain(
      "gh attestation verify build-manifest.json -R secustor/renovate-config-debugger",
    );
    expect(commands.rebuild).toBe("node tools/verify-deployment.ts https://renovate.secustor.dev");
  });
});
