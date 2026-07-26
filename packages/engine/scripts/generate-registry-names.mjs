#!/usr/bin/env node
/**
 * Roadmap 047 — regenerates `src/registry-names.generated.ts` from Renovate's
 * own datasource/manager registries.
 *
 * This script — and ONLY this script — is allowed to import
 * `renovate/dist/modules/{datasource,manager}/api.js` directly. Both modules
 * are `Map<name, implementation>` literals that eagerly `require` every
 * datasource/manager implementation the moment the module is loaded. Doing
 * that from `renovate-adapter.ts` (which the browser bundle pulls in whole)
 * reintroduces the exact datasource/http/git/exec/AWS dependency subtree that
 * `shims/datasource-index.ts` deliberately stubs out of the browser build —
 * that's what broke `pnpm build` the first time this was tried. Running the
 * lookup here, in plain Node, and writing the resulting name lists to a
 * static generated module keeps that subtree out of the browser graph
 * entirely while still surfacing Renovate's real registry names.
 *
 * Run: `pnpm --filter @renovate-config-visualizer/engine generate:registries`
 * after every Renovate version bump. `test/registries.node.test.ts` guards
 * against forgetting — it re-imports the real api.js maps (itself running in
 * Node, so this is safe there) and fails if the generated lists have drifted.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import datasources from "renovate/dist/modules/datasource/api.js";
import managers from "renovate/dist/modules/manager/api.js";
import pkg from "renovate/package.json" with { type: "json" };

const outPath = fileURLToPath(new URL("../src/registry-names.generated.ts", import.meta.url));

/** Explicit comparator (matches the default for strings) — oxlint's
 *  type-aware `require-array-sort-compare` rule can't infer the element type
 *  in a plain, tsconfig-excluded .mjs script the way it can in `.ts` sources. */
const compareStrings = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const datasourceNames = [...datasources.keys()].toSorted(compareStrings);
const managerNames = [...managers.keys()].toSorted(compareStrings);

const contents = `/**
 * GENERATED FILE — do not hand-edit.
 *
 * Produced by \`scripts/generate-registry-names.mjs\` from renovate@${pkg.version}'s
 * own datasource/manager registries (\`renovate/dist/modules/{datasource,manager}/api.js\`).
 * Regenerate with \`pnpm --filter @renovate-config-visualizer/engine generate:registries\`
 * after bumping the \`renovate\` dependency — see that script's header for why
 * this is a build-time snapshot rather than a runtime import.
 */

export const DATASOURCE_NAMES: readonly string[] = ${JSON.stringify(datasourceNames, null, 2)};

export const MANAGER_NAMES: readonly string[] = ${JSON.stringify(managerNames, null, 2)};
`;

writeFileSync(outPath, contents);
console.log(
  `Wrote ${datasourceNames.length} datasource names and ${managerNames.length} manager names to ${outPath}`,
);
