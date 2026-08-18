import { describe, expect, test } from "vitest";
import {
  legacyTabForView,
  RESULTS_TAB_IDS,
  resultsTabForShareTab,
  shareTabWantsMigrateStage,
} from "@/data/results-tabs";
import {
  configChecksum,
  decideShareRunPolicy,
  decodeShareResult,
  encodeShare,
  type SharePayload,
  type ShareState,
  untrustedGuardForPolicy,
} from "./share";

/**
 * Roadmap 030: `share.ts` had zero unit coverage before this — the e2e suite
 * (10-share-diagnostics.spec.ts) only exercises the envelope-level 027
 * reasons through a real browser. This file adds a fast, DOM-free suite for
 * the decode path, focused on what 030 changed: the schema-validated
 * "damaged" classification for a decodable-but-hostile/type-confused
 * payload, and the per-field tolerant sanitization of `view`/`sim`.
 *
 * Tokens are built independently of `encodeShare` (a small local codec
 * mirroring share.ts's own deflate-raw/base64url wire format, the same
 * approach the e2e fixtures use) so a "hand-tampered" payload — one
 * `encodeShare` itself would never produce — can be expressed directly.
 */

async function pipeThrough(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(new Uint8Array(bytes));
  void writer.close();
  const buf = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buf);
}

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Encodes an arbitrary (possibly hand-tampered) payload object into a share
 *  token, bypassing `encodeShare`'s own normalization entirely. */
async function rawEncodeToken(payload: unknown): Promise<string> {
  return rawEncodeJsonText(JSON.stringify(payload));
}

/**
 * Encodes a raw JSON STRING directly (skipping `JSON.stringify` on a JS
 * object). Required for a `__proto__`-keyed payload: writing `{ __proto__:
 * ... }` (or even `{ "__proto__": ... }`) as a JS object LITERAL in this
 * test file does not create an own property at all — object-literal syntax
 * special-cases that exact key to set the prototype instead (the very
 * gotcha `findPollutedPath`'s doc comment warns about), so `JSON.stringify`
 * would silently drop it before it ever reached the wire. Building the JSON
 * text by hand instead guarantees the bytes actually contain `"__proto__":`,
 * which `JSON.parse` on the decode side turns into a genuine own property —
 * reproducing the real attack instead of a JS-syntax artifact of the test.
 */
async function rawEncodeJsonText(json: string): Promise<string> {
  const compressed = await pipeThrough(
    new TextEncoder().encode(json),
    new CompressionStream("deflate-raw"),
  );
  return bytesToBase64url(compressed);
}

function minimalState(overrides: Partial<ShareState> = {}): ShareState {
  return {
    config: '{"extends":["config:recommended"]}',
    fileName: "renovate.json",
    platform: "github",
    endpoint: "https://api.github.com",
    renovate: "43.275.0",
    ...overrides,
  };
}

describe("encodeShare / decodeShareResult round trip", () => {
  test("a minimal state round-trips", async () => {
    const token = await encodeShare(minimalState());
    const result = await decodeShareResult(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.config).toBe('{"extends":["config:recommended"]}');
      expect(result.payload.fileName).toBe("renovate.json");
      expect(result.payload.v).toBe(2);
    }
  });

  test("a full state (layers, view, sim) round-trips", async () => {
    const token = await encodeShare(
      minimalState({
        globalConfig: { platform: "gitlab" },
        inheritedConfig: { automerge: false },
        platformOverride: true,
        platform: "gitlab",
        endpoint: "https://gitlab.example.com/api/v4",
        view: { stage: "preset", node: "abc", step: 2, tab: "presets" },
        sim: { form: { name: "left-pad" }, autoSimulate: true },
      }),
    );
    const result = await decodeShareResult(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.globalConfig).toEqual({ platform: "gitlab" });
      expect(result.payload.inheritedConfig).toEqual({ automerge: false });
      expect(result.payload.platformOverride).toBe(true);
      expect(result.payload.platform).toBe("gitlab");
      expect(result.payload.endpoint).toBe("https://gitlab.example.com/api/v4");
      expect(result.payload.view).toEqual({
        stage: "preset",
        node: "abc",
        step: 2,
        tab: "presets",
      });
      expect(result.payload.sim).toEqual({ form: { name: "left-pad" }, autoSimulate: true });
    }
  });

  test("platform/endpoint at their defaults are omitted and default back on decode", async () => {
    const token = await encodeShare(minimalState());
    const result = await decodeShareResult(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.platform).toBeUndefined();
      expect(result.payload.endpoint).toBeUndefined();
    }
  });
});

