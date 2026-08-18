/**
 * Roadmap 030 — input validation at every boundary. This module is the
 * zod-FREE half: plain predicate guards and typed parse helpers for
 * everything the boot path (App.tsx, run.ts, the hooks, storage reads)
 * touches synchronously. The structured zod schemas — share payloads, the
 * OAuth exchange/stash shapes — live in input-schemas-zod.ts and are loaded
 * via `import()` at their (already async) call sites, keeping zod's ~11.7 kB
 * gz off the critical path (roadmap 031). The rules themselves are single-
 * sourced here: the zod module builds its schemas from these predicates.
 *
 * Threat model recap (roadmap/030): a share link is attacker-controlled data
 * the app decodes and runs automatically on open. React's rendering already
 * escapes output, so the realistic risks are prototype pollution in
 * user-supplied config objects flowing into deep merges, dangerous URL
 * schemes in endpoint fields reaching a `fetch`, header injection via tokens,
 * and type confusion crashing or misdirecting downstream code. These two
 * modules are the one place all of that gets checked; callers (share.ts,
 * App.tsx, oauth.ts, PresetTree.tsx) replace their ad hoc checks with these.
 */
import type { STAGE_IDS as ENGINE_STAGE_IDS } from "@renovate-config-debugger/engine";

// ---------------------------------------------------------------------------
// Deep pollution guard
// ---------------------------------------------------------------------------

const DANGEROUS_OWN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Recursively finds an own `__proto__` / `constructor` / `prototype` key
 * anywhere in a JSON-shaped value (through object AND array nesting, e.g.
 * `packageRules[n].__proto__`), returning the key path or null.
 *
 * MUST be called with the value straight out of `JSON.parse` — NOT after a
 * zod object/record schema has parsed it. Verified in input-schemas.test.ts:
 * zod's object/record parsing silently DROPS an own "__proto__" key while
 * copying recognized properties onto its output object (it never uses the
 * dangerous `target[key] = value` assignment form that would trip the
 * `__proto__` accessor's setter, so no pollution actually occurs — but the
 * key is simply gone by the time any `.check()`/`.refine()` could see it).
 * A guard placed after `schema.parse()` would therefore never fire, letting
 * a polluted payload appear clean. `Object.getOwnPropertyNames` (not `in`,
 * not a `for...in` walk) is what correctly distinguishes an OWN "__proto__"
 * data property (what `JSON.parse('{"__proto__":1}')` actually creates) from
 * the inherited accessor every plain object has.
 */
export function findPollutedPath(value: unknown, path: readonly string[] = []): string[] | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findPollutedPath(value[i], [...path, String(i)]);
      if (hit) {
        return hit;
      }
    }
    return null;
  }
  if (value !== null && typeof value === "object") {
    const ownKeys = Object.getOwnPropertyNames(value);
    for (const key of ownKeys) {
      if (DANGEROUS_OWN_KEYS.has(key)) {
        return [...path, key];
      }
    }
    for (const key of ownKeys) {
      const hit = findPollutedPath((value as Record<string, unknown>)[key], [...path, key]);
      if (hit) {
        return hit;
      }
    }
  }
  return null;
}

/** True when {@link findPollutedPath} finds anything. See its doc comment
 *  for the "must run on raw JSON.parse output" requirement. */
