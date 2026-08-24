import { describe, expect, it } from "vitest";
import { filterUserRepos, pickerReference } from "./use-repo-picker";
import type { UserRepo } from "@/platform/github-repos";

function repo(name: string): UserRepo {
  return { name, language: null, pushedAt: null, defaultBranch: "main" };
}

const REPOS = [repo("acme/webapp"), repo("acme/infra"), repo("secustor/renovate-config-debugger")];

describe("filterUserRepos", () => {
  it("passes everything through on an empty query", () => {
    expect(filterUserRepos(REPOS, "")).toEqual(REPOS);
    expect(filterUserRepos(REPOS, "   ")).toEqual(REPOS);
  });

  it("matches case-insensitive substrings of the name", () => {
    expect(filterUserRepos(REPOS, "ACME").map((r) => r.name)).toEqual([
      "acme/webapp",
      "acme/infra",
    ]);
    expect(filterUserRepos(REPOS, "renovate").map((r) => r.name)).toEqual([
      "secustor/renovate-config-debugger",
    ]);
  });

  it("keeps matching a row after picking wrote its host-qualified reference", () => {
    const picked = pickerReference("acme/webapp");
    expect(filterUserRepos(REPOS, picked).map((r) => r.name)).toEqual(["acme/webapp"]);
    expect(filterUserRepos(REPOS, `https://${picked}`).map((r) => r.name)).toEqual(["acme/webapp"]);
  });

  it("yields nothing for a reference to somebody else's repo", () => {
    expect(filterUserRepos(REPOS, "github.com/other/thing")).toEqual([]);
  });
});

describe("pickerReference", () => {
  it("host-qualifies the slug so the load pins the GitHub context", () => {
    expect(pickerReference("acme/webapp")).toBe("github.com/acme/webapp");
  });
});
