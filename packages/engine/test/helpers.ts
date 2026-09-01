/**
 * Shared helpers for the engine test suite — used by the suites in this
 * directory AND by the colocated `src/**\/*.test.ts` ones, which is why it is
 * still here rather than beside a source module: `oracleFlatten` deep-imports
 * `renovate/dist`, and the lint fence confines that to two files under `src/`.
 */
import { mergeChildConfig } from "renovate/dist/config/utils.js";
import type { DependencyDescriptor, ExtractOutcome } from "../src/index";
import { UPDATE_TYPE_KEYS } from "../src/index";

/**
 * Roadmap 041: `typescript/no-non-null-assertion` is an error everywhere, so
 * the conventional test `!` is gone. `must` does the same narrowing but fails
 * with a sentence naming what was missing, instead of an unlabelled
 * "Cannot read properties of undefined" TypeError several lines later.
 */
export function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${what}, got ${value === null ? "null" : "undefined"}`);
  }
  return value;
}

/**
 * The same narrowing for an extraction: both twins ask for `outcome.file`
 * immediately, and a failure should name the reason rather than fail on the
 * next property read. Six copies of the same three-line guard used to.
 */
export function mustExtract(outcome: ExtractOutcome): Extract<ExtractOutcome, { ok: true }> {
  if (!outcome.ok) {
    throw new Error(`expected extraction to succeed: ${outcome.message}`);
  }
  return outcome;
}

/** Runs `fn` with fetch rejecting, so a preset that resolves to nothing fails
 *  for a reason the test owns rather than whatever api.github.com answers. */
export async function withoutNetwork<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new TypeError("network disabled in tests"));
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

/** The dependency both simulate twins run their oracle parity against: an npm
 *  patch update, every descriptor field set. */
export const npmDep: DependencyDescriptor = {
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

/** The `PackageRuleInputConfig` the way the simulator builds it, for the
 *  oracle — upstream's `applyPackageRules` takes one flat bag. */
export function oracleInput(
  config: Record<string, unknown>,
  dep: DependencyDescriptor,
): Record<string, unknown> {
  return { ...config, ...dep, depName: dep.depName ?? dep.packageName };
}

/**
 * The oracle for the 012 update-type flattening step: exactly upstream's two
 * lines in `flattenUpdates` after `applyPackageRules` — merge
 * `config[updateType]` up, then delete every update-type block.
 *
 * `UPDATE_TYPE_KEYS` comes from the engine on purpose: the engine exports it so
 * consumers stop restating the list, and an oracle that restated it could agree
 * with a wrong simulator. `mergeChildConfig` is deep-imported so the oracle uses
 * Renovate's own merge — resolved untouched in the golden project and through
 * the shim plugin in the shimmed one, exactly as each suite needs.
 */
export function oracleFlatten(raw: Record<string, unknown>): Record<string, unknown> {
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