/**
 * Roadmap 033: the encode side now runs the SAME sanitizers as the decoder
 * (input-schemas.ts) — before, the encode-side `normalizeView` dropped
 * `step: 0` while the decoder accepted it, so sharing the FIRST rewrite step
 * silently lost the step. Decode-side nonnegative is the rule: step is an
 * index and 0 is a real selection.
 */
describe("033: one sanitizer — encode∘decode fixpoints", () => {
  test("step: 0 (the first rewrite step) round-trips", async () => {
    const token = await encodeShare(
      minimalState({ view: { stage: "migrate", step: 0, tab: "pipeline" } }),
    );
    const result = await decodeShareResult(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.view).toEqual({ stage: "migrate", step: 0, tab: "pipeline" });
    }
  });

  test("re-encoding a decoded view/sim is a fixpoint (nothing changes on the second pass)", async () => {
    const state = minimalState({
      view: { stage: "preset", node: "abc", step: 0, tab: "presets" },
      // The empty form value is dropped on the FIRST encode; after that the
      // value must be stable through any number of encode∘decode passes.
      sim: { form: { name: "left-pad", empty: "" }, autoSimulate: true },
    });
    const first = await decodeShareResult(await encodeShare(state));
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.payload.sim).toEqual({ form: { name: "left-pad" }, autoSimulate: true });
    const second = await decodeShareResult(
      await encodeShare(minimalState({ view: first.payload.view, sim: first.payload.sim })),
    );
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.payload.view).toEqual(first.payload.view);
      expect(second.payload.sim).toEqual(first.payload.sim);
    }
  });

  test("simStep (044) round-trips alongside the migrate step and the sim inputs", async () => {
    const token = await encodeShare(
      minimalState({
        view: { stage: "merge", step: 0, simStep: 2, tab: "tests" },
        sim: { form: { packageName: "lodash" }, autoSimulate: true },
      }),
    );
    const result = await decodeShareResult(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.view).toEqual({
        stage: "merge",
        step: 0,
        simStep: 2,
        tab: "tests",
      });
      expect(result.payload.sim).toEqual({
        form: { packageName: "lodash" },
        autoSimulate: true,
      });
    }
  });

  test("an all-empty view is still omitted from the payload", async () => {
    const token = await encodeShare(minimalState({ view: {} }));
    const result = await decodeShareResult(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.view).toBeUndefined();
    }
  });
});

describe("027 envelope failure reasons (unchanged by 030)", () => {
  test("garbled base64 -> damaged", async () => {
    const token = await encodeShare(minimalState());
    const garbled = `${token.slice(0, Math.floor(token.length / 2))}!!!!****~~~~${token.slice(
      Math.floor(token.length / 2) + 12,
    )}`;
    const result = await decodeShareResult(garbled);
    expect(result).toEqual({ ok: false, reason: "damaged" });
  });

  test("truncated token -> cutOff", async () => {
    const token = await encodeShare(minimalState());
    const truncated = token.slice(0, Math.max(0, token.length - 12));
    const result = await decodeShareResult(truncated);
    expect(result).toEqual({ ok: false, reason: "cutOff" });
  });

  test("a checksum mismatch -> cutOff", async () => {
    const token = await rawEncodeToken({
      v: 2,
      renovate: "43.275.0",
      config: '{"extends":["config:recommended"]}',
      fileName: "renovate.json",
      c: "not-the-real-checksum",
    });
    const result = await decodeShareResult(token);
    expect(result).toEqual({ ok: false, reason: "cutOff" });
  });

  test("a pre-027 payload without the integrity field still decodes", async () => {
    const config = '{"extends":["config:recommended"]}';
    const token = await rawEncodeToken({
      v: 2,
      renovate: "43.275.0",
      config,
      fileName: "renovate.json",
      // no `c` field at all
    });
    const result = await decodeShareResult(token);
    expect(result.ok).toBe(true);
  });

  test("a non-object payload -> incompatible", async () => {
    const token = await rawEncodeToken("just a string");
    const result = await decodeShareResult(token);
    expect(result).toEqual({ ok: false, reason: "incompatible" });
  });

  test("an unknown version -> incompatible", async () => {
    const token = await rawEncodeToken({ v: 99, config: "{}", renovate: "1.0" });
    const result = await decodeShareResult(token);
    expect(result).toEqual({ ok: false, reason: "incompatible" });
  });

  test("a missing config field -> incompatible", async () => {
    const token = await rawEncodeToken({ v: 2, renovate: "1.0" });
    const result = await decodeShareResult(token);
    expect(result).toEqual({ ok: false, reason: "incompatible" });
  });
});

