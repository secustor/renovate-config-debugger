/**
 * Golden twin of simulate-package-rules.shimmed.test.ts: the same oracle
 * parity against Renovate's real `applyPackageRules`, but through untouched
 * renovate modules (no shims) — proving the simulator replicates upstream
 * behavior, not an artifact of the browser module graph.
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
    const oracle = await applyPackageRules({
      ...config,
      ...dep,
      depName: dep.depName ?? dep.packageName,
    });
    expect(simulated.rawFinalConfig).toEqual(oracle);
    expect(oracle.groupSlug).toBe("my-npm-packages");
    expect(oracle.datasource).toBe("github-tags");
    expect(oracle.skipReason).toBe("package-rules");
    expect(oracle.addLabels).toEqual(["all-but-react", "via-jsonata"]);
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
    const oracle = await applyPackageRules({
      ...config,
      ...npmDep,
      depName: npmDep.packageName,
    });
    expect(simulated.rawFinalConfig).toEqual(oracle);
    expect(simulated.rules.map((r) => r.verdict)).toEqual(["no-match", "matched", "matched"]);
    expect(oracle.automerge).toBe(true);
  });
});
