/**
 * Roadmap 094 — the explanation never disagrees with the verdict: for every
 * case, `matches` equals a direct `matchRegexOrGlobList` call, and the
 * per-entry breakdown says why in upstream's own terms.
 */
import { describe, expect, it } from "vitest";
import { explainPatternMatch, parsePattern, patternListOptionNames } from "./pattern-match";
import { matchRegexOrGlobList } from "./renovate-adapter";

const CASES: [patterns: string[], input: string][] = [
  [["**quay.io/**"], "https://quay.io"],
  [["**quay.io/**"], "https://quay.io/org/image"],
  [["**/quay.io{/,}**"], "https://quay.io"],
  [["/^react/", "!react-dom"], "react"],
  [["/^react/", "!react-dom"], "react-dom"],
  [["/^react/", "!react-dom"], "@types/react"],
  [["/^REACT/"], "react"],
  [["/^REACT/i"], "react"],
  [["React"], "react"],
  [["!lodash"], "lodash"],
  [["!lodash"], "react"],
  [["*"], "anything"],
  [[], "anything"],
  [["/[/"], "["],
  [["{npm,docker}"], "docker"],
  [["@types/*"], "@types/react"],
  [["@types/*"], "@types/react/sub"],
];

describe("explainPatternMatch", () => {
  it.each(CASES)("%j against %s reports upstream's verdict", (patterns, input) => {
    const explained = explainPatternMatch(patterns, input);
    expect(explained.matches).toBe(matchRegexOrGlobList(input, patterns));
    expect(explained.entries.map((entry) => entry.pattern)).toEqual(patterns);
  });

  it("names the negative entry that blocked the list", () => {
    const explained = explainPatternMatch(["/^react/", "!react-dom"], "react-dom");
    expect(explained.matches).toBe(false);
    expect(explained.reason).toBe("blocked");
    expect(explained.entries.map((entry) => entry.hit)).toEqual([true, true]);
  });

  it("says when no positive matched, and when the list was empty", () => {
    expect(explainPatternMatch(["/^react/"], "lodash").reason).toBe("no-positive");
    expect(explainPatternMatch([], "lodash").reason).toBe("empty");
    expect(explainPatternMatch(["/^react/"], "react").reason).toBeNull();
  });

  it("suggests a rewrite only when upstream's matcher accepts it", () => {
    const [entry] = explainPatternMatch(["**quay.io/**"], "https://quay.io").entries;
    expect(entry?.hit).toBe(false);
    expect(entry?.suggestion).toBe("**/quay.io{/,}**");
    const [path] = explainPatternMatch(["**/quay.io/**"], "https://quay.io").entries;
    expect(path?.suggestion).toBe("**/quay.io{/,}**");
    const [hopeless] = explainPatternMatch(["**quay.io/**"], "https://ghcr.io").entries;
    expect(hopeless?.suggestion).toBeUndefined();
  });

  it("parses each entry the way upstream reads it", () => {
    expect(parsePattern("*")).toMatchObject({ kind: "any", negative: false });
    expect(parsePattern("/^react/")).toMatchObject({ kind: "regex", caseInsensitive: false });
    expect(parsePattern("!/^react/i")).toMatchObject({
      kind: "regex",
      negative: true,
      caseInsensitive: true,
    });
    expect(parsePattern("React")).toMatchObject({ kind: "glob", caseInsensitive: true });
    expect(parsePattern("/[/")).toMatchObject({ kind: "regex", invalid: true });
  });
});

describe("patternListOptionNames", () => {
  it("is exactly the packageRules list matchers of the pinned Renovate", () => {
    expect(patternListOptionNames()).toEqual([
      "matchBaseBranches",
      "matchCategories",
      "matchDatasources",
      "matchDepNames",
      "matchDepTypes",
      "matchFileNames",
      "matchManagers",
      "matchPackageNames",
      "matchRegistryUrls",
      "matchRepositories",
      "matchSourceUrls",
    ]);
  });
});