/** A structurally-valid v2 payload (correct integrity tag) with `extra`
 *  fields merged in — the base every 030 adversarial-field test tampers. */
function taggedPayload(extra: Record<string, unknown>) {
  const config = '{"extends":["config:recommended"]}';
  return {
    v: 2,
    renovate: "43.275.0",
    config,
    fileName: "renovate.json",
    c: configChecksum(config),
    ...extra,
  };
}

describe("030: schema-validated fields -> damaged", () => {
  test("a javascript: endpoint is refused (damaged)", async () => {
    const token = await rawEncodeToken(taggedPayload({ endpoint: "javascript:alert(1)" }));
    expect(await decodeShareResult(token)).toEqual({ ok: false, reason: "damaged" });
  });

  test("a data: endpoint is refused (damaged)", async () => {
    const token = await rawEncodeToken(taggedPayload({ endpoint: "data:text/html,<b>hi</b>" }));
    expect(await decodeShareResult(token)).toEqual({ ok: false, reason: "damaged" });
  });

  test("a type-confused platform (object) is refused (damaged)", async () => {
    const token = await rawEncodeToken(taggedPayload({ platform: { evil: true } }));
    expect(await decodeShareResult(token)).toEqual({ ok: false, reason: "damaged" });
  });

  test("a __proto__-polluted globalConfig is refused (damaged)", async () => {
    const config = '{"extends":["config:recommended"]}';
    const json =
      `{"v":2,"renovate":"43.275.0","config":${JSON.stringify(config)},` +
      `"fileName":"renovate.json","c":${JSON.stringify(configChecksum(config))},` +
      `"globalConfig":{"__proto__":{"pwned":true},"platform":"gitlab"}}`;
    const token = await rawEncodeJsonText(json);
    expect(await decodeShareResult(token)).toEqual({ ok: false, reason: "damaged" });
  });

  test("a __proto__ nested inside globalConfig.packageRules is refused (damaged)", async () => {
    const config = '{"extends":["config:recommended"]}';
    const json =
      `{"v":2,"renovate":"43.275.0","config":${JSON.stringify(config)},` +
      `"fileName":"renovate.json","c":${JSON.stringify(configChecksum(config))},` +
      `"globalConfig":{"packageRules":[{"matchPackageNames":["x"]},{"__proto__":{"p":1}}]}}`;
    const token = await rawEncodeJsonText(json);
    expect(await decodeShareResult(token)).toEqual({ ok: false, reason: "damaged" });
  });

  test("a constructor-polluted inheritedConfig is refused (damaged)", async () => {
    const token = await rawEncodeToken(
      taggedPayload({ inheritedConfig: { constructor: { p: 1 } } }),
    );
    expect(await decodeShareResult(token)).toEqual({ ok: false, reason: "damaged" });
  });

  test("a type-confused platformOverride (string) is refused (damaged)", async () => {
    const token = await rawEncodeToken(taggedPayload({ platformOverride: "yes" }));
    expect(await decodeShareResult(token)).toEqual({ ok: false, reason: "damaged" });
  });

  test("a well-formed self-hosted endpoint (localhost) is accepted", async () => {
    const token = await rawEncodeToken(taggedPayload({ endpoint: "http://localhost:3000" }));
    const result = await decodeShareResult(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.endpoint).toBe("http://localhost:3000");
    }
  });
});

