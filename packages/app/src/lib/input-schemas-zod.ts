/**
 * Roadmap 030/031 — the zod half of the input-validation layer. The predicates
 * every boot-path caller needs live in input-schemas.ts (zod-free, in the
 * entry chunk); the structured schemas below serve only async call sites —
 * share encode/decode (share.ts) and the OAuth exchange/refresh/profile
 * paths (oauth.ts) — so they reach this module through `import()` and zod
 * (11.7 kB gz) stays off the critical path entirely (roadmap 031).
 *
 * Every zod import in this app MUST come from "zod/mini", never the full
 * "zod" build (see roadmap/030-input-validation-zod.md for the rationale),
 * and MUST live in this module — a static zod import anywhere reachable from
 * main.tsx would silently pull the chunk back into the entry set.
 *
 * The schemas delegate to the input-schemas.ts predicates wherever one
 * exists, so the zod and zod-free views of a rule can never disagree.
 */
import * as z from "zod/mini";
import type { StageId } from "@renovate-config-visualizer/engine";
import { RESULTS_TAB_IDS, type ResultsTabId } from "@/data/results-tabs";
import {
  isHttpUrl,
  isPlainObject,
  isValidConfigObject,
  isValidOAuthParam,
  isValidPlatform,
  isValidRepoRefPart,
  isValidShareConfigLayer,
  isValidToken,
  STAGE_IDS,
} from "./input-schemas";

export const configObjectSchema = z.unknown().check(
  z.refine(isValidConfigObject, {
    message: "must be a plain JSON object without __proto__/constructor/prototype keys",
  }),
);

/**
 * A share payload's config layer: {@link configObjectSchema} plus the
 * platform-context rule (`hasValidPlatformContext` in input-schemas.ts).
 * Applied to BOTH layers even though only `globalConfig` reaches
 * `resolvePlatformContext` today — one uniform rule for both is cheaper than
 * a rule that silently depends on which layer the engine reads this release.
 */
export const shareConfigLayerSchema = z.unknown().check(
  z.refine(isValidShareConfigLayer, {
    message:
      "must be a plain JSON object without __proto__/constructor/prototype keys, and its platform/endpoint must be a valid platform name / http(s) URL",
  }),
);

const httpUrlSchema = z.string().check(z.refine(isHttpUrl, { message: "must be an http(s) URL" }));

/**
 * An endpoint field: empty string means "unset" (this app's own convention
 * for platforms not fetched in the browser — see `PLATFORM_ENDPOINTS`) or an
 * http(s) URL. Never `javascript:`/`data:`/anything else.
 */
export const endpointSchema = z.union([z.literal(""), httpUrlSchema]);

/** A token/PAT: the "header injection" rule (`isValidToken`), applied before
 *  a token is stored AND again before it is placed into a request header
 *  (defense at both ends). */
export const tokenSchema = z.string().check(
  z.refine(isValidToken, {
    message: "must not contain control characters and must be a plausible length",
  }),
);

/** `platform` is intentionally NOT an enum — see `isValidPlatform`'s doc
 *  comment (an unrecognized future platform renders as an extra option). */
export const platformSchema = z.string().check(
  z.refine(isValidPlatform, {
    message: "must be a bounded, control-character-free platform name",
  }),
);

export const stageIdSchema = z.enum(STAGE_IDS);
export const resultsTabIdSchema = z.enum(RESULTS_TAB_IDS);
const stepIndexSchema = z.int().check(z.nonnegative());

/** The subset of `ShareView` this module validates; kept structurally
 *  identical to share.ts's exported `ShareView` interface without importing
 *  it (avoids a share.ts <-> input-schemas import cycle). */
export interface SanitizedShareView {
  stage?: StageId;
  node?: string | null;
  step?: number;
  /** Roadmap 044: the simulator's merge-step index. */
  simStep?: number;
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
  // Roadmap 044: same rule as `step` — a nonnegative integer index, dropped on
  // its own if malformed rather than failing the link.
  const simStep = stepIndexSchema.safeParse(raw.simStep);
  if (simStep.success) {
    out.simStep = simStep.data;
  }
  const tab = resultsTabIdSchema.safeParse(raw.tab);
  if (tab.success) {
    out.tab = tab.data;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

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
// OAuth (async paths only — the sync boot reads use the zod-free guards)
// ---------------------------------------------------------------------------

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

/** GitHub's `/user` response — only the two fields the toolbar chip renders
 *  (moved here from oauth.ts so oauth.ts carries no static zod import). */
export const userApiResponseSchema = z.object({
  login: z.optional(z.string()),
  avatar_url: z.optional(z.string()),
});

/** GitHub's `code`/`state` query params — the zod view of
 *  {@link isValidOAuthParam} (the sync `readCallbackParams` boot path uses
 *  the predicate directly). */
export const oauthCallbackParamsSchema = z.object({
  code: z
    .string()
    .check(
      z.refine(isValidOAuthParam, { message: "must be a bounded, control-character-free param" }),
    ),
  state: z
    .string()
    .check(
      z.refine(isValidOAuthParam, { message: "must be a bounded, control-character-free param" }),
    ),
});

/** A parsed repo reference's repo/ref, right before it becomes fetch input. */
export const repoRefPartSchema = z
  .string()
  .check(z.refine(isValidRepoRefPart, { message: "must be slug-shaped path segments" }));
