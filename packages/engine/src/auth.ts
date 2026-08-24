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
  /** Roadmap 076: credentials for hosts this table does not name — the same
   *  shape Renovate's own `hostRules` have, resolved per request URL by
   *  {@link resolveAuthToken}. The four fields above stay the fallback, so a
   *  caller that sets none of these behaves exactly as before. */
  hostRules?: readonly PresetHostRule[];
}

/**
 * Roadmap 076: one `hostRules`-shaped credential. `matchHost` is a bare host
 * name (optionally with a port) matched against the request URL's host —
 * exactly, or as a domain suffix (`gitlab.example.com` covers
 * `sub.gitlab.example.com`, never `evilgitlab.example.com`). `hostType` is
 * Renovate's vocabulary; omitted or `"any"` means the rule applies to every
 * fetcher that reaches the host.
 */
export interface PresetHostRule {
  matchHost: string;
  hostType?: string;
  token: string;
}

/** The host types the browser fetchers actually authenticate as — the only
 *  ones {@link resolveAuthToken} is ever asked about. */
export type PresetHostType = "github" | "gitlab" | "gitea" | "forgejo";

/** The per-type token fields of {@link PresetAuth} — `hostRules` is a list,
 *  not a token, so a caller filling the four slots must not be able to name
 *  it. Derived, so a new host type adds its key here automatically. */
export type PresetTokenKey = `${PresetHostType}Token`;

const LEGACY_TOKEN_KEY: Record<PresetHostType, PresetTokenKey> = {
  github: "githubToken",
  gitlab: "gitlabToken",
  gitea: "giteaToken",
  forgejo: "forgejoToken",
};

let auth: PresetAuth = {};

export function setPresetAuth(next: PresetAuth): void {
  auth = { ...next };
}

export function getPresetAuth(): PresetAuth {
  return auth;
}

function legacyToken(hostType: PresetHostType): string | undefined {
  const value = auth[LEGACY_TOKEN_KEY[hostType]];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Renovate's own `matchHost` semantics for a bare host: the exact host, or
 *  any subdomain of it. Never a bare substring — `evilgitlab.example.com`
 *  must not pick up `gitlab.example.com`'s credential. */
function hostMatches(host: string, matchHost: string): boolean {
  return host === matchHost || host.endsWith(`.${matchHost}`);
}

function typeMatches(rule: PresetHostRule, hostType: PresetHostType): boolean {
  return rule.hostType === undefined || rule.hostType === "any" || rule.hostType === hostType;
}

/**
 * Roadmap 076: the token to attach to `url` when fetching as `hostType`.
 *
 * The most specific matching `hostRules` entry wins — longest `matchHost`
 * first, and a rule that names this host type beats an equally specific
 * untyped one. With no matching rule (or a URL that will not parse) this falls
 * back to the per-type token, which is the whole of the pre-076 behavior.
 */
export function resolveAuthToken(hostType: PresetHostType, url: string): string | undefined {
  const rules = auth.hostRules;
  if (!rules || rules.length === 0) {
    return legacyToken(hostType);
  }
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return legacyToken(hostType);
  }
  let best: PresetHostRule | undefined;
  for (const rule of rules) {
    if (rule.token === "" || !hostMatches(host, rule.matchHost) || !typeMatches(rule, hostType)) {
      continue;
    }
    if (best === undefined || rule.matchHost.length > best.matchHost.length) {
      best = rule;
      continue;
    }
    // Same specificity: the rule that names the host type is the more
    // deliberate one, so it wins over `any`/untyped.
    if (
      rule.matchHost.length === best.matchHost.length &&
      rule.hostType === hostType &&
      best.hostType !== hostType
    ) {
      best = rule;
    }
  }
  return best?.token ?? legacyToken(hostType);
}