describe("030: view/sim are sanitized per-field, never hard-fail the payload", () => {
  test("a string view.step still loads the config; step is dropped", async () => {
    const token = await rawEncodeToken(taggedPayload({ view: { stage: "preset", step: "2" } }));
    const result = await decodeShareResult(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.view).toEqual({ stage: "preset" });
    }
  });

  // Roadmap 044: the new field is additive within v2 in BOTH directions — a
  // pre-044 link (no `simStep`) decodes exactly as it did, and a hand-edited or
  // future-mangled `simStep` is dropped on its own like every other view field.
  test("a pre-044 link without simStep decodes unchanged; a malformed simStep is dropped alone", async () => {
    const old = await rawEncodeToken(
      taggedPayload({ view: { stage: "preset", step: 1, tab: "rewrites" } }),
    );
    const oldResult = await decodeShareResult(old);
    expect(oldResult.ok).toBe(true);
    if (oldResult.ok) {
      expect(oldResult.payload.view).toEqual({ stage: "preset", step: 1, tab: "rewrites" });
      expect(oldResult.payload.view?.simStep).toBeUndefined();
    }

    const mangled = await rawEncodeToken(
      taggedPayload({ view: { tab: "simulator", simStep: -3 } }),
    );
    const mangledResult = await decodeShareResult(mangled);
    expect(mangledResult.ok).toBe(true);
    if (mangledResult.ok) {
      expect(mangledResult.payload.view).toEqual({ tab: "simulator" });
    }
  });

  test("an array sim still loads the config; sim is dropped", async () => {
    const token = await rawEncodeToken(taggedPayload({ sim: ["a", "b"] }));
    const result = await decodeShareResult(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sim).toBeUndefined();
    }
  });

  test("an unrecognized (future-version) tab still loads the config; tab is dropped", async () => {
    const token = await rawEncodeToken(
      taggedPayload({ view: { stage: "preset", tab: "some-future-tab" } }),
    );
    const result = await decodeShareResult(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.view).toEqual({ stage: "preset" });
    }
  });

  test("a mixed-type sim.form keeps the valid entries and drops the rest", async () => {
    const token = await rawEncodeToken(taggedPayload({ sim: { form: { a: "x", b: 5 } } }));
    const result = await decodeShareResult(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sim).toEqual({ form: { a: "x" } });
    }
  });
});

describe("030: fileName keeps its lenient normalize-not-reject behavior", () => {
  test("an unrecognized fileName quietly defaults to renovate.json", async () => {
    const config = "{}";
    const token = await rawEncodeToken({
      v: 2,
      renovate: "43.275.0",
      config,
      fileName: "not-a-real-filename.txt",
      c: configChecksum(config),
    });
    const result = await decodeShareResult(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.fileName).toBe("renovate.json");
    }
  });

  test("renovate.json5 is preserved", async () => {
    const config = "{}";
    const token = await rawEncodeToken({
      v: 2,
      renovate: "43.275.0",
      config,
      fileName: "renovate.json5",
      c: configChecksum(config),
    });
    const result = await decodeShareResult(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.fileName).toBe("renovate.json5");
    }
  });
});

/**
 * Security 2026-07-25 — `decideShareRunPolicy`. A `#config=` link auto-runs on
 * open, and the endpoint it carries selects the host every `local>` preset
 * fetch (with the user's OAuth token / PAT attached) is sent to. This is the
 * pure decision App.tsx's `loadShareToken` applies: which endpoints the run
 * would really reach, whether to withhold every credential, and whether the
 * link may rewrite the persistent platform settings.
 */
function testPayload(overrides: Partial<SharePayload> = {}): SharePayload {
  return {
    v: 2,
    renovate: "43.275.0",
    config: "{}",
    fileName: "renovate.json",
    ...overrides,
  };
}

