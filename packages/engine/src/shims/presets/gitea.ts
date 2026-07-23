/**
 * Browser shim for renovate/dist/config/presets/gitea/index.js.
 * Default endpoint is gitea.com (upstream), whose API v1 serves CORS headers.
 */
import { makeGiteaLikeResolver } from "./gitea-forgejo";

const { Endpoint, fetchJSONFile, getPresetFromEndpoint, getPreset } = makeGiteaLikeResolver(
  "gitea",
  "https://gitea.com/",
);

export { Endpoint, fetchJSONFile, getPreset, getPresetFromEndpoint };
