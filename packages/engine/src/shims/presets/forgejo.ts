/**
 * Browser shim for renovate/dist/config/presets/forgejo/index.js.
 * Upstream defaults to code.forgejo.org, but that host does not send CORS
 * headers to the page; codeberg.org (a public Forgejo instance) does and its
 * API v1 is verified reachable, so it is the browser default here. Self-hosted
 * Forgejo endpoints can be pointed at via the platform-context endpoint field
 * (falling back to manual injection when they lack CORS).
 */
import { makeGiteaLikeResolver } from "./gitea-forgejo";

const { Endpoint, fetchJSONFile, getPresetFromEndpoint, getPreset } = makeGiteaLikeResolver(
  "forgejo",
  "https://codeberg.org/",
);

export { Endpoint, fetchJSONFile, getPreset, getPresetFromEndpoint };