describe("decideShareRunPolicy: trusted links behave as before", () => {
  test("a bare link (no platform/endpoint) defaults to github and keeps tokens", () => {
    const policy = decideShareRunPolicy(testPayload());
    expect(policy).toMatchObject({
      platform: "github",
      endpoint: "https://api.github.com",
      untrustedEndpoints: [],
      suppressTokens: false,
      persistPlatformSettings: true,
    });
  });

  test("every shipped public host is trusted, with or without a trailing slash", () => {
    for (const [platform, endpoint] of [
      ["github", "https://api.github.com"],
      ["gitlab", "https://gitlab.com/api/v4/"],
      ["gitea", "https://gitea.com/"],
      ["forgejo", "https://codeberg.org"],
    ] as const) {
      const policy = decideShareRunPolicy(testPayload({ platform, endpoint }));
      expect(policy.suppressTokens).toBe(false);
      expect(policy.untrustedEndpoints).toEqual([]);
    }
  });

  test("a platform that is not fetched in the browser has nothing to distrust", () => {
    const policy = decideShareRunPolicy(testPayload({ platform: "azure" }));
    expect(policy.endpoint).toBe("");
    expect(policy.suppressTokens).toBe(false);
  });

  test("a trusted endpoint in the global layer keeps tokens", () => {
    const policy = decideShareRunPolicy(
      testPayload({ globalConfig: { platform: "gitea", endpoint: "https://gitea.com" } }),
    );
    expect(policy.platform).toBe("gitea");
    expect(policy.suppressTokens).toBe(false);
  });
});

describe("decideShareRunPolicy: an untrusted endpoint suppresses tokens", () => {
  test("leg A — the payload's top-level endpoint", () => {
    const policy = decideShareRunPolicy(testPayload({ endpoint: "https://evil.example/" }));
    expect(policy.endpoint).toBe("https://evil.example/");
    expect(policy.untrustedEndpoints).toEqual(["https://evil.example/"]);
    expect(policy.suppressTokens).toBe(true);
    expect(policy.persistPlatformSettings).toBe(false);
  });

  test("leg B — globalConfig.endpoint, which WINS over the top-level one", () => {
    const policy = decideShareRunPolicy(
      testPayload({
        endpoint: "https://api.github.com",
        globalConfig: { endpoint: "https://evil.example/" },
      }),
    );
    // Mirrors pipeline.ts: the global layer's endpoint is what actually runs.
    expect(policy.endpoint).toBe("https://evil.example/");
    expect(policy.suppressTokens).toBe(true);
  });

  test("an untrusted top-level endpoint counts even when the global layer displaces it", () => {
    // The pipeline would use gitea.com for THIS run, but the link still lands
    // the evil endpoint in the endpoint field, where a later Run would use it.
    const policy = decideShareRunPolicy(
      testPayload({
        endpoint: "https://evil.example/",
        globalConfig: { endpoint: "https://gitea.com" },
      }),
    );
    expect(policy.endpoint).toBe("https://gitea.com");
    expect(policy.untrustedEndpoints).toEqual(["https://evil.example/"]);
    expect(policy.suppressTokens).toBe(true);
  });

  test("platformOverride flips the precedence, exactly like the pipeline", () => {
    const policy = decideShareRunPolicy(
      testPayload({
        endpoint: "https://api.github.com",
        globalConfig: { endpoint: "https://evil.example/" },
        platformOverride: true,
      }),
    );
    expect(policy.endpoint).toBe("https://api.github.com");
    // Still suppressed: the untrusted endpoint is applied to the UI/global layer.
    expect(policy.untrustedEndpoints).toEqual(["https://evil.example/"]);
    expect(policy.suppressTokens).toBe(true);
  });

  test("a global platform without a global endpoint invalidates the explicit one", () => {
    // pipeline.ts: without an override, a global-config platform displaces the
    // toolbar endpoint entirely — the run falls back to gitea's own default.
    const policy = decideShareRunPolicy(
      testPayload({ endpoint: "https://evil.example/", globalConfig: { platform: "gitea" } }),
    );
    expect(policy.endpoint).toBe("https://gitea.com");
    // …but the evil endpoint is still what the UI/localStorage would carry.
    expect(policy.suppressTokens).toBe(true);
  });

  test("look-alike hosts are not trusted", () => {
    for (const endpoint of [
      "https://api.github.com.evil.example/",
      "https://api.github.com@evil.example/",
      "http://api.github.com/",
      "https://evil.example/api.github.com",
      "https://gitlab.com/api/v4/../../evil",
    ]) {
      expect(decideShareRunPolicy(testPayload({ endpoint })).suppressTokens).toBe(true);
    }
  });

  test("both endpoints are named when both are untrusted, deduped", () => {
    const policy = decideShareRunPolicy(
      testPayload({
        endpoint: "https://evil.example/",
        globalConfig: { endpoint: "https://other.example/" },
      }),
    );
    expect(policy.untrustedEndpoints).toEqual(["https://other.example/", "https://evil.example/"]);
  });

  test("the same untrusted endpoint on both legs is reported once", () => {
    const policy = decideShareRunPolicy(
      testPayload({
        endpoint: "https://evil.example/",
        globalConfig: { endpoint: "https://evil.example/" },
      }),
    );
    expect(policy.untrustedEndpoints).toEqual(["https://evil.example/"]);
  });
});

