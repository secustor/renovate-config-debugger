/**
 * Shimmed-project tests for the roadmap 006 packageRules simulator. The
 * strongest assertion is oracle parity: for rules without matchConfidence the
 * simulator's rawFinalConfig must equal what Renovate's REAL
 * `applyPackageRules` computes over the same input (run through the same
 * shimmed module graph). A golden twin (simulate-package-rules.node.test.ts)
 * asserts the same parity unshimmed.
 */
import { mergeChildConfig } from "renovate/dist/config/utils.js";
import { applyPackageRules } from "renovate/dist/util/package-rules/index.js";
import { describe, expect, it } from "vitest";
import type { DependencyDescriptor } from "../src/index";
import { simulatePackageRules } from "../src/index";

/** The update-type blocks upstream `flattenUpdates` merges up and then drops. */
const UPDATE_TYPE_KEYS = [
  "major",
  "minor",
  "patch",
  "pin",
  "digest",
  "lockFileMaintenance",
  "replacement",
];

/**
 * The oracle for the 012 update-type flattening step: exactly upstream's two
 * lines in `flattenUpdates` after `applyPackageRules` — merge `config[updateType]`
 * up, then delete every update-type block.
 */
function oracleFlatten(raw: Record<string, unknown>): Record<string, unknown> {
  const updateType = typeof raw.updateType === "string" ? raw.updateType : undefined;
  const block = updateType !== undefined ? raw[updateType] : undefined;
  const out =
    block && typeof block === "object"
      ? (mergeChildConfig(raw, block as Record<string, unknown>) as Record<string, unknown>)
      : { ...raw };
  for (const key of UPDATE_TYPE_KEYS) {
    delete out[key];
  }
  return out;
}

/** Strip a raw config to the display config exactly as the simulator does. */
function toDisplay(
  raw: Record<string, unknown>,
  dep: DependencyDescriptor,
): Record<string, unknown> {
  const depFields: Record<string, unknown> = { ...dep, depName: dep.depName ?? dep.packageName };
  const out = { ...raw };
  delete out.packageRules;
  for (const [key, value] of Object.entries(depFields)) {
    if (value !== undefined && key in out && JSON.stringify(out[key]) === JSON.stringify(value)) {
      delete out[key];
    }
  }
  return out;
}

const npmDep: DependencyDescriptor = {
  manager: "npm",
  datasource: "npm",
  packageName: "lodash",
  depType: "dependencies",
  packageFile: "package.json",
  currentValue: "4.17.20",
  newValue: "4.17.21",
  updateType: "patch",
  versioning: "semver",
};

/** The PackageRuleInputConfig the way the simulator builds it, for the oracle. */
function oracleInput(
  config: Record<string, unknown>,
  dep: DependencyDescriptor,
): Record<string, unknown> {
  return { ...config, ...dep, depName: dep.depName ?? dep.packageName };
}

