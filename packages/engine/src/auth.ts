export interface PresetAuth {
  /** GitHub token used by the browser preset fetcher to lift rate limits. */
  githubToken?: string;
}

let auth: PresetAuth = {};

export function setPresetAuth(next: PresetAuth): void {
  auth = { ...next };
}

export function getPresetAuth(): PresetAuth {
  return auth;
}