/**
 * Security 2026-07-25 (follow-up) — the guard a link installs. Acknowledging
 * the banner must not end it: suppression is a property of the platform
 * context in force, not of whether a warning is on screen.
 */
describe("untrustedGuardForPolicy", () => {
  test("a trusted link installs no guard", () => {
    expect(untrustedGuardForPolicy(decideShareRunPolicy(testPayload()))).toBeNull();
    expect(
      untrustedGuardForPolicy(
        decideShareRunPolicy(testPayload({ platform: "gitea", endpoint: "https://gitea.com" })),
      ),
    ).toBeNull();
  });

  test("an untrusted link installs an unacknowledged guard naming the host", () => {
    const guard = untrustedGuardForPolicy(
      decideShareRunPolicy(testPayload({ endpoint: "https://evil.example/" })),
    );
    expect(guard).toEqual({
      endpoints: ["https://evil.example/"],
      host: "https://evil.example/",
      acknowledged: false,
    });
  });

  test("the host named is the one the run actually contacts", () => {
    // The global layer wins for this run, so IT is what the opt-in must name,
    // even though the (also untrusted) top-level endpoint is listed too.
    const guard = untrustedGuardForPolicy(
      decideShareRunPolicy(
        testPayload({
          endpoint: "https://stale.example/",
          globalConfig: { endpoint: "https://effective.example/" },
        }),
      ),
    );
    expect(guard?.host).toBe("https://effective.example/");
    expect(guard?.endpoints).toEqual(["https://effective.example/", "https://stale.example/"]);
  });

  test("falls back to the first untrusted endpoint when the effective one is trusted", () => {
    // The run itself would reach gitea.com, but the link still parked an
    // untrusted endpoint in the endpoint field — that is what to name.
    const guard = untrustedGuardForPolicy(
      decideShareRunPolicy(
        testPayload({
          endpoint: "https://evil.example/",
          globalConfig: { endpoint: "https://gitea.com" },
        }),
      ),
    );
    expect(guard?.host).toBe("https://evil.example/");
  });
});

/**
 * Roadmap 054 (layer 4): `sim.simThread` — the expanded verdict thread's key —
 * is additive within v2 exactly like `autoSimulate` was, so the tests are the
 * same two questions: does a link that carries it round-trip, and does a link
 * from before it existed still decode as it always did?
 */
describe("054: sim.simThread round-trips and stays additive", () => {
  test("a simulation link carrying an expanded thread round-trips", async () => {
    const token = await encodeShare(
      minimalState({
        view: { stage: "merge", simStep: 2, tab: "tests" },
        sim: { form: { packageName: "oxlint" }, autoSimulate: true, simThread: "groupName" },
      }),
    );
    const result = await decodeShareResult(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sim).toEqual({
        form: { packageName: "oxlint" },
        autoSimulate: true,
        simThread: "groupName",
      });
      // The thread rides with the SIM descriptor, not the view: it is only
      // meaningful for the simulation the form reproduces.
      expect(result.payload.view).toEqual({ stage: "merge", simStep: 2, tab: "tests" });
    }
  });

  test("re-encoding a decoded sim with a thread is a fixpoint", async () => {
    const first = await decodeShareResult(
      await encodeShare(
        minimalState({ sim: { form: { depName: "lodash" }, simThread: "automerge" } }),
      ),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.payload.sim).toEqual({ form: { depName: "lodash" }, simThread: "automerge" });
    const second = await decodeShareResult(
      await encodeShare(minimalState({ sim: first.payload.sim })),
    );
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.payload.sim).toEqual(first.payload.sim);
    }
  });

  test("a pre-054 link (no simThread) decodes exactly as before", async () => {
    const token = await rawEncodeToken(
      taggedPayload({ sim: { form: { packageName: "lodash" }, autoSimulate: true } }),
    );
    const result = await decodeShareResult(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sim).toEqual({ form: { packageName: "lodash" }, autoSimulate: true });
      expect(result.payload.sim?.simThread).toBeUndefined();
    }
  });

  test("a malformed simThread is dropped alone — the link still opens and runs", async () => {
    for (const simThread of [42, "", "x".repeat(200), { key: "groupName" }]) {
      const token = await rawEncodeToken(
        taggedPayload({ sim: { form: { packageName: "lodash" }, autoSimulate: true, simThread } }),
      );
      const result = await decodeShareResult(token);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.payload.sim).toEqual({ form: { packageName: "lodash" }, autoSimulate: true });
      }
    }
  });

  test("a simThread without a form is dropped with the rest of the descriptor", async () => {
    const token = await rawEncodeToken(
      taggedPayload({ sim: { form: {}, simThread: "groupName" } }),
    );
    const result = await decodeShareResult(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sim).toBeUndefined();
    }
  });
});

