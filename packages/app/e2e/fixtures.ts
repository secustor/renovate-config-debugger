/**
 * Roadmap 020 — share-link fixtures for the browser e2e suite.
 *
 * The token codec is ported verbatim from 019's `generate-links.mjs` and the
 * app's own `src/share.ts`: payload → JSON → UTF-8 → deflate-raw
 * (CompressionStream) → base64url (no padding), placed after `#config=`. It is
 * written with web globals only (CompressionStream, TextEncoder, btoa,
 * Uint8Array — all available in Node 20+ and the browser), so no Node-specific
 * types or dependencies are needed and the wire format is guaranteed identical
 * to what the app decodes.
 */

/** The two file names the share payload accepts. */
export type ShareFileName = "renovate.json" | "renovate.json5";

/** The simulator descriptor a link can carry (roadmap 018). */
export interface ShareSimulator {
  form: Record<string, string>;
  autoSimulate?: boolean;
}

export interface SharePayloadInput {
  config: string;
  fileName?: ShareFileName;
  /** Renovate version embedded for the drift check; matches the pinned engine
   *  dependency (packages/engine/package.json) — a mismatch is non-fatal (it
   *  only surfaces a dismissible notice), but matching keeps the tests quiet. */
  renovate?: string;
  platform?: string;
  endpoint?: string;
  sim?: ShareSimulator;
}

/** The Renovate version pinned in packages/engine/package.json. */
export const RENOVATE_VERSION = "43.275.0";

async function pipeThrough(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  // Type the stream as GenericTransformStream (writable: WritableStream) so the
  // writer accepts a plain Uint8Array — same pattern as src/share.ts, which
  // works around TextEncoder outputs being typed as ArrayBufferLike.
  const writer = stream.writable.getWriter();
  void writer.write(new Uint8Array(bytes));
  void writer.close();
  const buf = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buf);
}

function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(bytes, new CompressionStream("deflate-raw"));
}

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Builds the `#config=` fragment token for a payload — same wire shape as
 *  `encodeShare()` in src/share.ts and 019's generator produce. */
export async function encodeShareToken(input: SharePayloadInput): Promise<string> {
  // Validate the config is real JSON before shipping it into a fixture — a
  // broken fixture should fail here, loudly, not silently in the browser.
  JSON.parse(input.config);
  const payload: Record<string, unknown> = {
    v: 2,
    renovate: input.renovate ?? RENOVATE_VERSION,
    config: input.config,
    fileName: input.fileName ?? "renovate.json",
  };
  if (input.platform && input.platform !== "github") {
    payload.platform = input.platform;
  }
  if (input.endpoint && input.endpoint !== "https://api.github.com") {
    payload.endpoint = input.endpoint;
  }
  if (input.sim) {
    payload.sim = input.sim;
  }
  const json = JSON.stringify(payload);
  const compressed = await deflateRaw(new TextEncoder().encode(json));
  return bytesToBase64url(compressed);
}

/** Convenience: the `#config=<token>` fragment (relative navigation target). */
export async function encodeShareFragment(input: SharePayloadInput): Promise<string> {
  return `#config=${await encodeShareToken(input)}`;
}

// ---------------------------------------------------------------------------
// Fixture configs — all self-contained (no `extends`, so preset resolution
// needs no network) and deterministic offline.
// ---------------------------------------------------------------------------

/** A config whose ONLY problem is a validate-stage type error: `automerge`
 *  must be a boolean, not the string "yes". Fixing it (→ true) clears the
 *  error. Used by journey 3 (paste → run → error → fix → re-run → error gone). */
export const INVALID_AUTOMERGE_CONFIG = `{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "automerge": "yes"
}
`;

/** The same config with the error fixed — the target of journey 3's edit. */
export const FIXED_AUTOMERGE_CONFIG = `{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "automerge": true
}
`;

/** A packageRules config with a minor/patch-scoped automerge rule matching a
 *  named npm dependency (lodash). The "npm dependency" quick-fill chip
 *  describes exactly such an update, so it matches this rule. No `extends`, so
 *  it runs offline. Used by journeys 1, 2 and 4. */
export const PACKAGE_RULES_CONFIG = `{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "packageRules": [
    {
      "matchPackageNames": ["lodash"],
      "matchUpdateTypes": ["minor", "patch"],
      "automerge": true
    }
  ]
}
`;
