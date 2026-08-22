import { describe, expect, it } from "vitest";
import {
  configFileNameFor,
  extractRenovateFromPackageJson,
  parseRepoReference,
} from "./repo-reference";

describe("parseRepoReference", () => {
  it("parses a bare slug", () => {
    expect(parseRepoReference("secustor/renovate-config-debugger")).toEqual({
      host: null,
      repo: "secustor/renovate-config-debugger",
    });
  });

  it("parses a repository home URL, trailing slash and all", () => {
    expect(parseRepoReference("https://github.com/secustor/renovate-config-debugger/")).toEqual({
      host: "github.com",
      repo: "secustor/renovate-config-debugger",
    });
  });

  it("parses a blob file URL into repo + ref + path", () => {
    expect(
      parseRepoReference(
        "https://github.com/secustor/renovate-config-debugger/blob/main/renovate.json",
      ),
    ).toEqual({
      host: "github.com",
      repo: "secustor/renovate-config-debugger",
      ref: "main",
      path: "renovate.json",
    });
  });

  it("parses a nested blob path", () => {
    expect(parseRepoReference("https://github.com/o/r/blob/v2/.github/renovate.json5")).toEqual({
      host: "github.com",
      repo: "o/r",
      ref: "v2",
      path: ".github/renovate.json5",
    });
  });

  it("parses a tree (branch) URL into repo + ref, no path", () => {
    expect(parseRepoReference("https://github.com/o/r/tree/release-1.x")).toEqual({
      host: "github.com",
      repo: "o/r",
      ref: "release-1.x",
    });
  });

  it("parses a raw URL", () => {
    expect(parseRepoReference("https://github.com/o/r/raw/main/renovate.json")).toEqual({
      host: "github.com",
      repo: "o/r",
      ref: "main",
      path: "renovate.json",
    });
  });

  it("normalizes raw.githubusercontent.com to github.com", () => {
    expect(parseRepoReference("https://raw.githubusercontent.com/o/r/main/renovate.json")).toEqual({
      host: "github.com",
      repo: "o/r",
      ref: "main",
      path: "renovate.json",
    });
    expect(
      parseRepoReference("https://raw.githubusercontent.com/o/r/refs/heads/main/renovate.json"),
    ).toEqual({ host: "github.com", repo: "o/r", ref: "main", path: "renovate.json" });
  });

  it("parses a GitLab subgroup blob URL via the `-` separator", () => {
    expect(
      parseRepoReference("https://gitlab.com/group/sub/repo/-/blob/main/.gitlab/renovate.json"),
    ).toEqual({
      host: "gitlab.com",
      repo: "group/sub/repo",
      ref: "main",
      path: ".gitlab/renovate.json",
    });
    expect(parseRepoReference("https://gitlab.com/group/repo/-/tree/next")).toEqual({
      host: "gitlab.com",
      repo: "group/repo",
      ref: "next",
    });
  });

  it("parses a Gitea/Forgejo src URL, with and without the kind segment", () => {
    expect(parseRepoReference("https://codeberg.org/o/r/src/branch/main/renovate.json")).toEqual({
      host: "codeberg.org",
      repo: "o/r",
      ref: "main",
      path: "renovate.json",
    });
    expect(parseRepoReference("https://gitea.com/o/r/src/main/renovate.json")).toEqual({
      host: "gitea.com",
      repo: "o/r",
      ref: "main",
      path: "renovate.json",
    });
  });

  it("parses @ref on a bare slug and a schemeless host form", () => {
    expect(parseRepoReference("o/r@renovate-playground")).toEqual({
      host: null,
      repo: "o/r",
      ref: "renovate-playground",
    });
    expect(parseRepoReference("github.com/o/r@next")).toEqual({
      host: "github.com",
      repo: "o/r",
      ref: "next",
    });
  });

  it("parses a schemeless blob path", () => {
    expect(parseRepoReference("github.com/o/r/blob/main/renovate.json")).toEqual({
      host: "github.com",
      repo: "o/r",
      ref: "main",
      path: "renovate.json",
    });
  });

  it("still parses scp-style and .git suffixes", () => {
    expect(parseRepoReference("git@github.com:o/r.git")).toEqual({
      host: "github.com",
      repo: "o/r",
    });
    expect(parseRepoReference("o/r.git")).toEqual({ host: null, repo: "o/r" });
  });

  it("rejects non-references", () => {
    expect(parseRepoReference("")).toBeNull();
    expect(parseRepoReference("just-words")).toBeNull();
    expect(parseRepoReference("owner//repo")).toBeNull();
    expect(parseRepoReference("https://github.com/")).toBeNull();
  });
});

describe("configFileNameFor", () => {
  it("maps json5 to the json5 editor mode and everything else to json", () => {
    expect(configFileNameFor(".github/renovate.json5")).toBe("renovate.json5");
    expect(configFileNameFor("renovate.json")).toBe("renovate.json");
    expect(configFileNameFor("renovate.jsonc")).toBe("renovate.json");
    expect(configFileNameFor(".renovaterc")).toBe("renovate.json");
  });
});

describe("extractRenovateFromPackageJson", () => {
  it("extracts an object renovate key pretty-printed", () => {
    expect(extractRenovateFromPackageJson('{"renovate":{"automerge":true}}')).toBe(
      JSON.stringify({ automerge: true }, null, 2),
    );
  });

  it("turns a string value into the extends shorthand", () => {
    expect(extractRenovateFromPackageJson('{"renovate":"config:recommended"}')).toBe(
      JSON.stringify({ extends: ["config:recommended"] }, null, 2),
    );
  });

  it("is null for a missing key, a scalar, or unparseable JSON", () => {
    expect(extractRenovateFromPackageJson('{"name":"x"}')).toBeNull();
    expect(extractRenovateFromPackageJson('{"renovate":5}')).toBeNull();
    expect(extractRenovateFromPackageJson("not json")).toBeNull();
  });
});
