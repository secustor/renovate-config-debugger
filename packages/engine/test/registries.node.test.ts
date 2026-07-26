/**
 * Roadmap 047 — `listDatasourceNames`/`listManagerNames` read a generated
 * snapshot (`src/registry-names.generated.ts`) of Renovate's own datasource/
 * manager registries, not the registries themselves (importing those from
 * anywhere the browser bundle reaches drags in the datasource/http/git/exec/AWS
 * subtree `shims/datasource-index.ts` deliberately keeps out — see
 * `scripts/generate-registry-names.mjs` and `src/registries.ts` for why).
 *
 * This test is the drift guard for that snapshot: it runs in Node (this file
 * matches `test/*.node.test.ts`, the unshimmed "golden" project), so it CAN
 * safely import the real `api.js` maps directly and assert the generated
 * lists still match — a Renovate version bump that forgets to rerun
 * `generate:registries` fails here.
 */
import { describe, expect, it } from "vitest";
import { listDatasourceNames, listManagerNames } from "../src/index";

describe("listDatasourceNames", () => {
  it("returns a non-empty, sorted list of Renovate's built-in datasources", () => {
    const names = listDatasourceNames();
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual([...names].toSorted());
    for (const expected of ["npm", "docker", "github-tags", "pypi", "maven"]) {
      expect(names).toContain(expected);
    }
  });

  it("matches Renovate's real datasource registry (generated-file drift guard)", async () => {
    const { default: datasources } = await import("renovate/dist/modules/datasource/api.js");
    expect(listDatasourceNames()).toEqual([...datasources.keys()].toSorted());
  });
});

describe("listManagerNames", () => {
  it("returns a non-empty, sorted list of Renovate's built-in managers", () => {
    const names = listManagerNames();
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual([...names].toSorted());
    for (const expected of ["npm", "dockerfile", "github-actions", "gradle"]) {
      expect(names).toContain(expected);
    }
  });

  it("matches Renovate's real manager registry (generated-file drift guard)", async () => {
    const { default: managers } = await import("renovate/dist/modules/manager/api.js");
    expect(listManagerNames()).toEqual([...managers.keys()].toSorted());
  });
});
