/**
 * Browser shim for renovate/dist/config/presets/npm/index.js.
 * The real module pulls in the npm datasource + Node http stack; presets only
 * need the packument's `renovate-config` field, fetched here directly from
 * the CORS-enabled npm registry. (npm presets are deprecated upstream.)
 */
import {
  PRESET_DEP_NOT_FOUND,
  PRESET_NOT_FOUND,
  PRESET_RENOVATE_CONFIG_NOT_FOUND,
} from "renovate/dist/config/presets/util.js";
import { getInjectedPreset } from "./injection";

interface Packument {
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, { "renovate-config"?: Record<string, Record<string, unknown>> }>;
}

export async function getPreset(config: {
  repo: string;
  presetName?: string;
}): Promise<Record<string, unknown> | null> {
  const { repo: pkgName, presetName = "default" } = config;
  const injected = getInjectedPreset({ presetSource: "npm", repo: pkgName, presetName });
  if (injected) {
    return injected;
  }
  let latestVersion: { "renovate-config"?: Record<string, Record<string, unknown>> } | undefined;
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkgName)}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const packument = (await res.json()) as Packument;
    const latest = packument["dist-tags"]?.latest;
    latestVersion = latest ? packument.versions?.[latest] : undefined;
  } catch {
    throw new Error(PRESET_DEP_NOT_FOUND);
  }
  if (!latestVersion?.["renovate-config"]) {
    throw new Error(PRESET_RENOVATE_CONFIG_NOT_FOUND);
  }
  const presetConfig = latestVersion["renovate-config"][presetName];
  if (!presetConfig) {
    throw new Error(PRESET_NOT_FOUND);
  }
  return presetConfig;
}
