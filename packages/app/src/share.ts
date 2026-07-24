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
import type { StageId } from "@renovate-config-visualizer/engine";

const DEFAULT_PLATFORM = "github";
const DEFAULT_ENDPOINT = "https://api.github.com";
const FRAGMENT_KEY = "config";

export type ShareFileName = "renovate.json" | "renovate.json5";

export interface ShareView {
  stage?: StageId;
  /** Selected preset node's STRUCTURAL identity (stable across runs), not its id. */
  node?: string | null;
  /** Migration step index (only meaningful while the migrate stepper is mounted). */
  step?: number;
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
}

/**
 * The decoded payload as stored in the fragment. v2 (008) added the optional
 * global/inherited config layers; v1 payloads simply lack them.
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
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function pipeThrough(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Copy into a fresh ArrayBuffer-backed view — TextEncoder / atob outputs can
  // be typed as ArrayBufferLike, which the stream writer's types reject.
  void writer.write(new Uint8Array(bytes));
  void writer.close();
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
  const view = normalizeView(state.view);
  if (view) {
    payload.view = view;
  }
  const json = JSON.stringify(payload);
  const compressed = await deflateRaw(new TextEncoder().encode(json));
  return bytesToBase64url(compressed);
}

/** Drops empty view fields; returns undefined when nothing worth encoding. */
function normalizeView(view: ShareView | undefined): ShareView | undefined {
  if (!view) {
    return undefined;
  }
  const out: ShareView = {};
  if (view.stage) {
    out.stage = view.stage;
  }
  if (view.node) {
    out.node = view.node;
  }
  if (typeof view.step === "number" && view.step > 0) {
    out.step = view.step;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Decodes a fragment token back to a payload, or null on any failure. */
export async function decodeShare(token: string): Promise<SharePayload | null> {
  try {
    const bytes = base64urlToBytes(token);
    const json = new TextDecoder().decode(await inflateRaw(bytes));
    const parsed: unknown = JSON.parse(json);
    const version = (parsed as { v?: unknown } | null)?.v;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (version !== 1 && version !== 2) ||
      typeof (parsed as { config?: unknown }).config !== "string"
    ) {
      return null;
    }
    const p = parsed as SharePayload;
    // Normalize fileName to the two supported values.
    p.fileName = p.fileName === "renovate.json5" ? "renovate.json5" : "renovate.json";
    // Layer configs (v2) must be plain objects; drop anything else.
    if (!isPlainObject(p.globalConfig)) {
      delete p.globalConfig;
    }
    if (!isPlainObject(p.inheritedConfig)) {
      delete p.inheritedConfig;
    }
    if (typeof p.platformOverride !== "boolean") {
      delete p.platformOverride;
    }
    return p;
  } catch {
    return null;
  }
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
