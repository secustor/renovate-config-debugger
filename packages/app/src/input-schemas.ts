/**
 * Roadmap 030 — input validation at every boundary. Schemas + typed parse
 * helpers built on `zod/mini` (the tree-shakeable, functional-API build —
 * see roadmap/030-input-validation-zod.md for the bundle-size rationale).
 * Every zod import in this app MUST come from "zod/mini", never the full
 * "zod" build.
 *
 * Threat model recap (roadmap/030): a share link is attacker-controlled data
 * the app decodes and runs automatically on open. React's rendering already
 * escapes output, so the realistic risks are prototype pollution in
 * user-supplied config objects flowing into deep merges, dangerous URL
 * schemes in endpoint fields reaching a `fetch`, header injection via tokens,
 * and type confusion crashing or misdirecting downstream code. This module
 * is the one place all of that gets checked; callers (share.ts, App.tsx,
 * oauth.ts, PresetTree.tsx) replace their ad hoc checks with these.
 */
import * as z from "zod/mini";
import type { STAGE_IDS as ENGINE_STAGE_IDS, StageId } from "@renovate-config-visualizer/engine";
import { RESULTS_TAB_IDS, type ResultsTabId } from "./results-tabs";

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
 * directly — `z.unknown()` performs no copy, so the refine sees the exact
 * value handed to `.parse()`/`.safeParse()`, satisfying the ordering
 * requirement above even when this schema is nested inside a larger object.
 */
export function isValidConfigObject(v: unknown): v is Record<string, unknown> {
  return isPlainObject(v) && !isPolluted(v);
}

export const configObjectSchema = z.unknown().check(
  z.refine(isValidConfigObject, {
    message: "must be a plain JSON object without __proto__/constructor/prototype keys",
  }),
);

/**
 * Security 2026-07-25: a config layer carries its own `platform`/`endpoint`,
 * and the engine's `resolvePlatformContext` (pipeline.ts) lets the GLOBAL
 * layer's values WIN over the payload's top-level ones. A share link could
 * therefore choose the host every `local>` preset fetch goes to — with the
 * user's token attached — while bypassing {@link endpointSchema} entirely,
 * since `configObjectSchema` only checked plain-object-ness and pollution.
 * Both fields are now held to exactly the same rules as the top-level
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

/**
 * A share payload's config layer: {@link configObjectSchema} plus the
 * platform-context rule above. Applied to BOTH layers even though only
 * `globalConfig` reaches `resolvePlatformContext` today (the inherited layer's
 * `platform`/`endpoint` are `globalOnly` options, stripped by the pipeline's
 * `removeGlobalConfig(cfg, true)` before `InheritConfig.set`) — one uniform
 * rule for both is cheaper than a rule that silently depends on which layer
 * the engine happens to read this release.
 */
export const shareConfigLayerSchema = z.unknown().check(
  z.refine(isValidShareConfigLayer, {
    message:
      "must be a plain JSON object without __proto__/constructor/prototype keys, and its platform/endpoint must be a valid platform name / http(s) URL",
  }),
);

/** Validates a config layer (already `JSON.parse`d) and returns it typed, or
 *  null when it is not a plain object or is polluted. Convenience wrapper
 *  around {@link isValidConfigObject} for call sites that want a value, not
 *  a zod result. */
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

const httpUrlSchema = z.string().check(z.refine(isHttpUrl, { message: "must be an http(s) URL" }));

/**
 * An endpoint field: empty string means "unset" (this app's own convention
 * for platforms not fetched in the browser — see `PLATFORM_ENDPOINTS` in
 * App.tsx) or an http(s) URL. Never `javascript:`/`data:`/anything else.
 */
export const endpointSchema = z.union([z.literal(""), httpUrlSchema]);

export function isValidEndpoint(value: string): boolean {
  return value === "" || isHttpUrl(value);
}

const MAX_TOKEN_LENGTH = 4096;
// Control characters (incl. CR/LF/NUL) — the header-injection vector; a
// token carrying one of these must never reach a header value.
// oxlint-disable-next-line no-control-regex -- matching control characters is the point of this check
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

export function isValidToken(value: string): boolean {
  return value.length <= MAX_TOKEN_LENGTH && !CONTROL_CHARS.test(value);
}

/** A token/PAT: no control characters, and a generous max length — real
 *  PATs are well under this. Applied before a token is stored AND again
 *  before it is placed into a request header (defense at both ends). */
export const tokenSchema = z.string().check(
  z.maxLength(MAX_TOKEN_LENGTH),
  z.refine((s) => !CONTROL_CHARS.test(s), { message: "must not contain control characters" }),
);

const MAX_PLATFORM_LENGTH = 128;

/** `platform` is intentionally NOT an enum: the app's own platform <select>
 *  (App.tsx `PLATFORM_ENDPOINTS`) already tolerates an unrecognized platform
 *  string (a future Renovate platform), rendering it as an extra option
 *  rather than rejecting it. Only reject the type-confusion case (an
 *  object/number/etc, or absurd/control-character input). */
