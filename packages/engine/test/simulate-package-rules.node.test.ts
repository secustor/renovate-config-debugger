/**
 * Golden twin of simulate-package-rules.shimmed.test.ts: the same oracle
 * parity against Renovate's real `applyPackageRules`, but through untouched
 * renovate modules (no shims) — proving the simulator replicates upstream
 * behavior, not an artifact of the browser module graph.
 */
import { applyPackageRules } from "renovate/dist/util/package-rules/index.js";
import { describe, expect, it } from "vitest";
import type { DependencyDescriptor } from "../src/index";
import { runPipeline, simulatePackageRules } from "../src/index";
import { must, npmDep, oracleFlatten, oracleInput } from "./helpers";

describe("simulatePackageRules (golden)", () => {
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
        { matchJsonata: ["manager = 'npm'"], addLabels: ["via-jsonata"] },
      ],
    };
    const dep: DependencyDescriptor = {
      ...npmDep,
      currentVersionTimestamp: "2020-01-01T00:00:00.000Z",
    };
    const simulated = await simulatePackageRules({ config, dep });
    const oracle = await applyPackageRules(oracleInput(config, dep));
    expect(simulated.rawFinalConfig).toEqual(oracle);
    expect(oracle.groupSlug).toBe("my-npm-packages");
    expect(oracle.datasource).toBe("github-tags");
    expect(oracle.skipReason).toBe("package-rules");
    expect(oracle.addLabels).toEqual(["all-but-react", "via-jsonata"]);
  });

  /**
   * The golden twin of the shimmed suite's "distinguishes a real mismatch from
   * a fail-closed missing input" case, with the same assertions on
   * `missingInputs`: a summary computed in the browser module graph and a
   * summary computed off untouched Renovate modules have to be the same
   * document, or it is describing the shims rather than Renovate.
   */
  it("summarizes the fail-closed missing input, and only it (oracle parity)", async () => {
    const config = {
      packageRules: [{ matchSourceUrls: ["https://github.com/facebook/react"], labels: ["fb"] }],
    };

    // sourceUrl set but different → a genuine no-match against a named input.
    const mismatch = await simulatePackageRules({
      config,
      dep: { ...npmDep, sourceUrl: "https://github.com/react/react" },
    });
    expect(mismatch.rules[0]?.verdict).toBe("no-match");
    expect(mismatch.rules[0]?.clauses[0]?.state).toBe("no-match");
    expect(mismatch.missingInputs).toEqual({ rules: 0, groups: [] });

    // sourceUrl absent → upstream's `if (!sourceUrl) return false` fail-closed
    // branch: the same rule-level verdict, summarized on the result.
    const missing = await simulatePackageRules({ config, dep: npmDep });
    expect(missing.rules[0]?.verdict).toBe("no-match");
    expect(missing.rules[0]?.clauses[0]?.state).toBe("no-input");
    expect(missing.missingInputs.rules).toBe(1);
    expect(missing.missingInputs.groups).toEqual([
      {
        fields: ["sourceUrl"],
        fieldList: "sourceUrl",
        selectors: ["matchSourceUrls"],
        rules: 1,
        sampleRuleIndexes: [0],
      },
    ]);
    expect(missing.missingInputs.note).toBe(
      "1 of 1 rule could not match because the simulated dependency has no sourceUrl — " +
        "Renovate treats a missing value as a non-match. Set sourceUrl on the dependency if " +
        "you expected these rules to fire.",
    );

    // …and the descriptive field changed no verdict: both sides still equal
    // what real applyPackageRules returns.
    for (const [dep, sim] of [
      [{ ...npmDep, sourceUrl: "https://github.com/react/react" }, mismatch],
      [npmDep, missing],
    ] as const) {
      const oracle = await applyPackageRules(oracleInput(config, dep));
      expect(sim.rawFinalConfig).toEqual(oracle);
    }
  });

  it("flattens config[updateType] up, matching upstream (oracle parity)", async () => {
    const config = {
      packageRules: [
        {
          matchPackageNames: ["lodash"],
          automerge: false,
          minor: { automerge: true, addLabels: ["auto"] },
        },
      ],
    };
    const dep: DependencyDescriptor = { ...npmDep, updateType: "minor" };
    const simulated = await simulatePackageRules({ config, dep });
    const oracle = oracleFlatten(await applyPackageRules(oracleInput(config, dep)));
    // the update-type block merged up exactly as Renovate computes it
    expect(oracle.automerge).toBe(true);
    expect(oracle.addLabels).toEqual(["auto"]);
    expect(oracle).not.toHaveProperty("minor");
    // and the simulator's flattened result agrees
    expect(simulated.finalDependencyConfig.automerge).toBe(oracle.automerge);
    expect(simulated.finalDependencyConfig.addLabels).toEqual(oracle.addLabels);
    expect(simulated.finalDependencyConfig).not.toHaveProperty("minor");
    expect(simulated.flattened.updateType).toBe("minor");
    expect(simulated.flattened.merged.map((m) => m.key).toSorted()).toEqual([
      "addLabels",
      "automerge",
    ]);
  });

  it("agrees with upstream on exclusion patterns and rule order", async () => {
    const config = {
      packageRules: [
        { matchPackageNames: ["*", "!lodash"], labels: ["not-lodash"] },
        { matchManagers: ["npm"], automerge: false },
        { matchDatasources: ["npm"], automerge: true },
      ],
    };
    const simulated = await simulatePackageRules({ config, dep: npmDep });
    const oracle = await applyPackageRules(oracleInput(config, npmDep));
    expect(simulated.rawFinalConfig).toEqual(oracle);
    expect(simulated.rules.map((r) => r.verdict)).toEqual(["no-match", "matched", "matched"]);
    expect(oracle.automerge).toBe(true);
  });
});

