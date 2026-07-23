/**
 * Manual preset injection registry (roadmap 010) — the universal fallback for
 * presets no browser fetcher can reach (self-hosted / air-gapped hosts without
 * CORS, or hypothetical presets). The pipeline seeds it per run from the run
 * options; every preset fetcher shim consults it before hitting the network
 * and returns the user-supplied JSON if a matching entry exists.
 *
 * The registry is a module-level singleton deliberately: the shim fetchers and
 * the pipeline import this exact module, so they share one map. Keyed by a
 * canonical identity string the app can recompute from a failed node's
 * `source` (same fields as `PresetSourceRef`), so a UI "provide content"
 * action maps onto the fetcher's lookup with no coordination.
 */
import JSON5 from "json5";

export interface PresetIdentity {
  presetSource: string;
  repo?: string;
  presetPath?: string;
  presetName?: string;
  tag?: string;
}

/**
 * Canonical, stable key for a preset identity. `presetName` normalises to
 * "default" so a bare `owner/repo` (parsed as `presetName: "default"`) and an
 * explicit `owner/repo:default` collide, matching how the fetchers resolve.
 */
export function presetInjectionKey(id: PresetIdentity): string {
  return JSON.stringify([
    id.presetSource,
    id.repo ?? "",
    id.presetPath ?? "",
    id.presetName ?? "default",
    id.tag ?? "",
  ]);
}

let injections = new Map<string, Record<string, unknown>>();
const usedKeys = new Set<string>();

/** Seed the registry for a run. Replaces any previous contents. */
export function setInjectedPresets(map: Record<string, Record<string, unknown>> | undefined): void {
  injections = new Map(Object.entries(map ?? {}));
  usedKeys.clear();
}

/** Clear the registry between runs. */
export function resetInjectedPresets(): void {
  injections = new Map();
  usedKeys.clear();
}

/**
 * Returns a fresh clone of the injected content for `id`, or undefined. Records
 * the key as used so the trace can flag which nodes were user-supplied.
 */
export function getInjectedPreset(id: PresetIdentity): Record<string, unknown> | undefined {
  const key = presetInjectionKey(id);
  const value = injections.get(key);
  if (value === undefined) {
    return undefined;
  }
  usedKeys.add(key);
  return structuredClone(value);
}

/** Injection keys actually consumed during the last run. */
export function getUsedInjectionKeys(): string[] {
  return [...usedKeys];
}

/**
 * Parse user-pasted preset content (JSON5, the same superset Renovate accepts
 * for preset files). Throws with a legible message on invalid input.
 */
export function parseInjectedPreset(text: string): Record<string, unknown> {
  const parsed = JSON5.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Preset content must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}
