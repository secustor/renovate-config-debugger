/**
 * Roadmap 020 — share-link fixtures for the browser e2e suite.
 *
 * Roadmap 033: well-formed tokens come from the app's REAL codec
 * (`encodeShare` in src/lib/share.ts) — the wire format lives in one place, so a
 * codec change cannot silently diverge from what these tests produce. Only
 * the deliberately-shaped builders stay hand-written: raw JSON tokens for
 * payloads `encodeShare` refuses to produce (adversarial fields, pre-027
 * links without the integrity tag) and the truncate/garble corrupters. Those
 * use web globals only (CompressionStream, TextEncoder, btoa — available in
 * Node 20+ and the browser), the same wire shape the codec itself writes.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { configChecksum, encodeShare, type ShareSimulator, type ShareView } from "../src/lib/share";

export { configChecksum };

/** The two file names the share payload accepts. */
type ShareFileName = "renovate.json" | "renovate.json5";

/**
 * Roadmap 028: the view state a link carries. `tab` is the 028 addition; a
 * fixture that omits it reproduces a pre-028 link, whose tab the app has to
 * infer from stage/node/step. Loosely typed (plain strings) so a spec can
 * shape exactly the link it wants to test; a well-formed value passes through
 * the real codec's sanitizer unchanged — including `step: 0`, which
 * round-trips (the 033 fixpoint rule).
 */
interface ShareViewInput {
  stage?: string;
  node?: string;
  step?: number;
  tab?: string;
  /** Roadmap 044/054: the merge replay's stop index — restored next to a `sim`
   *  descriptor that reproduces the run whose replay it indexes. */
  simStep?: number;
}

interface SharePayloadInput {
  config: string;
  fileName?: ShareFileName;
  view?: ShareViewInput;
  /** Renovate version embedded for the drift check; matches the pinned engine
   *  dependency (packages/engine/package.json) — a mismatch is non-fatal (it
   *  only surfaces a dismissible notice), but matching keeps the tests quiet. */
  renovate?: string;
  platform?: string;
  endpoint?: string;
  sim?: ShareSimulator;
  /** Roadmap 075 (iteration 6): the pinned tests a link carries — descriptor
   *  field bags, the same shape `sim.form` has. */
  pins?: Record<string, string>[];
}

/**
 * The Renovate version the engine actually runs — read from the installed
 * package, not hand-copied. The app embeds `renovateVersion` (engine
 * `src/version.ts`, i.e. `renovate/package.json`'s own `version`) in every
 * share link, so reading the same file is what keeps a fixture's version tag
 * equal to the app's by construction. `renovate` is a dependency of the engine
 * package, not of this one, so resolution is anchored at the engine's
 * package.json rather than at this file.
 */
export const RENOVATE_VERSION: string = readInstalledRenovateVersion();

function readInstalledRenovateVersion(): string {
  const enginePkgJson = fileURLToPath(new URL("../../engine/package.json", import.meta.url));
  const pkgPath = createRequire(enginePkgJson).resolve("renovate/package.json");
  const { version } = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
  if (!version) {
    throw new Error(`no "version" field in ${pkgPath}`);
  }
  return version;
}

