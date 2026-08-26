/**
 * Roadmap 007 — shareable-link codec. Encodes the input config and current
 * view state into the URL fragment so an analysis can be reproduced from a
 * link alone. Pure functions, no React.
 *
 * Wire format: `#config=<token>` where token is
 *   JSON → UTF-8 → deflate-raw → base64url (no padding).
 * The fragment (never a query string) keeps configs out of any server logs.
 *
 * Tokens and manually-injected presets are NEVER encoded. The Renovate version
 * current at encode time rides along so the opener can warn on version drift.
 */
import type { StageId } from "@renovate-config-debugger/engine";
import type { ShareResultsTabId } from "@/data/results-tabs";
import { isValidRepoRefPart } from "@/lib/input-schemas";
import { DEFAULT_ENDPOINT, DEFAULT_PLATFORM, PLATFORM_ENDPOINTS } from "@/data/platform-endpoints";
import { isTrustedEndpoint } from "@/lib/trusted-endpoint";

// Roadmap 031: the payload schemas (and with them zod) load with the first
// encode/decode — both call sites are already async — via this module-cached
// dynamic import, instead of riding the entry chunk. What is validated is
// unchanged (030's guarantees live in input-schemas-zod.ts verbatim).
function loadSchemas() {
  return import("./input-schemas-zod");
}

const FRAGMENT_KEY = "config";

export type ShareFileName = "renovate.json" | "renovate.json5";

export interface ShareView {
  stage?: StageId;
  /** Selected preset node's STRUCTURAL identity (stable across runs), not its id. */
  node?: string | null;
  /** Migration step index (only meaningful while the migrate stepper is mounted). */
  step?: number;
  /**
   * Roadmap 044: the simulator's merge-step index. Additive within v2 exactly
   * like `tab` — a pre-044 link simply lacks it (absent = step 0) and a pre-044
   * reader ignores the unknown key. Only meaningful together with a `sim`
   * descriptor that reproduces the simulation; on its own it restores nothing.
   */
  simStep?: number;
  /**
   * Roadmap 028: the active results tab. Additive within v2 — a pre-028 link
   * simply lacks it and the opener infers a tab from stage/node/step
   * (`legacyTabForView`), and a pre-028 reader ignores the unknown key.
   *
   * Roadmap 075 (v2, iteration 3): ENCODING only ever writes a current
   * `ResultsTabId`; the wider type is the decode side, which still accepts the
   * three retired ids so links made before v2 land on the tab that replaced the
   * one they name (`resultsTabForShareTab`).
   */
  tab?: ShareResultsTabId;
}

/**
 * Roadmap 018 — an optional simulator-form descriptor a link can carry so
 * "open this link and it reproduces my exact demonstration" works. `form` is
 * the simulator's text fields (a dependency descriptor — package name, source
 * URL, versions, …); it NEVER contains tokens or credentials (the form has no
 * such fields, and the share payload has never encoded them). `autoSimulate`
 * asks the opener to run the simulation automatically once the pipeline run
 * finishes, rather than just pre-filling the form.
 */
export interface ShareSimulator {
  form: Record<string, string>;
  autoSimulate?: boolean;
  /**
   * Roadmap 054 (layer 4): the verdict thread — a changed setting's KEY — that
   * was expanded when the link was made, so "look at what happened to
   * `groupName`" survives the copy. Additive within v2 exactly like
   * `autoSimulate`: a pre-054 link simply lacks it, a pre-054 reader ignores
   * the unknown key, and it only means anything next to a `form` that
   * reproduces the run whose threads it names. Never a token — it is one of
   * the config's own option names.
   */
  simThread?: string;
}

/** The app-facing shape passed to encodeShare. */
export interface ShareState {
  config: string;
  fileName: ShareFileName;
  platform: string;
  endpoint: string;
  renovate: string;
  /** Parsed 008 layers; omitted from the link when absent. */
  globalConfig?: Record<string, unknown>;
  inheritedConfig?: Record<string, unknown>;
  /** The platform/endpoint explicitly override the global config's values. */
  platformOverride?: boolean;
  view?: ShareView;
  /** Roadmap 018: optional simulator inputs (never tokens). */
  sim?: ShareSimulator;
  /** Roadmap 075 (iteration 6): the pinned tests, as descriptor field bags.
   *  Same content class as `sim.form` — dependency descriptors, never tokens
   *  and never an injected preset — and omitted entirely when there are none. */
  pins?: Record<string, string>[];
  /** Roadmap 087: the repository the config was LOADED from, when it was — a
   *  provenance hint the From-repository tab's connect panel offers to reload.
   *  A slug, never credentials; nothing is fetched without a click. */
  repo?: string;
}