export function isPolluted(value: unknown): boolean {
  return findPollutedPath(value) !== null;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * A user-supplied Renovate config layer (share payload's globalConfig /
 * inheritedConfig, a pasted 008 layer, injected preset content): must be a
 * plain object (not an array/primitive/null) and pollution-free through its
 * whole tree, including nested `packageRules[n]`. `isPolluted` runs on `v`
 * directly, satisfying the ordering requirement above even when this guard
 * backs a zod schema nested inside a larger object (`z.unknown()` performs
 * no copy, so the refine sees the exact value handed to `.parse()`).
 */
export function isValidConfigObject(v: unknown): v is Record<string, unknown> {
  return isPlainObject(v) && !isPolluted(v);
}

/**
 * Security 2026-07-25: a config layer carries its own `platform`/`endpoint`,
 * and the engine's `resolvePlatformContext` (pipeline.ts) lets the GLOBAL
 * layer's values WIN over the payload's top-level ones. A share link could
 * therefore choose the host every `local>` preset fetch goes to — with the
 * user's token attached — while bypassing the endpoint rule entirely, since
 * `isValidConfigObject` only checks plain-object-ness and pollution. Both
 * fields are held to exactly the same rules as the top-level
 * `platform`/`endpoint` when present (and must be strings at all, closing the
 * type-confusion case the pipeline silently ignores).
 */
export function hasValidPlatformContext(value: Record<string, unknown>): boolean {
  if ("platform" in value) {
    const platform = value.platform;
    if (typeof platform !== "string" || !isValidPlatform(platform)) {
      return false;
    }
  }
  if ("endpoint" in value) {
    const endpoint = value.endpoint;
    if (typeof endpoint !== "string" || !isValidEndpoint(endpoint)) {
      return false;
    }
  }
  return true;
}

export function isValidShareConfigLayer(v: unknown): v is Record<string, unknown> {
  return isValidConfigObject(v) && hasValidPlatformContext(v);
}

/** Validates a config layer (already `JSON.parse`d) and returns it typed, or
 *  null when it is not a plain object or is polluted. Convenience wrapper
 *  around {@link isValidConfigObject} for call sites that want a value, not
 *  a boolean. */
export function parseConfigObject(raw: unknown): Record<string, unknown> | null {
  return isValidConfigObject(raw) ? raw : null;
}

// ---------------------------------------------------------------------------
// URLs (the "dangerous URL" rule) and tokens (the "header injection" rule)
// ---------------------------------------------------------------------------

/**
 * http(s)-only. Deliberately NOT zod's built-in `z.httpUrl()` format check:
 * that also requires a dotted hostname, which would reject the
 * localhost/bare-IP self-hosted endpoints roadmap 010 explicitly supports
 * (Gitea/Forgejo/GitLab instances are frequently `http://localhost:...` or a
 * private IP in this app's own test fixtures). `URL` throws on anything that
 * isn't a valid absolute URL, which also rejects `javascript:`/`data:` by
 * virtue of their protocol not being `http:`/`https:`.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * An endpoint field: empty string means "unset" (this app's own convention
 * for platforms not fetched in the browser — see `PLATFORM_ENDPOINTS` in
 * App.tsx) or an http(s) URL. Never `javascript:`/`data:`/anything else.
 */
export function isValidEndpoint(value: string): boolean {
  return value === "" || isHttpUrl(value);
}

const MAX_TOKEN_LENGTH = 4096;
// Control characters (incl. CR/LF/NUL) — the header-injection vector; a
// token carrying one of these must never reach a header value.
// oxlint-disable-next-line no-control-regex -- matching control characters is the point of this check
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

/** A token/PAT: no control characters, and a generous max length — real
 *  PATs are well under this. Applied before a token is stored AND again
 *  before it is placed into a request header (defense at both ends). */
export function isValidToken(value: string): boolean {
  return value.length <= MAX_TOKEN_LENGTH && !CONTROL_CHARS.test(value);
}

const MAX_PLATFORM_LENGTH = 128;

/** `platform` is intentionally NOT an enum: the app's own platform <select>
 *  (App.tsx `PLATFORM_ENDPOINTS`) already tolerates an unrecognized platform
 *  string (a future Renovate platform), rendering it as an extra option
 *  rather than rejecting it. Only reject the type-confusion case (an
 *  object/number/etc, or absurd/control-character input). */
export function isValidPlatform(value: string): boolean {
  return value.length <= MAX_PLATFORM_LENGTH && !CONTROL_CHARS.test(value);
}

const MAX_OAUTH_PARAM_LENGTH = 2048;

/** GitHub's `code`/`state` query params: non-empty, bounded, control-char
 *  free — they round-trip through a URL and a POST body before this app or
 *  the Worker ever inspects their content. A predicate (not a zod schema)
 *  because `readCallbackParams` runs on the boot path (roadmap 031). */
export function isValidOAuthParam(value: string): boolean {
  return value.length >= 1 && value.length <= MAX_OAUTH_PARAM_LENGTH && !CONTROL_CHARS.test(value);
}

// ---------------------------------------------------------------------------
// Share view / tab / stage — reuses the engine's stage list. Roadmap 033: the
// engine now exports STAGE_IDS as a runtime value, but the app's house rule is
// that engine RUNTIME is only ever reached via dynamic import() (the heavy
// chunk must stay out of the initial bundle) — so the tuple is written out
// here and `satisfies typeof` pins it to the engine's exact tuple type
// instead: adding, removing or reordering a stage in
// packages/engine/src/trace/model.ts makes this line fail to compile until it
// matches again. StageRail's stage order imports this constant, so the
// app has exactly one copy to keep in sync.
// ---------------------------------------------------------------------------

export const STAGE_IDS = [
  "global",
  "inherit",
  "parse",
  "migrate",
  "massage",
  "validate",
  "preset",
  "merge",
] as const satisfies typeof ENGINE_STAGE_IDS;

// ---------------------------------------------------------------------------
// Storage reads (OAuth stored user — sync at boot, so zod-free)
// ---------------------------------------------------------------------------

export interface SanitizedStoredUser {
  login: string;
  avatarUrl: string;
}

/** Validates a stored-user JSON value (already `JSON.parse`d; oauth.ts
 *  `StoredUser`): `login` must be a non-empty string and `avatarUrl`, when
 *  present, a string — anything else rejects the whole record. A present but
 *  non-http(s) `avatarUrl` is dropped rather than rejecting the record — it
 *  is rendered into an `<img src>` attribute, and a corrupted or
 *  `javascript:` avatar URL should not sign the user back out, it should
 *  just not render an avatar. */
export function sanitizeStoredUser(raw: unknown): SanitizedStoredUser | null {
  if (!isPlainObject(raw)) {
    return null;
  }
  const { login, avatarUrl } = raw;
  if (typeof login !== "string" || login.length === 0) {
    return null;
  }
  if (avatarUrl !== undefined && typeof avatarUrl !== "string") {
    return null;
  }
  return { login, avatarUrl: avatarUrl && isHttpUrl(avatarUrl) ? avatarUrl : "" };
}

// ---------------------------------------------------------------------------
// Config layers (App.tsx's pasted global/inherited config — roadmap 008)
// ---------------------------------------------------------------------------

export interface LayerParseResult {
  config?: Record<string, unknown>;
  error?: string;
}

/**
 * Replaces `parseLayerText`'s hand-rolled `typeof`/`Array.isArray` check.
 * Empty text = layer off (unchanged). A parse failure keeps `JSON.parse`'s
 * own error text verbatim (unchanged — the field's error message has always
 * been "Not valid JSON: <native message>", no translation layer to preserve
 * here). A value that parses but isn't usable keeps the EXACT existing
 * string `"must be a JSON object"` so the two `layer-editor-error` render
 * sites (App.tsx) and anything depending on that text keep reading the same
 * way — now covering the pollution case too (a `__proto__`/`constructor`/
 * `prototype` key anywhere in the layer, including nested `packageRules[n]`,
 * is rejected with the same message rather than silently reaching a merge).
 */
export function parseLayerJson(text: string): LayerParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  if (!isValidConfigObject(parsed)) {
    return { error: "must be a JSON object" };
  }
  return { config: parsed };
}