async function pipeThrough(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  // Type the stream as GenericTransformStream (writable: WritableStream) so the
  // writer accepts a plain Uint8Array — same pattern as src/lib/share.ts, which
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

/** Options for shaping the encoded token (e.g. producing a pre-027 link). */
interface EncodeOptions {
  /** Omit the 027 integrity field, reproducing an old link. Default: include it. */
  integrity?: boolean;
}

/** Builds the `#config=` fragment token for a payload. The default path IS
 *  `encodeShare()` from src/lib/share.ts; `integrity: false` reproduces a
 *  pre-027 link, which the real codec can no longer emit, so that payload is
 *  built by hand (see module doc comment). */
export async function encodeShareToken(
  input: SharePayloadInput,
  opts: EncodeOptions = {},
): Promise<string> {
  // Validate the config is real JSON before shipping it into a fixture — a
  // broken fixture should fail here, loudly, not silently in the browser.
  JSON.parse(input.config);
  if (opts.integrity === false) {
    // Pre-027 wire shape: no `c` field, view/sim written verbatim, and the
    // platform/endpoint defaults omitted exactly like the codec omits them.
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
    if (input.pins) {
      payload.pins = input.pins;
    }
    if (input.view) {
      payload.view = input.view;
    }
    return encodeRawShareToken(JSON.stringify(payload));
  }
  return encodeShare({
    config: input.config,
    fileName: input.fileName ?? "renovate.json",
    platform: input.platform ?? "github",
    endpoint: input.endpoint ?? "https://api.github.com",
    renovate: input.renovate ?? RENOVATE_VERSION,
    // The fixture's loose view strings are valid StageId/ResultsTabId values
    // in every spec; anything else would be dropped by the codec's sanitizer,
    // which is exactly what the app would do to such a link.
    view: input.view as ShareView | undefined,
    sim: input.sim,
    pins: input.pins,
  });
}

/** Convenience: the `#config=<token>` fragment (relative navigation target). */
export async function encodeShareFragment(
  input: SharePayloadInput,
  opts: EncodeOptions = {},
): Promise<string> {
  return `#config=${await encodeShareToken(input, opts)}`;
}

/**
 * Roadmap 030 — encodes a raw JSON STRING directly into a share token,
 * bypassing the real codec entirely. Needed for adversarial fixtures that
 * must express a key no ordinary JS object literal can: writing
 * `{ __proto__: ... }` (or even `{ "__proto__": ... }`) as object-literal
 * syntax sets the object's prototype instead of creating an own property, so
 * it would vanish before `JSON.stringify` ever put it on the wire. Building
 * the JSON text by hand instead guarantees the bytes really contain
 * `"__proto__":`, which the app's `JSON.parse` on decode turns into a
 * genuine own property — reproducing the real attack.
 */
export async function encodeRawShareToken(json: string): Promise<string> {
  const compressed = await deflateRaw(new TextEncoder().encode(json));
  return bytesToBase64url(compressed);
}

/** Simulates a link cut short in transit: drops the token's trailing chars.
 *  deflate-raw carries no length, so the shortened bytes fail to inflate —
 *  the app's "cut off" signature. */
export function truncateShareToken(token: string, chars = 12): string {
  return token.slice(0, Math.max(0, token.length - chars));
}

/** Simulates transit garbling: overwrites a run of chars with characters
 *  outside the base64url alphabet, so base64 decode itself fails — the app's
 *  "damaged" signature. */
export function garbleShareToken(token: string): string {
  const mid = Math.floor(token.length / 2);
  // Fragment-safe punctuation (no #/% to confuse the URL parser) that is still
  // outside the base64url alphabet, so atob rejects it.
  return `${token.slice(0, mid)}!!!!****~~~~${token.slice(mid + 12)}`;
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

/** `PACKAGE_RULES_CONFIG` plus the same validate-stage type error the automerge
 *  pair carries, so fixing it lands exactly on `PACKAGE_RULES_CONFIG`. The
 *  rules matter: the simulator renders its "hypothetical" banner and Simulate
 *  button only once there is something to simulate, so the banner's layout
 *  behaviour (Replay-02 R1) cannot be exercised by a rule-less config. */
export const INVALID_RULES_CONFIG = `{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "automerge": "yes",
  "packageRules": [
    {
      "matchPackageNames": ["lodash"],
      "matchUpdateTypes": ["minor", "patch"],
      "automerge": true
    }
  ]
}
`;

/** A config whose only issue is a deprecated option: `semanticCommits` used
 *  to be a boolean and is now the enum `"enabled"`/`"disabled"` — migrateConfig
 *  rewrites it. No `extends`, so it runs offline. Used by journey 024 (the
 *  Migrate stage chip's "changed" outcome). */
export const SEMANTIC_COMMITS_CONFIG = `{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "semanticCommits": true
}
`;

/** A config whose only content is `extends: ["config:recommended"]` — bundled
 *  with Renovate, so it resolves a real (large) preset tree offline. Used by
 *  028's shell tests, which need presets, provenance chips and a windowed
 *  tree to exist. */
export const EXTENDS_RECOMMENDED_CONFIG = `{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"]
}
`;

/** Two internal presets at tree depth 1 — always on screen, never windowed
 *  away — one resolved with options of its own (so its row carries the
 *  contribution counts) and one ignored (so its row carries a state pill).
 *  036's "badges are filled" assertion needs both kinds visible at once, and
 *  needs them without a fetch. */
export const IGNORED_PRESET_CONFIG = `{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [":dependencyDashboard", ":semanticCommits"],
  "ignorePresets": [":semanticCommits"]
}
`;

/** The structural identity (`>`-joined name-path from the tree root) of the
 *  single `config:recommended` node the config above resolves — what a
 *  pre-028 link's `view.node` stored. */
export const RECOMMENDED_NODE_IDENTITY = ">config:recommended";

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

/**
 * Roadmap 047: a config with an AUTHORED update-type block. The "npm
 * dependency" quick-fill is a PATCH update, so the `minor` block is consumed
 * by flattening without ever applying — the one case where the verdict card
 * still shows the consumed-blocks aside (Renovate's own default blocks, which
 * every other fixture has, must stay silent).
 */
export const AUTHORED_BLOCK_CONFIG = `{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "minor": {
    "automerge": true
  },
  "packageRules": [
    {
      "matchPackageNames": ["lodash"],
      "addLabels": ["from-lodash-rule"]
    }
  ]
}
`;

/**
 * Roadmap 054: a CONTESTED key. Two rules the "npm dependency" quick-fill
 * (lodash, patch) matches both write `groupName` with DIFFERENT values, so the
 * later one wins and the earlier one's value never reaches the final config —
 * the override cascade a verdict thread exists to show. The `react` rule never
 * matches, so it contributes no stop; `addLabels` (written only by the first
 * rule) gives its popover a surviving write to sit beside the lost one.
 */
export const CONTESTED_KEY_CONFIG = `{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "packageRules": [
    {
      "matchManagers": ["npm"],
      "groupName": "all npm dependencies",
      "addLabels": ["from-managers-rule"]
    },
    {
      "matchPackageNames": ["react"],
      "groupName": "never-applied"
    },
    {
      "matchPackageNames": ["lodash"],
      "matchUpdateTypes": ["minor", "patch"],
      "groupName": "lodash updates",
      "automerge": true
    }
  ]
}
`;

/**
 * Roadmap 044: a packageRules config where the "npm dependency" quick-fill
 * (lodash, patch) matches TWO rules that touch the same key — the merge
 * step-through's whole subject. The middle rule never matches, so it must not
 * appear as a step. No `extends`, so it runs offline.
 */
export const MERGE_STEPS_CONFIG = `{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "packageRules": [
    {
      "matchManagers": ["npm"],
      "automerge": false,
      "addLabels": ["from-managers-rule"]
    },
    {
      "matchPackageNames": ["react"],
      "addLabels": ["never-applied"]
    },
    {
      "matchPackageNames": ["lodash"],
      "matchUpdateTypes": ["minor", "patch"],
      "automerge": true,
      "addLabels": ["from-lodash-rule"]
    }
  ]
}
`;