/**
 * `extends: ["group:…"]` INSIDE a packageRules entry — the construct Renovate's
 * validator warns about (`you should not extend "group:" presets`). Preset
 * resolution leaves the rule shaped `{ packageRules: [innerGroupRule],
 * <userOptions> }`, i.e. a rule whose only matcher-carrying content sits one
 * level down, and it has been claimed that the debugger "hoists" that inner
 * body where a real run would ignore it. It does not — the flattening is
 * Renovate's own, and these tests pin both halves of why with real
 * `applyPackageRules` as the oracle:
 *
 * 1. A real repo run never reaches `applyPackageRules` with the nested shape.
 *    Upstream `mergeRenovateConfig` re-migrates the RESOLVED config ("Resolved
 *    config needs migrating"), and `migrateConfig`'s own flatten block
 *    (`mergeChildConfig(packageRule, subrule)` + `delete
 *    combinedRule.packageRules`) merges every nested rule into its parent.
 *    `pipeline.ts` runs that same second migration in the same position, so the
 *    effective config the simulator is handed is already flattened — by
 *    Renovate's code, not by the simulator's.
 * 2. Should such a rule reach the simulator anyway (an effective config that
 *    never went through migration), the simulator still reproduces upstream
 *    exactly: with no top-level `match*` clause `matchesRule` returns true for
 *    EVERY dependency (every matcher returns null and is skipped), only the
 *    rule's own top-level options merge, and the nested `packageRules` array is
 *    inert for matching — `applyPackageRules` iterates the snapshot it was
 *    handed and never descends into it.
 */
