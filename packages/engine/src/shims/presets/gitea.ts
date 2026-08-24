/**
 * Browser shim for renovate/dist/config/presets/gitea/index.js.
 * Default endpoint is gitea.com (upstream), whose API v1 serves CORS headers.
 */
import { makeGiteaLikeResolver } from "./gitea-forgejo";
import { PLATFORM_ENDPOINTS } from "./host-transport";

const { Endpoint, fetchJSONFile, getPresetFromEndpoint, getPreset } = makeGiteaLikeResolver(
  "gitea",
  PLATFORM_ENDPOINTS.gitea,
);

export { Endpoint, fetchJSONFile, getPreset, getPresetFromEndpoint };