/**
 * The decoded payload as stored in the fragment. v2 (008) added the optional
 * global/inherited config layers; v1 payloads simply lack them. Roadmap 018
 * adds the optional `sim` field WITHOUT a version bump: it is purely additive,
 * so a v2 consumer that predates it simply ignores the unknown key, and this
 * decoder tolerates its absence — the version stays 2.
 */
export interface SharePayload {
  v: 1 | 2;
  renovate: string;
  config: string;
  fileName: ShareFileName;
  platform?: string;
  endpoint?: string;
  globalConfig?: Record<string, unknown>;
  inheritedConfig?: Record<string, unknown>;
  platformOverride?: boolean;
  view?: ShareView;
  sim?: ShareSimulator;
  /**
   * Roadmap 075 (iteration 6): the pinned tests. Additive within v2 exactly
   * like `sim` before it — a link that predates the field simply lacks it and
   * decodes unchanged, a reader that predates it ignores the unknown key, and
   * the version stays 2. Sanitized per entry (`sanitizeSharePins`).
   */
  pins?: Record<string, string>[];
  /**
   * Roadmap 087: the repository the config was loaded from. Additive within
   * v2 exactly like `sim` and `pins`: absent on old links, ignored by old
   * readers. Provenance only — the opener sees the slug on the connect
   * panel's button and nothing is fetched without that click.
   */
  repo?: string;
  /**
   * Roadmap 027: additive integrity tag — the config's `configChecksum`. Stays
   * v2 (a decoder that predates it just ignores the extra key); when present it
   * lets the decoder catch a config that survived inflation but arrived
   * corrupted/truncated. Old links lack it and keep their prior behavior.
   */
  c?: string;
}

/**
 * Roadmap 027: 32-bit FNV-1a of the config string, base36 — a tiny additive
 * integrity tag (payload field `c`) so a token whose config survived inflation
 * but arrived corrupted/truncated is caught reliably instead of only when
 * JSON.parse happens to trip. NOT security (a hand-tampered link can recompute
 * it); it only flags accidental transit damage. Ported byte-for-byte into the
 * e2e fixtures and the 019 generator so every producer tags identically.
 */
export function configChecksum(config: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < config.length; i++) {
    h ^= config.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

async function pipeThrough(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Copy into a fresh ArrayBuffer-backed view — TextEncoder / atob outputs can
  // be typed as ArrayBufferLike, which the stream writer's types reject.
  // Roadmap 030: `.catch(() => {})` on both — a truncated/corrupt inflate
  // (a deliberately exercised path now that decodeShareResult has unit
  // coverage) errors the stream, which can reject these otherwise-unawaited
  // writable-side promises too; the actual failure is already surfaced
  // through the readable side below, which the caller awaits and handles.
  void writer.write(new Uint8Array(bytes)).catch(() => {});
  void writer.close().catch(() => {});
  const buf = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buf);
}

function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(bytes, new CompressionStream("deflate-raw"));
}