/**
 * Roadmap 075 (v2, iteration 3) — the five-tab model retired three tab ids that
 * links already in the wild still carry. The compatibility contract has two
 * halves and both are asserted here: links ENCODE only current ids, and the
 * DECODER accepts the retired ones and says which tab each opens.
 */
describe("075: retired tab ids still open the tab that replaced them", () => {
  test("the strip is the v2 five, and none of them is a retired id", () => {
    expect(RESULTS_TAB_IDS).toEqual(["tests", "pipeline", "presets", "effective", "problems"]);
  });

  test("each retired id maps to its successor", () => {
    // The digest the Overview opened on is the header's now, and a run lands on
    // Tests — so that is where an `overview` link goes.
    expect(resultsTabForShareTab("overview")).toBe("tests");
    // The same instrument, renamed.
    expect(resultsTabForShareTab("simulator")).toBe("tests");
    // Folded into Pipeline's migrate stage.
    expect(resultsTabForShareTab("rewrites")).toBe("pipeline");
    // A current id is its own answer — the mapping is not a rename table with a
    // default, it is total over what a link may say.
    for (const id of RESULTS_TAB_IDS) {
      expect(resultsTabForShareTab(id)).toBe(id);
    }
  });

  test("only `rewrites` also asks for the migrate stage", () => {
    // Pipeline on its default stage would put an old link's reader in front of
    // something its sender was not looking at; the stepper lives on migrate.
    expect(shareTabWantsMigrateStage("rewrites")).toBe(true);
    expect(shareTabWantsMigrateStage("overview")).toBe(false);
    expect(shareTabWantsMigrateStage("simulator")).toBe(false);
    for (const id of RESULTS_TAB_IDS) {
      expect(shareTabWantsMigrateStage(id)).toBe(false);
    }
  });

  test("a pre-028 link's inferred tab follows the same reshuffle", () => {
    // `step` used to infer Rewrites; the stepper moved, so the inference does.
    expect(legacyTabForView({ stage: "migrate", step: 0 })).toBe("pipeline");
    expect(legacyTabForView({ stage: "validate" })).toBe("pipeline");
    // Unchanged: a selected node is still the most specific thing a link
    // carries, and it still beats a step.
    expect(legacyTabForView({ stage: "migrate", step: 0, node: "abc" })).toBe("presets");
    expect(legacyTabForView({})).toBeNull();
  });

  test("a retired id survives the decoder verbatim, for the opener to map", async () => {
    // Sanitizing it away would land the reader on the default tab instead of
    // the one the sender meant — worse than the id being unknown.
    for (const legacy of ["overview", "simulator", "rewrites"] as const) {
      const token = await rawEncodeToken(taggedPayload({ view: { stage: "preset", tab: legacy } }));
      const result = await decodeShareResult(token);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.payload.view?.tab).toBe(legacy);
      }
    }
  });

  test("a tab id from neither era is still dropped on its own", async () => {
    const token = await rawEncodeToken(
      taggedPayload({ view: { stage: "preset", tab: "extraction" } }),
    );
    const result = await decodeShareResult(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.view).toEqual({ stage: "preset" });
    }
  });
});
