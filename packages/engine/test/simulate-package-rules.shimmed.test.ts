/**
 * Shimmed-project tests for the roadmap 006 packageRules simulator. The
 * strongest assertion is oracle parity: for rules without matchConfidence the
 * simulator's rawFinalConfig must equal what Renovate's REAL
 * `applyPackageRules` computes over the same input (run through the same
 * shimmed module graph). A golden twin (simulate-package-rules.node.test.ts)
 * asserts the same parity unshimmed.
 */
import { applyPackageRules } from "renovate/dist/util/package-rules/index.js";
import { describe, expect, it } from "vitest";
import type { DependencyDescriptor } from "../src/index";
import { simulatePackageRules } from "../src/index";

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

  it("treats a present clause that returns null as skipped, like upstream", async () => {
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
    expect(clause?.state).toBe("invalid");
    // upstream skips null even for present clauses — the rule still matches
    expect(result.rules[0]?.verdict).toBe("matched");
    expect(result.rawFinalConfig.labels).toEqual(["aged"]);
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