function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(bytes, new DecompressionStream("deflate-raw"));
}

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(token: string): Uint8Array {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

/** Encodes state into the fragment token (the value after `#config=`). */
export async function encodeShare(state: ShareState): Promise<string> {
  const payload: SharePayload = {
    v: 2,
    renovate: state.renovate,
    config: state.config,
    fileName: state.fileName,
    c: configChecksum(state.config),
  };
  // Omit platform/endpoint when they equal the defaults.
  if (state.platform && state.platform !== DEFAULT_PLATFORM) {
    payload.platform = state.platform;
  }
  if (state.endpoint && state.endpoint !== DEFAULT_ENDPOINT) {
    payload.endpoint = state.endpoint;
  }
  if (state.globalConfig) {
    payload.globalConfig = state.globalConfig;
  }
  if (state.inheritedConfig) {
    payload.inheritedConfig = state.inheritedConfig;
  }
  if (state.platformOverride) {
    payload.platformOverride = true;
  }
  const { sanitizeShareView, sanitizeShareSim, sanitizeSharePins } = await loadSchemas();
  // Roadmap 033: the encode side runs the SAME sanitizers the decoder runs
  // (input-schemas-zod.ts), so what goes onto the wire and what is accepted off
  // it can never disagree again. This reconciles the one live divergence the
  // 2026-07-25 review found: the old encode-side `normalizeView` dropped
  // `step: 0` while the decoder accepted it — so sharing the FIRST rewrite
  // step silently lost the step (and with it a pre-028 link's inferred
  // Rewrites tab). Decode-side nonnegative is the correct rule: step is an
  // index and 0 is a real selection, so `step: 0` now round-trips (proven by
  // the encode∘decode fixpoint test in share.test.ts).
  const view = sanitizeShareView(state.view);
  if (view) {
    payload.view = view;
  }
  const sim = sanitizeShareSim(state.sim);
  if (sim) {
    payload.sim = sim;
  }
  // Roadmap 075: the same sanitizer on both sides as everything above — what
  // goes onto the wire is what comes off it, cap included.
  const pins = sanitizeSharePins(state.pins);
  if (pins) {
    payload.pins = pins;
  }
  // Roadmap 087: the same validator the decoder runs (and the repo-load form
  // runs on what the user types) — what goes onto the wire is what comes off.
  if (state.repo && isValidRepoRefPart(state.repo)) {
    payload.repo = state.repo;
  }
  const json = JSON.stringify(payload);
  const compressed = await deflateRaw(new TextEncoder().encode(json));
  return bytesToBase64url(compressed);
}

/**
 * Roadmap 027: why a token failed to decode, so the app can say what happened
 * rather than a single "couldn't read it". The reason is the earliest failing
 * stage:
 *  - `damaged`      — the token text isn't valid base64 (genuinely garbled).
 *  - `cutOff`       — base64 decoded but the deflate stream / JSON is
 *                     incomplete or corrupt, or the integrity tag mismatches.
 *                     deflate-raw carries no length, so a truncated link fails
 *                     here (Z_BUF_ERROR) rather than at a checksum — this is
 *                     the "make sure the whole URL was copied" signature.
 *  - `incompatible` — decoded to JSON but not a shape/version this app reads.
 */
export type ShareDecodeError = "damaged" | "cutOff" | "incompatible";

export type DecodeResult =
  | { ok: true; payload: SharePayload }
  | { ok: false; reason: ShareDecodeError };

/** Decodes a fragment token, distinguishing the failure mode (see DecodeResult). */
export async function decodeShareResult(token: string): Promise<DecodeResult> {
  let bytes: Uint8Array;
  try {
    bytes = base64urlToBytes(token);
  } catch {
    return { ok: false, reason: "damaged" };
  }
  let json: string;
  try {
    json = new TextDecoder().decode(await inflateRaw(bytes));
  } catch {
    return { ok: false, reason: "cutOff" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: "cutOff" };
  }
  const version = (parsed as { v?: unknown } | null)?.v;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (version !== 1 && version !== 2) ||
    typeof (parsed as { config?: unknown }).config !== "string"
  ) {
    return { ok: false, reason: "incompatible" };
  }
  const p = parsed as SharePayload;
  // Integrity tag (additive to v2): when present it must match the config it
  // rode with. A mismatch is transit corruption the earlier stages passed.
  // Absent (old links) = no check — today's behavior is preserved.
  if (typeof p.c === "string" && p.c !== configChecksum(p.config)) {
    return { ok: false, reason: "cutOff" };
  }
  const { sanitizeShareView, sanitizeShareSim, sanitizeSharePins, sharePayloadStrictFieldsSchema } =
    await loadSchemas();
  // Roadmap 030: the security-relevant fields (platform/endpoint/the two
  // config layers/platformOverride) are schema-validated as a unit — a
  // hostile or corrupted value here (a polluted globalConfig, a
  // `javascript:`/`data:` endpoint, a type-confused platform) fails the
  // WHOLE payload rather than being silently dropped, since these are what
  // actually gets fetched or merged. The version is already known-good at
  // this point, so a schema failure here is transit/tamper damage, not a
  // future-version payload — "damaged", not "incompatible".
  const strict = sharePayloadStrictFieldsSchema.safeParse(p);
  if (!strict.success) {
    return { ok: false, reason: "damaged" };
  }
  p.platform = strict.data.platform;
  p.endpoint = strict.data.endpoint;
  p.globalConfig = strict.data.globalConfig as Record<string, unknown> | undefined;
  p.inheritedConfig = strict.data.inheritedConfig as Record<string, unknown> | undefined;
  p.platformOverride = strict.data.platformOverride;
  // Normalize fileName to the two supported values. Unlike the fields above,
  // fileName has no security implication (it only selects a JSON vs JSON5
  // parser downstream) and keeps its existing lenient behavior: an
  // unrecognized value quietly defaults rather than failing the link.
  p.fileName = p.fileName === "renovate.json5" ? "renovate.json5" : "renovate.json";
  // `view`/`sim` are cosmetic (which stage/tab/node was selected, a
  // simulator form to pre-fill) and are sanitized per-field rather than
  // hard-failing the payload — see sanitizeShareView's doc comment for why
  // this preserves roadmap 028's forward-compatible `tab` tolerance.
  p.view = sanitizeShareView(p.view);
  p.sim = sanitizeShareSim(p.sim);
  // Roadmap 075: `pins` is cosmetic in the same sense — descriptors the app
  // re-simulates, which it would do for a hand-typed pin just the same — so a
  // malformed entry is dropped, never a reason to refuse the config.
  p.pins = sanitizeSharePins(p.pins);
  // Roadmap 087: the provenance slug is cosmetic-tier in the pins sense — a
  // malformed value is dropped, never a reason to refuse the config. What it
  // must not be is arbitrary text: the connect panel prints it on a button
  // and composes a request path from it on click, so it passes the same
  // bounded/control-character-free check every typed repo reference passes.
  p.repo =
    typeof p.repo === "string" && p.repo !== "" && isValidRepoRefPart(p.repo) ? p.repo : undefined;
  return { ok: true, payload: p };
}