describe("simulatePackageRules with a `group:` preset extended inside a rule (golden)", () => {
  const brokenConfig = JSON.stringify({
    $schema: "https://docs.renovatebot.com/renovate-schema.json",
    extends: ["config:recommended"],
    packageRules: [{ extends: ["group:jacksonMonorepo"], minimumGroupSize: 5 }],
  });

  /** In the extended group. */
  const jacksonDep: DependencyDescriptor = {
    manager: "gradle",
    datasource: "maven",
    packageName: "com.fasterxml.jackson.core:jackson-databind",
    sourceUrl: "https://github.com/FasterXML/jackson-databind",
    currentValue: "2.15.0",
    newValue: "2.16.0",
    updateType: "minor",
  };
  /** Not in the extended group — the misconfiguration's blast radius, if any. */
  const reactDep: DependencyDescriptor = {
    manager: "npm",
    datasource: "npm",
    packageName: "react",
    sourceUrl: "https://github.com/facebook/react",
    currentValue: "17.0.0",
    newValue: "18.0.0",
    updateType: "major",
  };

  async function resolveBroken(): Promise<Record<string, unknown>> {
    const run = await runPipeline({ fileName: "renovate.json", content: brokenConfig });
    expect(run.stageStatus.preset).toBe("ok");
    return must(run.finalConfig, "a resolved effective config");
  }

  it("resolves to a FLATTENED rule — upstream's post-preset re-migration, plus the validator's warning", async () => {
    const run = await runPipeline({ fileName: "renovate.json", content: brokenConfig });
    expect(run.warnings).toContainEqual({
      topic: "Configuration Warning",
      message: 'packageRules[0].extends: you should not extend "group:" presets',
    });
    const config = must(run.finalConfig, "a resolved effective config");
    const rules = config.packageRules;
    if (!Array.isArray(rules)) {
      throw new Error("expected the resolved config to carry packageRules");
    }
    const objectRules = rules.filter(
      (rule): rule is Record<string, unknown> =>
        typeof rule === "object" && rule !== null && !Array.isArray(rule),
    );
    // Nothing survives nested: migrateConfig's flatten block ran on the
    // resolved config, exactly as mergeRenovateConfig does upstream.
    expect(objectRules.some((rule) => "packageRules" in rule)).toBe(false);
    const authored = objectRules.filter((rule) => rule.minimumGroupSize === 5);
    expect(authored).toHaveLength(1);
    const flattened = must(authored[0], "the flattened jackson rule");
    // The group preset's body is IN the rule now — matchers and groupName both.
    expect(flattened.groupName).toBe("jackson monorepo");
    expect(flattened.matchSourceUrls).toContain("https://github.com/FasterXML/jackson-databind");
  });

  it("agrees with real applyPackageRules for an in-group and an unrelated dependency", async () => {
    const config = await resolveBroken();
    for (const dep of [jacksonDep, reactDep]) {
      const oracle = await applyPackageRules(oracleInput(config, dep));
      const simulated = await simulatePackageRules({ config, dep });
      expect(simulated.rawFinalConfig).toEqual(oracle);
    }
    // The scoping is real, not a simulator artifact: only the jackson dep picks
    // up the rule's option, so the misconfiguration has no global blast radius.
    const jacksonOracle = await applyPackageRules(oracleInput(config, jacksonDep));
    const reactOracle = await applyPackageRules(oracleInput(config, reactDep));
    expect(jacksonOracle.minimumGroupSize).toBe(5);
    expect(reactOracle.minimumGroupSize).not.toBe(5);
  });

  it("stays oracle-faithful when a nested rule reaches it un-migrated: match-all, nested array inert", async () => {
    const config = {
      groupSlug: "pre-existing",
      packageRules: [
        {
          minimumGroupSize: 5,
          packageRules: [
            {
              matchSourceUrls: ["https://github.com/FasterXML/jackson-databind"],
              groupName: "jackson monorepo",
            },
          ],
        },
      ],
    };
    for (const dep of [jacksonDep, reactDep]) {
      const oracle = await applyPackageRules(oracleInput(config, dep));
      const simulated = await simulatePackageRules({ config, dep });
      expect(simulated.rawFinalConfig).toEqual(oracle);
      const rule = must(simulated.rules[0], "the nested rule's evaluation");
      // No top-level match* clause at all — so nothing to report, and upstream
      // matches every dependency.
      expect(rule.clauses).toEqual([]);
      expect(rule.verdict).toBe("matched");
      // The nested body is NOT hoisted by either side: the outer option applies
      // and the inner rule's groupName never lands.
      expect(oracle.minimumGroupSize).toBe(5);
      expect(oracle.groupName).toBeUndefined();
      expect(simulated.finalDependencyConfig.minimumGroupSize).toBe(5);
      expect(simulated.finalDependencyConfig.groupName).toBeUndefined();
    }
  });
});
