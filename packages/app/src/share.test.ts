import { describe, expect, test } from "vitest";
import { configChecksum, decodeShareResult, encodeShare, type ShareState } from "./share";

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