// ---------------------------------------------------------------------------
// Repo-load input (use-repo-load's `parseRepoRef` result, before request building)
// ---------------------------------------------------------------------------

const MAX_REPO_REF_LENGTH = 512;

/**
 * Security 2026-07-25: one path segment of a repo reference or a git ref.
 * Previously only control characters and length were checked, which still let
 * `?`, `#`, `%` and `..` through into a fetch URL (`…/repos/<repo>/contents/…`)
 * — enough to bolt a query string onto the request, or to climb out of the
 * intended path, on the engine's raw-interpolating builders. Slug-shaped is
 * what every supported host actually allows for owners, repos, tags and
 * branches; `.` / `..` are rejected outright as traversal segments (a leading
 * dot is still fine — `owner/.github` is a real repository).
 */
const REPO_REF_SEGMENT = /^[A-Za-z0-9._-]+$/;

function isRepoRefSegment(segment: string): boolean {
  return segment !== "." && segment !== ".." && REPO_REF_SEGMENT.test(segment);
}

/** A repo path (`owner/repo`, or a GitLab subgroup path `group/sub/repo`) or a
 *  git ref (`main`, `v1.2.3`, `release/1.0`). Empty = the field is unset,
 *  which every caller treats as "use the default" — unchanged. */
export function isValidRepoRefPart(value: string): boolean {
  if (value === "") {
    return true;
  }
  if (value.length > MAX_REPO_REF_LENGTH) {
    return false;
  }
  return value.split("/").every(isRepoRefSegment);
}

/** A parsed repo reference's HOST. Same slug rule as a path segment plus an
 *  optional `:port` — a self-hosted reference like `gitea.example.com:3000/o/r`
 *  must keep reaching the "Unknown host … set its endpoint under Advanced
 *  options" guidance rather than the generic "not a repo reference" refusal.
 *  The host never composes a URL (it only looks up use-repo-load's
 *  `HOST_PLATFORM`). */
export function isValidRepoHost(value: string): boolean {
  if (value.length > MAX_REPO_REF_LENGTH) {
    return false;
  }
  const [host = "", port, ...rest] = value.split(":");
  if (rest.length > 0) {
    return false;
  }
  if (port !== undefined && !/^\d{1,5}$/.test(port)) {
    return false;
  }
  return isRepoRefSegment(host);
}
