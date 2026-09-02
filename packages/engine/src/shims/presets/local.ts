/**
 * Browser shim for renovate/dist/config/presets/local/index.js.
 * `local>` (and bare `owner/repo`) is not a host of its own — it reads the
 * global `platform` + `endpoint` and delegates to that platform's resolver,
 * exactly like upstream. The platform context comes from the run options (set
 * through the real GlobalConfig by the pipeline), so this dispatch is
 * unchanged from Renovate's; only the underlying transports are the browser
 * shims.
 */
import { GlobalConfig } from "../../renovate-adapter";
import * as forgejo from "./forgejo";
import * as gitea from "./gitea";
import * as github from "./github";
import * as gitlab from "./gitlab";
import { makeInjectableGetPreset } from "./host-transport";

interface Resolver {
  getPresetFromEndpoint(
    repo: string,
    filePreset: string,
    presetPath?: string,
    endpoint?: string,
    tag?: string,
  ): Promise<Record<string, unknown> | null>;
}

// The three classifications below are a hand-port of upstream `getResolver`'s
// switch; `test/local-preset-platforms.node.test.ts` fails when a bump adds a
// platform.
const resolvers: Record<string, Resolver> = { github, gitlab, gitea, forgejo };

// Reachable only via a real Renovate run (their platform APIs have no browser
// fetcher — either no CORS or no prefix of their own in this tool).
const RUN_ONLY = new Set(["azure", "bitbucket", "bitbucket-server", "gerrit"]);
// Platforms Renovate itself declares as unable to serve local presets.
const NO_LOCAL_PRESETS = new Set(["codecommit", "scm-manager", "local"]);

export const getPreset = makeInjectableGetPreset("local", (repo, presetName, presetPath, tag) => {
  const platform = (GlobalConfig.get("platform") as string | undefined) ?? "github";
  const endpoint = GlobalConfig.get("endpoint") as string | undefined;

  // Own-key lookup, not a bare bracket read: a `platform` of `constructor` /
  // `toString` would otherwise hand back an Object.prototype member instead of
  // falling through to the honest message below (twin: `defaultEndpointFor`).
  const resolver = Object.hasOwn(resolvers, platform) ? resolvers[platform] : undefined;
  if (resolver) {
    return resolver.getPresetFromEndpoint(repo, presetName, presetPath, endpoint, tag);
  }
  if (RUN_ONLY.has(platform)) {
    return Promise.reject(
      new Error(
        `local presets on '${platform}' are only reachable via a real Renovate run — ` +
          `the ${platform} preset API is not available in the browser. ` +
          `Provide the preset content manually to continue.`,
      ),
    );
  }
  if (NO_LOCAL_PRESETS.has(platform)) {
    return Promise.reject(
      new Error(`The platform you're using (${platform}) does not support local presets.`),
    );
  }
  return Promise.reject(new Error(`Unknown platform '${platform}' for local preset.`));
});