export const platformSchema = z.string().check(
  z.maxLength(MAX_PLATFORM_LENGTH),
  z.refine((s) => !CONTROL_CHARS.test(s), { message: "must not contain control characters" }),
);

export function isValidPlatform(value: string): boolean {
  return value.length <= MAX_PLATFORM_LENGTH && !CONTROL_CHARS.test(value);
}

// ---------------------------------------------------------------------------
// Share view / tab / stage — reuses the real ResultsTabId (results-tabs.ts)
// and the engine's stage list. Roadmap 033: the engine now exports STAGE_IDS
// as a runtime value, but the app's house rule is that engine RUNTIME is only
// ever reached via dynamic import() (the heavy chunk must stay out of the
// initial bundle) — so the tuple is written out here and `satisfies typeof`
// pins it to the engine's exact tuple type instead: adding, removing or
// reordering a stage in packages/engine/src/trace/model.ts makes this line
// fail to compile until it matches again. StageTimeline's stage order imports
// this constant, so the app has exactly one copy to keep in sync.
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

export const stageIdSchema = z.enum(STAGE_IDS);
export const resultsTabIdSchema = z.enum(RESULTS_TAB_IDS);
const stepIndexSchema = z.int().check(z.nonnegative());

/** The subset of `ShareView` this module validates; kept structurally
 *  identical to share.ts's exported `ShareView` interface without importing
 *  it (avoids a share.ts <-> input-schemas.ts import cycle). */
export interface SanitizedShareView {
  stage?: StageId;
  node?: string | null;
  step?: number;
  tab?: ResultsTabId;
}

/**
 * Sanitizes a decoded share payload's `view` sub-object: each field is
 * validated and independently dropped if malformed, rather than failing the
 * whole share link over a cosmetic view field. This matches roadmap 028's
 * own tolerance for an unrecognized `tab` (a hand-edited link, or a future
 * version's new tab id — the opener still loads, just without selecting a
 * tab it doesn't understand) and extends the same treatment to `stage` /
 * `node` / `step`, which previously reached React state completely
 * unchecked (a type-confused `stage` could be set as the "selected stage"
 * verbatim). A malformed/missing `view` altogether just yields `undefined`.
 */
export function sanitizeShareView(raw: unknown): SanitizedShareView | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  const out: SanitizedShareView = {};
  const stage = stageIdSchema.safeParse(raw.stage);
  if (stage.success) {
    out.stage = stage.data;
  }
  if (raw.node === null) {
    out.node = null;
  } else {
    const node = z.string().safeParse(raw.node);
    if (node.success) {
      out.node = node.data;
    }
  }
  const step = stepIndexSchema.safeParse(raw.step);
  if (step.success) {
    out.step = step.data;
  }
  const tab = resultsTabIdSchema.safeParse(raw.tab);
  if (tab.success) {
    out.tab = tab.data;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// ---------------------------------------------------------------------------
// Share simulator descriptor (roadmap 018)
// ---------------------------------------------------------------------------

export interface SanitizedShareSimulator {
  form: Record<string, string>;
  autoSimulate?: boolean;
}

/**
 * Sanitizes a decoded share payload's `sim` sub-object: keeps only
 * non-empty string form values (matching `share.ts`'s existing
 * `normalizeSim`), dropping anything else — an array `sim`, a non-string
 * form value, or a missing `form` all yield `undefined` rather than
 * rejecting the whole link (the simulator descriptor carries no tokens or
 * anything security-relevant; the worst a malformed one does is fail to
 * pre-fill a form).
 */
export function sanitizeShareSim(raw: unknown): SanitizedShareSimulator | undefined {
  if (!isPlainObject(raw) || !isPlainObject(raw.form)) {
    return undefined;
  }
  const form: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw.form)) {
    const parsed = z.string().check(z.minLength(1)).safeParse(value);
    if (parsed.success) {
      form[key] = parsed.data;
    }
  }
  if (Object.keys(form).length === 0) {
    return undefined;
  }
  return raw.autoSimulate === true ? { form, autoSimulate: true } : { form };
}

// ---------------------------------------------------------------------------
// Share payload — the security-relevant fields ONLY (platform/endpoint/the
// two config layers/platformOverride/the envelope trio). A failure in any of
// these hard-fails the whole payload (share.ts maps that to the 027 "damaged"
// banner) because they affect what actually runs or gets fetched. `view` and
// `sim` are validated separately (see above) with per-field tolerance, and
// `fileName` keeps its existing lenient normalize-not-reject behavior (it
// only selects a JSON vs JSON5 parser, no security implication) — see the
// ternary in share.ts's decodeShareResult.
// ---------------------------------------------------------------------------

