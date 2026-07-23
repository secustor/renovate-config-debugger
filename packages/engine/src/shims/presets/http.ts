/**
 * Browser shim for renovate/dist/config/presets/http/index.js.
 * A generic `http`-hosted preset is not fetched in the browser (arbitrary
 * endpoints rarely serve CORS, and the transport is out of scope for 010), but
 * manual injection still lets the user supply its content by hand.
 */
import { getInjectedPreset } from "./injection";
import { makeUnsupportedGetPreset } from "./unsupported";

const fallback = makeUnsupportedGetPreset("http");

export function getPreset(config: {
  repo: string;
  presetName?: string;
  presetPath?: string;
  tag?: string;
}): Promise<Record<string, unknown> | null> {
  const { repo, presetName = "", presetPath, tag } = config;
  const injected = getInjectedPreset({ presetSource: "http", repo, presetPath, presetName, tag });
  if (injected) {
    return Promise.resolve(injected);
  }
  return fallback(config);
}