describe("simulatePackageRules", () => {
  it("reports clause tri-state: matched, no-match, and absent clauses omitted", async () => {
    const config = {
      packageRules: [
        { matchPackageNames: ["lodash"], matchDatasources: ["npm"], automerge: true },
        { matchPackageNames: ["react"], labels: ["react"] },
      ],
    };
    const result = await simulatePackageRules({ config, dep: npmDep });
    expect(result.rules).toHaveLength(2);

    const [first, second] = result.rules;
    expect(first?.verdict).toBe("matched");
    // registry order: datasources before package names
    expect(first?.clauses.map((c) => [c.key, c.state])).toEqual([
      ["matchDatasources", "matched"],
      ["matchPackageNames", "matched"],
    ]);
    expect(first?.clauses[1]?.inputValues).toEqual({ packageName: "lodash" });
    expect(first?.merged?.some((m) => m.key === "automerge" && m.after === true)).toBe(true);

    expect(second?.verdict).toBe("no-match");
    expect(second?.clauses).toEqual([
      expect.objectContaining({ key: "matchPackageNames", state: "no-match" }),
    ]);
    expect(second?.merged).toBeUndefined();

    expect(result.finalDependencyConfig.automerge).toBe(true);
    expect(result.finalDependencyConfig).not.toHaveProperty("labels");
    expect(result.finalDependencyConfig).not.toHaveProperty("packageRules");
    // unchanged synthetic dep fields are stripped from the display config
    expect(result.finalDependencyConfig).not.toHaveProperty("packageName");
  });

  it("honors !-prefixed exclusion patterns inside match* arrays", async () => {
    const config = {
      packageRules: [{ matchPackageNames: ["*", "!lodash"], labels: ["not-lodash"] }],
    };
    const excluded = await simulatePackageRules({ config, dep: npmDep });
    expect(excluded.rules[0]?.verdict).toBe("no-match");

    const other = await simulatePackageRules({
      config,
      dep: { ...npmDep, packageName: "react", depName: undefined },
    });
    expect(other.rules[0]?.verdict).toBe("matched");
    expect(other.rawFinalConfig.labels).toEqual(["not-lodash"]);
  });

  it("evaluates matchCurrentVersion ranges through the real versioning modules", async () => {
    const config = {
      packageRules: [
        { matchCurrentVersion: "<5", labels: ["below-5"] },
        { matchCurrentVersion: "<4", labels: ["below-4"] },
      ],
    };
    const result = await simulatePackageRules({ config, dep: npmDep });
    expect(result.rules[0]?.verdict).toBe("matched");
    expect(result.rules[1]?.verdict).toBe("no-match");
    expect(result.rawFinalConfig.labels).toEqual(["below-5"]);
  });

  it("reports conda versioning as a clause error (WASM parser shimmed out of the browser)", async () => {
    const config = {
      packageRules: [{ matchCurrentVersion: ">=1.0", labels: ["conda"] }],
    };
    const result = await simulatePackageRules({
      config,
      dep: { ...npmDep, versioning: "conda", currentValue: "1.2.3" },
    });
    expect(result.rules[0]?.verdict).toBe("no-match");
    const clause = result.rules[0]?.clauses[0];
    expect(clause?.state).toBe("error");
    expect(clause?.note).toMatch(/conda versioning is not supported in the browser/);
  });

  it("matches bump updates via matchUpdateTypes + isBump", async () => {
    const config = { packageRules: [{ matchUpdateTypes: ["bump"], automerge: true }] };
    const bump = await simulatePackageRules({
      config,
      dep: { ...npmDep, updateType: "minor", isBump: true },
    });
    expect(bump.rules[0]?.verdict).toBe("matched");

    const plain = await simulatePackageRules({
      config,
      dep: { ...npmDep, updateType: "minor" },
    });
    expect(plain.rules[0]?.verdict).toBe("no-match");
  });

  it("merges multiple matching rules cumulatively, in order", async () => {
    const config = {
      packageRules: [
        { matchManagers: ["npm"], automerge: false, addLabels: ["from-first"] },
        { matchDatasources: ["npm"], automerge: true, addLabels: ["from-second"] },
      ],
    };
    const result = await simulatePackageRules({ config, dep: npmDep });
    expect(result.rules.map((r) => r.verdict)).toEqual(["matched", "matched"]);
    // scalar: the later rule wins; mergeable list: concatenated in order
    expect(result.rawFinalConfig.automerge).toBe(true);
    expect(result.rawFinalConfig.addLabels).toEqual(["from-first", "from-second"]);
    const second = result.rules[1];
    expect(second?.merged?.find((m) => m.key === "automerge")).toEqual({
      key: "automerge",
      before: false,
      after: true,
    });
  });

  it("reports matchConfidence rules as not simulated instead of deciding them", async () => {
    const config = {
      packageRules: [
        {
          matchConfidence: ["high"],
          matchPackageNames: ["lodash"],
          automerge: true,
        },
      ],
    };
    const result = await simulatePackageRules({ config, dep: npmDep });
    expect(result.rules[0]?.verdict).toBe("not-simulated");
    const clause = result.rules[0]?.clauses.find((c) => c.key === "matchConfidence");
    expect(clause?.state).toBe("not-simulated");
    expect(clause?.note).toMatch(/Merge Confidence API token/);
    // the rule never merges, and the caveat is surfaced at result level
    expect(result.rawFinalConfig.automerge).toBeUndefined();
    expect(result.notes.some((n) => n.includes("MISSING_API_CREDENTIALS"))).toBe(true);
  });

  it("reports a null-returning clause as not-applicable (skipped), like upstream", async () => {
    const config = {
      packageRules: [
        {
          matchPackageNames: ["lodash"],
          matchCurrentAge: "gibberish",
          labels: ["aged"],
        },
      ],
    };
    const result = await simulatePackageRules({
      config,
      dep: { ...npmDep, currentVersionTimestamp: "2020-01-01T00:00:00.000Z" },
    });
    const clause = result.rules[0]?.clauses.find((c) => c.key === "matchCurrentAge");
    expect(clause?.state).toBe("not-applicable");
    // upstream skips null even for present clauses — the rule still matches
    expect(result.rules[0]?.verdict).toBe("matched");
    expect(result.rawFinalConfig.labels).toEqual(["aged"]);
  });

  it("distinguishes a real mismatch (no-match) from a fail-closed missing input (no-input)", async () => {
    const config = {
      packageRules: [{ matchSourceUrls: ["https://github.com/facebook/react"], labels: ["fb"] }],
    };

    // sourceUrl set but different → a genuine no-match against a named input.
    const mismatch = await simulatePackageRules({
      config,
      dep: { ...npmDep, sourceUrl: "https://github.com/react/react" },
    });
    const mismatchClause = mismatch.rules[0]?.clauses[0];
    expect(mismatchClause?.state).toBe("no-match");
    expect(mismatchClause?.inputValues).toEqual({ sourceUrl: "https://github.com/react/react" });
    expect(mismatch.rules[0]?.verdict).toBe("no-match");

    // sourceUrl absent → upstream's `if (!sourceUrl) return false` fail-closed
    // branch: reported as no-input, naming the missing field, still no-match.
    const missing = await simulatePackageRules({ config, dep: npmDep });
    const missingClause = missing.rules[0]?.clauses[0];
    expect(missingClause?.state).toBe("no-input");
    expect(missingClause?.inputValues).toEqual({});
    expect(missingClause?.readFields).toContain("sourceUrl");
    expect(missingClause?.note).toMatch(
      /evaluated false — the simulated dependency has no sourceUrl \(Renovate treats a missing value as a non-match\)/,
    );
    expect(missing.rules[0]?.verdict).toBe("no-match");

    // oracle parity is unaffected by the finer reporting.
    for (const [dep, sim] of [
      [{ ...npmDep, sourceUrl: "https://github.com/react/react" }, mismatch],
      [npmDep, missing],
    ] as const) {
      const oracle = await applyPackageRules(oracleInput(config, dep));
      expect(sim.rawFinalConfig).toEqual(oracle);
    }
  });

  it("evaluates matchJsonata against the whole input config", async () => {
    const config = {
      schedule: ["before 5am"],
      packageRules: [{ matchJsonata: ["manager = 'npm' and schedule"], labels: ["jsonata"] }],
    };
    const result = await simulatePackageRules({ config, dep: npmDep });
    expect(result.rules[0]?.verdict).toBe("matched");
    expect(result.rawFinalConfig.labels).toEqual(["jsonata"]);
  });

  it("matches Renovate's real applyPackageRules output (oracle parity)", async () => {
    const config = {
      groupSlug: "pre-existing",
      enabled: true,
      packageRules: [
        { matchPackageNames: ["*", "!react"], addLabels: ["all-but-react"] },
        { matchCurrentVersion: "<5", matchUpdateTypes: ["patch", "minor"], automerge: true },
        { matchDatasources: ["npm"], groupName: "My NPM Packages" },
        { matchPackageNames: ["lodash"], overrideDatasource: "github-tags", enabled: false },
        { matchCurrentAge: "gibberish", matchManagers: ["npm"], prPriority: 5 },
        { matchDepTypes: ["devDependencies"], labels: ["dev-only"] },
      ],
    };
    const dep: DependencyDescriptor = {
      ...npmDep,
      currentVersionTimestamp: "2020-01-01T00:00:00.000Z",
    };
    const simulated = await simulatePackageRules({ config, dep });
    const oracle = await applyPackageRules(oracleInput(config, dep));
    expect(simulated.rawFinalConfig).toEqual(oracle);
    // spot-check the interesting bits actually exercised the merge tail
    expect(oracle.groupSlug).toBe("my-npm-packages");
    expect(oracle.datasource).toBe("github-tags");
    expect(oracle.skipReason).toBe("package-rules");
    expect(oracle.prPriority).toBe(5);
  });

  it("flattens the update-type block, matching upstream flattenUpdates (oracle parity)", async () => {
    const config = {
      packageRules: [
        {
          matchPackageNames: ["lodash"],
          addLabels: ["deploy_pr"],
          autoApprove: true,
          automerge: false,
          minor: { automerge: true },
          patch: { automerge: true },
        },
      ],
    };

    // minor update: automerge is scoped to minor/patch, so it flattens to true.
    const minorDep: DependencyDescriptor = { ...npmDep, updateType: "minor" };
    const minor = await simulatePackageRules({ config, dep: minorDep });
    const minorOracle = oracleFlatten(await applyPackageRules(oracleInput(config, minorDep)));
    expect(minor.finalDependencyConfig).toEqual(toDisplay(minorOracle, minorDep));
    expect(minor.finalDependencyConfig.automerge).toBe(true);
    // the flattening is recorded for the UI
    expect(minor.flattened.updateType).toBe("minor");
    expect(minor.flattened.merged).toContainEqual({
      key: "automerge",
      before: false,
      after: true,
    });
    expect(Object.keys(minor.flattened.blocks).toSorted()).toEqual(["minor", "patch"]);
    // update-type blocks are dropped from the display config, like upstream
    expect(minor.finalDependencyConfig).not.toHaveProperty("minor");
    expect(minor.finalDependencyConfig).not.toHaveProperty("patch");

    // major update: no major block, so automerge stays false — the contrast
    // the persona study found impossible before flattening.
    const majorDep: DependencyDescriptor = { ...npmDep, updateType: "major" };
    const major = await simulatePackageRules({ config, dep: majorDep });
    const majorOracle = oracleFlatten(await applyPackageRules(oracleInput(config, majorDep)));
    expect(major.finalDependencyConfig).toEqual(toDisplay(majorOracle, majorDep));
    expect(major.finalDependencyConfig.automerge).toBe(false);
    expect(major.flattened.merged).toEqual([]);
    // rule-level (non-scoped) settings still apply to the major update
    expect(major.finalDependencyConfig.addLabels).toEqual(["deploy_pr"]);
    expect(major.finalDependencyConfig.autoApprove).toBe(true);
  });

  /**
   * Roadmap 038: the groupSlug derivation used to `String(groupName)` before
   * slugifying, so an object-valued groupName — trivially reachable from user
   * config — produced the nonsense slug `objectobject`. Upstream never gets
   * there: it hands groupName straight to `slugify`, which throws on a
   * non-string. The simulator now leaves groupSlug alone instead.
   */
  it("does not derive a groupSlug from a non-string groupName", async () => {
    const config = {
      groupSlug: "pre-existing",
      packageRules: [{ matchDatasources: ["npm"], groupName: { en: "My NPM Packages" } }],
    };
    const result = await simulatePackageRules({ config, dep: npmDep });
    expect(result.rules[0]?.verdict).toBe("matched");
    // the pre-existing slug survives untouched — no `objectobject`
    expect(result.rawFinalConfig.groupSlug).toBe("pre-existing");
    expect(result.rules[0]?.notes.some((n) => n.includes("groupName is not a string"))).toBe(true);

    // …and the string case still derives one, so the guard didn't disable it
    const ok = await simulatePackageRules({
      config: {
        groupSlug: "pre-existing",
        packageRules: [{ matchDatasources: ["npm"], groupName: "My NPM Packages" }],
      },
      dep: npmDep,
    });
    expect(ok.rawFinalConfig.groupSlug).toBe("my-npm-packages");
  });

  it("surfaces validateConfig messages for a bogus matcher key", async () => {
    const config = {
      packageRules: [{ matchFoo: ["x"], matchPackageNames: ["lodash"], automerge: true }],
    };
    const result = await simulatePackageRules({ config, dep: npmDep });
    const all = [...result.errors, ...result.warnings];
    expect(all.some((m) => m.message.includes("matchFoo"))).toBe(true);
    // the unknown selector is also flagged on the rule itself
    expect(result.rules[0]?.notes.some((n) => n.includes("matchFoo"))).toBe(true);
    // …but, like upstream, it does not influence matching
    expect(result.rules[0]?.verdict).toBe("matched");
  });

  it("returns an empty simulation for a config without packageRules", async () => {
    const result = await simulatePackageRules({ config: { automerge: true }, dep: npmDep });
    expect(result.rules).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.finalDependencyConfig.automerge).toBe(true);
  });
});