export const sharePayloadStrictFieldsSchema = z.object({
  v: z.union([z.literal(1), z.literal(2)]),
  renovate: z.string(),
  config: z.string(),
  platform: z.optional(platformSchema),
  endpoint: z.optional(endpointSchema),
  // Security 2026-07-25: the layers' own platform/endpoint are enforced here
  // too — see `shareConfigLayerSchema`. Rejecting (rather than stripping the
  // bad field) keeps ONE rule for "where will this link send my token": a
  // `javascript:` endpoint already fails the whole payload at the top level,
  // and a link whose global layer aims somewhere unusable is damaged in
  // exactly the same way. Stripping would also silently change what the link
  // means (the run would fall back to a different host than the sender saw).
  globalConfig: z.optional(shareConfigLayerSchema),
  inheritedConfig: z.optional(shareConfigLayerSchema),
  platformOverride: z.optional(z.boolean()),
  c: z.optional(z.string()),
});

// ---------------------------------------------------------------------------
// Storage reads (platform / endpoint / tokens / OAuth stored user)
// ---------------------------------------------------------------------------

/** OAuth stored user (oauth.ts `StoredUser`): `login` must be a non-empty
 *  string; `avatarUrl` must be an http(s) URL or gets dropped (it is
 *  rendered into an `<img src>` attribute). */
export const storedUserSchema = z.object({
  login: z.string().check(z.minLength(1)),
  avatarUrl: z.optional(z.string()),
});

export interface SanitizedStoredUser {
  login: string;
  avatarUrl: string;
}

/** Validates a stored-user JSON value (already `JSON.parse`d), dropping a
 *  bad `avatarUrl` rather than rejecting the whole record — a corrupted or
 *  `javascript:` avatar URL should not sign the user back out, it should
 *  just not render an avatar. */
export function sanitizeStoredUser(raw: unknown): SanitizedStoredUser | null {
  const result = storedUserSchema.safeParse(raw);
  if (!result.success) {
    return null;
  }
  const avatarUrl = result.data.avatarUrl;
  return {
    login: result.data.login,
    avatarUrl: avatarUrl && isHttpUrl(avatarUrl) ? avatarUrl : "",
  };
}

// ---------------------------------------------------------------------------
// OAuth callback params + Worker token-exchange response
// ---------------------------------------------------------------------------

/** GitHub's `code`/`state` query params: non-empty, bounded, control-char
 *  free — they round-trip through a URL and a POST body before this app or
 *  the Worker ever inspects their content. */
const oauthParamSchema = z.string().check(
  z.minLength(1),
  z.maxLength(2048),
  z.refine((s) => !CONTROL_CHARS.test(s), { message: "must not contain control characters" }),
);

export const oauthCallbackParamsSchema = z.object({
  code: oauthParamSchema,
  state: oauthParamSchema,
});

/**
 * Security 2026-07-25: the `rcv.oauth.pending` stash (oauth.ts `beginSignIn`
 * writes `{ state, verifier, returnHash }`) was `JSON.parse`d and type-ASSERTED
 * on the callback path, so a hand-edited/corrupted value reached the CSRF
 * `state` comparison and the PKCE `code_verifier` sent to the Worker as
 * whatever type it happened to be. `state`/`verifier` must both be non-empty
 * strings (a non-string `state` could otherwise compare loosely enough to slip
 * past the mismatch check); `returnHash` is optional because
 * `completeCallback` already defaults it to "".
 */
export const pendingSignInSchema = z.object({
  state: z.string().check(z.minLength(1)),
  verifier: z.string().check(z.minLength(1)),
  returnHash: z.optional(z.string()),
});

/** The oauth-worker's `/exchange` and `/refresh` JSON response. Every field
 *  is optional at the schema level (a real failure response carries only
 *  `error`/`error_description`) — oauth.ts's own success check (`!data.error
 *  && data.access_token`) still decides whether the exchange succeeded; this
 *  schema exists so a field that IS present is at least well-typed before
 *  `access_token` is stored as a bearer-header token. */
export const tokenResponseSchema = z.object({
  access_token: z.optional(tokenSchema),
  expires_in: z.optional(z.number()),
  refresh_token: z.optional(tokenSchema),
  refresh_token_expires_in: z.optional(z.number()),
  token_type: z.optional(z.string()),
  scope: z.optional(z.string()),
  error: z.optional(z.string()),
  error_description: z.optional(z.string()),
});

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
// Repo-load input (App.tsx's `parseRepoRef` result, before request building)
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

/** A parsed repo reference's repo/ref, right before it becomes fetch input. */
export const repoRefPartSchema = z
  .string()
  .check(z.refine(isValidRepoRefPart, { message: "must be slug-shaped path segments" }));

/** A parsed repo reference's HOST. Same slug rule as a path segment plus an
 *  optional `:port` — a self-hosted reference like `gitea.example.com:3000/o/r`
 *  must keep reaching the "Unknown host … set its endpoint under Advanced
 *  options" guidance rather than the generic "not a repo reference" refusal.
 *  The host never composes a URL (it only looks up `HOST_PLATFORM`). */
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