/** Extracts the token from a `#config=…` location hash, or null. */
export function readShareToken(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  return params.get(FRAGMENT_KEY);
}

/** Builds the full shareable URL from the current location + a token. */
export function buildShareUrl(token: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${FRAGMENT_KEY}=${token}`;
}

// ---------------------------------------------------------------------------
// Security 2026-07-25 — where a link is allowed to point the run
// ---------------------------------------------------------------------------

/**
 * What opening this link is allowed to do, decided purely from the payload.
 * A `#config=` link auto-runs on open with zero clicks, and the endpoint it
 * carries selects the host every `local>` preset fetch (and therefore the
 * user's OAuth token / PAT) is sent to — so a link that names anything other
 * than the shipped public hosts runs with credentials withheld and may not
 * rewrite the persistent platform settings.
 */
export interface ShareRunPolicy {
  /** The platform the run would resolve `local>` against. */
  platform: string;
  /** The endpoint the run would actually use (pipeline.ts precedence). */
  endpoint: string;
  /** Every endpoint this link would apply that is not a trusted public host —
   *  deduped, in the order encountered. Empty when the link is trustworthy. */
  untrustedEndpoints: string[];
  /** Run this link with ALL tokens withheld from the engine. */
  suppressTokens: boolean;
  /** May the link's platform/endpoint be written to localStorage? A link must
   *  not silently repoint a persistent setting at an arbitrary host. */
  persistPlatformSettings: boolean;
}

/**
 * Mirrors the engine's `resolvePlatformContext` (packages/engine/src/pipeline.ts)
 * exactly — including the rule that the GLOBAL config layer's platform/endpoint
 * WIN over the payload's top-level ones unless `platformOverride` is set, and
 * that a global platform without a global endpoint invalidates the explicit
 * one. Kept in sync by construction: any divergence here would make the app
 * warn about a different host than the run actually contacts.
 */
function resolveEffectivePlatformContext(payload: SharePayload): {
  platform: string;
  endpoint: string;
  globalEndpoint: string | undefined;
} {
  const globalConfig = payload.globalConfig;
  const globalPlatform =
    typeof globalConfig?.platform === "string" ? globalConfig.platform : undefined;
  const globalEndpoint =
    typeof globalConfig?.endpoint === "string" ? globalConfig.endpoint : undefined;
  const overridden =
    payload.platformOverride === true &&
    (globalPlatform !== undefined || globalEndpoint !== undefined);
  const platform =
    (overridden ? (payload.platform ?? globalPlatform) : (globalPlatform ?? payload.platform)) ??
    DEFAULT_PLATFORM;
  const explicitEndpoint =
    !overridden && globalPlatform !== undefined && globalEndpoint === undefined
      ? undefined
      : payload.endpoint;
  const endpoint =
    (overridden ? (explicitEndpoint ?? globalEndpoint) : (globalEndpoint ?? explicitEndpoint)) ??
    PLATFORM_ENDPOINTS[platform] ??
    "";
  return { platform, endpoint, globalEndpoint };
}

/**
 * The token/persistence policy for opening a decoded payload. Pure — App.tsx's
 * `loadShareToken` supplies the payload and applies the outcome, so the
 * decision itself is unit-testable without a browser.
 *
 * Every endpoint the link would APPLY is considered, not just the winning one:
 * the top-level endpoint lands in the endpoint field (and, historically, in
 * localStorage) even when the global layer displaces it for this run, so it
 * would decide the NEXT run.
 */
export function decideShareRunPolicy(payload: SharePayload): ShareRunPolicy {
  const { platform, endpoint, globalEndpoint } = resolveEffectivePlatformContext(payload);
  const untrustedEndpoints: string[] = [];
  for (const candidate of [endpoint, payload.endpoint, globalEndpoint]) {
    if (candidate && !isTrustedEndpoint(candidate) && !untrustedEndpoints.includes(candidate)) {
      untrustedEndpoints.push(candidate);
    }
  }
  const suppressTokens = untrustedEndpoints.length > 0;
  return {
    platform,
    endpoint,
    untrustedEndpoints,
    suppressTokens,
    persistPlatformSettings: !suppressTokens,
  };
}

/**
 * Security 2026-07-25 (follow-up): the standing protection a link installs.
 * Acknowledging the banner must NOT end it — a user who clicks past a warning
 * without reading would otherwise be one Run click away from handing their
 * token to the attacker's host. The guard therefore survives the banner and
 * suppresses tokens on EVERY run (manual Run, injection/apply-fix re-runs, a
 * repo load that would use this endpoint) until the user either opts in
 * explicitly, hand-edits the platform/endpoint, or loads something else.
 */
export interface UntrustedEndpointGuard {
  /** Every untrusted endpoint the link applied (what the banner names). */
  endpoints: string[];
  /** The one host the opt-in button names — the endpoint the run actually
   *  contacts when that is the untrusted one, else the first untrusted. */
  host: string;
  /** True once the user chose "continue without tokens": the banner collapses
   *  to a small standing reminder, the suppression itself is unchanged. */
  acknowledged: boolean;
}

/** The guard a decoded payload installs, or null when the link is trusted. */
export function untrustedGuardForPolicy(policy: ShareRunPolicy): UntrustedEndpointGuard | null {
  if (!policy.suppressTokens) {
    return null;
  }
  const effectiveIsUntrusted = policy.untrustedEndpoints.includes(policy.endpoint);
  return {
    endpoints: policy.untrustedEndpoints,
    host: effectiveIsUntrusted
      ? policy.endpoint
      : (policy.untrustedEndpoints[0] ?? policy.endpoint),
    acknowledged: false,
  };
}

/**
 * Roadmap 017: what a `hashchange` event should do, decided as a pure
 * function of the new hash, the last token the app itself wrote into the
 * address bar (Copy link, or clearing an unreadable link — never a real
 * navigation), and whether the editor has drifted from the last
 * loaded/run baseline. Kept pure and DOM-free so it can be unit-tested
 * without mounting the app; App.tsx supplies the three inputs from
 * `window.location.hash`, a ref, and `content !== loadedContent`.
 */
export type HashChangeDecision =
  | { action: "ignore" }
  | { action: "load"; token: string; needsConfirm: boolean };

export function decideHashChangeAction(
  newHash: string,
  lastSelfWrittenToken: string | null,
  contentDiffersFromLoaded: boolean,
): HashChangeDecision {
  const token = readShareToken(newHash);
  if (!token || token === lastSelfWrittenToken) {
    return { action: "ignore" };
  }
  return { action: "load", token, needsConfirm: contentDiffersFromLoaded };
}
