/**
 * Roadmap 094: the pattern tests' pure half — the share round trip, the
 * evaluation's sentences given a matcher, and where the seed offer looks.
 * The matcher is a STUB (regex-only, `!` negates): what Renovate's own one
 * says is the engine's test; what the card says about an answer is this one.
 */
import { describe, expect, test } from "vitest";
import type { PatternListMatch, TraceResult } from "@renovate-config-debugger/engine";
import { EMPTY_REPO_DEPS } from "./repo-deps";
import { EMPTY_FORM } from "./form";
import {
  evaluatePatternTest,
  expectationFor,
  newPatternTest,
  patternChips,
  type PatternMatcher,
  patternTestShareFields,
  patternTestsFromShare,
  seedValuesFor,
} from "./pattern-tests";
import { repoDep } from "@tools/test/repo-deps";

function parse(pattern: string) {
  const negative = pattern.startsWith("!");
  const body = negative ? pattern.slice(1) : pattern;
  const regex = /^\/(.*)\/(i?)$/.exec(body);
  return {
    kind: pattern === "*" ? ("any" as const) : regex ? ("regex" as const) : ("glob" as const),
    negative,
    caseInsensitive: !regex || regex[2] === "i",
    invalid: regex?.[1] === "[",
    body:
      regex?.[1] === "["
        ? /$^/
        : regex
          ? new RegExp(regex[1] ?? "", regex[2])
          : new RegExp(`^${body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i"),
  };
}

/** Positive-OR / negative-AND, the upstream rule, over the stub's regexes. */
function explain(patterns: readonly string[], input: string): PatternListMatch {
  const entries = patterns.map((pattern) => {
    const { body, ...parsed } = parse(pattern);
    const hit = parsed.kind === "any" || body.test(input);
    return {
      ...parsed,
      pattern,
      hit,
      ...(pattern === "**quay.io/**" && input === "https://quay.io"
        ? { suggestion: "**/quay.io{/,}**" }
        : {}),
    };
  });
  const positives = entries.filter((entry) => !entry.negative);
  const blocked = entries.some((entry) => entry.negative && entry.hit);
  const matches =
    entries.length > 0 && (positives.length === 0 || positives.some((e) => e.hit)) && !blocked;
  return {
    matches,
    entries,
    reason: matches ? null : entries.length === 0 ? "empty" : blocked ? "blocked" : "no-positive",
  };
}

const matcher: PatternMatcher = {
  explain,
  parse: (pattern) => {
    const { body: _body, ...parsed } = parse(pattern);
    return parsed;
  },
  options: ["matchDepNames", "matchPackageNames"],
};

function ids(): () => string {
  let n = 0;
  return () => `pattern-${++n}`;
}

describe("share round trip", () => {
  test("the share fields are the test minus its id, and come back with a fresh id", () => {
    const test1 = {
      ...newPatternTest("pattern-9"),
      option: "matchDepNames",
      patterns: ["/^react/", "!react-dom"],
      inputs: [
        { value: "react", expect: true },
        { value: "react-dom", expect: false },
      ],
    };
    const shared = patternTestShareFields(test1);
    expect(shared).toEqual({
      option: "matchDepNames",
      patterns: ["/^react/", "!react-dom"],
      inputs: [
        { value: "react", expect: true },
        { value: "react-dom", expect: false },
      ],
    });
    expect(patternTestsFromShare([shared], ids())).toEqual([{ ...test1, id: "pattern-1" }]);
  });

  test("the decode side caps the list like the pins' cap", () => {
    const many = Array.from({ length: 30 }, () => ({
      option: "matchDepNames",
      patterns: ["react"],
      inputs: [],
    }));
    expect(patternTestsFromShare(many, ids())).toHaveLength(20);
  });
});

describe("evaluatePatternTest", () => {
  test("the header sentence counts inputs whose verdict met the expectation", () => {
    const evaluation = evaluatePatternTest(matcher, {
      patterns: ["/^react/", "!react-dom"],
      inputs: [
        { value: "react", expect: true },
        { value: "react-dom", expect: false },
        { value: "@types/react", expect: true },
      ],
    });
    expect(evaluation.summary).toBe("2 of 3 expected");
    expect(evaluation.tone).toBe("error");
    expect(evaluation.inputs.map((input) => input.pass)).toEqual([true, true, false]);
    // The negative that blocked react-dom is named on its row; the plain miss
    // for @types/react has no why — its mark says it.
    expect(evaluation.inputs[1]?.why).toBe("blocked by !react-dom");
    expect(evaluation.inputs[2]?.why).toBeNull();
  });

  test("a pattern's count is its hits over the inputs, or the inputs it blocks", () => {
    const evaluation = evaluatePatternTest(matcher, {
      patterns: ["/^react/", "!react-dom", "lodash"],
      inputs: [
        { value: "react", expect: true },
        { value: "react-dom", expect: false },
      ],
    });
    expect(evaluation.patterns.map((pattern) => pattern.count)).toEqual(["2/2", "blocks 1", "0/2"]);
    // A positive pattern no input satisfies is flagged; a negative never is.
    expect(evaluation.patterns.map((pattern) => pattern.dead)).toEqual([false, false, true]);
  });

  test("no inputs is pending, all-pass is ok", () => {
    expect(evaluatePatternTest(matcher, { patterns: ["react"], inputs: [] })).toMatchObject({
      tone: "pending",
      summary: "no inputs yet",
    });
    expect(
      evaluatePatternTest(matcher, {
        patterns: ["react"],
        inputs: [{ value: "react", expect: true }],
      }).tone,
    ).toBe("ok");
  });

  test("the upstream-verified rewrite and an invalid regex each become the row's why", () => {
    const trap = evaluatePatternTest(matcher, {
      patterns: ["**quay.io/**"],
      inputs: [{ value: "https://quay.io", expect: true }],
    });
    expect(trap.inputs[0]?.why).toBe("no match — try **/quay.io{/,}**");
    const invalid = evaluatePatternTest(matcher, {
      patterns: ["/[/"],
      inputs: [{ value: "x", expect: true }],
    });
    expect(invalid.inputs[0]?.why).toContain("/[/ is not a valid regex");
  });

  test("a new input's expectation defaults to the current verdict", () => {
    expect(expectationFor(explain, ["/^react/"], "react")).toBe(true);
    expect(expectationFor(explain, ["/^react/"], "lodash")).toBe(false);
  });
});

test("patternChips say how upstream will read the entry", () => {
  expect(
    patternChips({ kind: "glob", negative: false, caseInsensitive: true, invalid: false }),
  ).toEqual(["glob", "Aa ignored"]);
  expect(
    patternChips({ kind: "regex", negative: true, caseInsensitive: false, invalid: false }),
  ).toEqual(["regex", "Aa exact", "! negative"]);
  expect(
    patternChips({ kind: "regex", negative: false, caseInsensitive: false, invalid: true }),
  ).toEqual(["regex", "Aa exact", "invalid regex"]);
  expect(
    patternChips({ kind: "any", negative: false, caseInsensitive: true, invalid: false }),
  ).toEqual(["matches everything"]);
});

describe("seedValuesFor", () => {
  const result = { finalConfig: { baseBranches: ["main", "release/*"] } } as unknown as TraceResult;
  const pins = [
    {
      id: "pin-1",
      form: {
        ...EMPTY_FORM,
        packageName: "react",
        manager: "npm",
        registryUrls: "https://registry.npmjs.org, https://npm.pkg.github.com",
      },
    },
  ];
  const repoDeps = {
    ...EMPTY_REPO_DEPS,
    repo: "acme/webapp",
    deps: [
      repoDep("react", "package.json", "npm"),
      repoDep("nginx", "Dockerfile", "dockerfile", { fill: { datasource: "docker" } }),
    ],
    files: [
      {
        path: "package.json",
        managers: ["npm"],
        extractedBy: "npm",
        depCount: 1,
        outcome: "extracted" as const,
      },
    ],
  };

  test("draws on the pins and the loaded repository, deduplicated", () => {
    const sources = { pins, repoDeps, result };
    expect(seedValuesFor("matchPackageNames", sources)).toEqual(["react", "nginx"]);
    expect(seedValuesFor("matchManagers", sources)).toEqual(["npm"]);
    expect(seedValuesFor("matchFileNames", sources)).toEqual(["package.json", "Dockerfile"]);
    expect(seedValuesFor("matchRegistryUrls", sources)).toEqual([
      "https://registry.npmjs.org",
      "https://npm.pkg.github.com",
    ]);
    expect(seedValuesFor("matchDatasources", sources)).toEqual(["docker"]);
    expect(seedValuesFor("matchRepositories", sources)).toEqual(["acme/webapp"]);
    expect(seedValuesFor("matchBaseBranches", sources)).toEqual(["main", "release/*"]);
  });

  test("an unpicked or unknown option seeds nothing", () => {
    const sources = { pins, repoDeps, result };
    expect(seedValuesFor("", sources)).toEqual([]);
    expect(seedValuesFor("matchSomethingElse", sources)).toEqual([]);
  });
});
