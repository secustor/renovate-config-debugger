/**
 * Per-host credentials for the browser preset fetchers (roadmap 010). Each
 * fetcher reads the token for its own host to lift rate limits / reach private
 * repos. Optional fields keep this backward compatible with the original
 * `githubToken`-only shape.
 */
export interface PresetAuth {
  /** GitHub token — sent as `Authorization: Bearer <t>`. */
  githubToken?: string;
  /** GitLab token — sent as `PRIVATE-TOKEN: <t>`. */
  gitlabToken?: string;
  /** Gitea token — sent as `Authorization: token <t>`. */
  giteaToken?: string;
  /** Forgejo token — sent as `Authorization: token <t>`. */
  forgejoToken?: string;
}

let auth: PresetAuth = {};

export function setPresetAuth(next: PresetAuth): void {
  auth = { ...next };
}

export function getPresetAuth(): PresetAuth {
  return auth;
}
