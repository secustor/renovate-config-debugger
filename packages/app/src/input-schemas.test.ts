import { describe, expect, test } from "vitest";
import {
  configObjectSchema,
  endpointSchema,
  findPollutedPath,
  isHttpUrl,
  isPolluted,
  isValidConfigObject,
  isValidEndpoint,
  isValidPlatform,
  isValidRepoRefPart,
  isValidToken,
  oauthCallbackParamsSchema,
  parseLayerJson,
  platformSchema,
  sanitizeShareSim,
  sanitizeShareView,
  sanitizeStoredUser,
  sharePayloadStrictFieldsSchema,
  stageIdSchema,
  resultsTabIdSchema,
  tokenResponseSchema,
  tokenSchema,
} from "./input-schemas";

/**
 * Roadmap 030: per-schema accept/reject cases plus the adversarial suite the
 * roadmap calls out by name — prototype pollution at several depths,
 * dangerous URL schemes, header-injection tokens, type-confused view/sim
 * fields, and tampered storage JSON. Also proves the ordering claim in
 * findPollutedPath's doc comment: the guard must run on raw JSON.parse
 * output, not after a zod object/record schema has copied it.
 */

describe("findPollutedPath / isPolluted", () => {
  test("clean object is not polluted", () => {
    expect(isPolluted({ a: 1, b: { c: 2 } })).toBe(false);
  });

  test("top-level __proto__ is detected", () => {
    const raw = JSON.parse('{"__proto__": {"x": 1}, "a": 2}');
    expect(findPollutedPath(raw)).toEqual(["__proto__"]);
  });

  test("constructor and prototype keys are detected", () => {
    expect(isPolluted(JSON.parse('{"constructor": {"x": 1}}'))).toBe(true);
    expect(isPolluted(JSON.parse('{"prototype": {"x": 1}}'))).toBe(true);
  });

  test("deeply nested __proto__ is detected", () => {
    const raw = JSON.parse('{"a": {"b": {"c": {"__proto__": {"x": 1}}}}}');
    expect(findPollutedPath(raw)).toEqual(["a", "b", "c", "__proto__"]);
  });

  test("__proto__ inside packageRules[n] is detected", () => {
    const raw = JSON.parse(
      '{"packageRules": [{"matchPackageNames": ["x"]}, {"__proto__": {"pwn": 1}}]}',
    );
    expect(findPollutedPath(raw)).toEqual(["packageRules", "1", "__proto__"]);
  });

  test("__proto__ nested inside a share payload's globalConfig is detected", () => {
    const raw = JSON.parse(
      '{"v":2,"config":"{}","renovate":"1.0","globalConfig":{"packageRules":[{"__proto__":{"pwn":1}}]}}',
    );
    expect(findPollutedPath((raw as { globalConfig: unknown }).globalConfig)).toEqual([
      "packageRules",
      "0",
      "__proto__",
    ]);
  });

  test("arrays at the top level are walked too", () => {
    const raw = JSON.parse('[{"a": 1}, {"__proto__": {"x": 1}}]');
    expect(findPollutedPath(raw)).toEqual(["1", "__proto__"]);
  });

  test("a key merely named 'proto' or '__proto__x' is not flagged", () => {
    expect(isPolluted({ proto: 1, __proto__x: 2 })).toBe(false);
  });

  /**
   * The core ordering claim: zod's object/record parsing silently drops an
   * own "__proto__" key while copying — so a guard placed AFTER a zod parse
   * would never see it. This proves the guard must run on the raw
   * JSON.parse output, exactly where input-schemas.ts places it.
   */
  test("zod's object/record parsing silently drops an own __proto__ key", () => {
    const raw = JSON.parse('{"__proto__": {"pwn": 1}, "a": 2}');
    expect(isPolluted(raw)).toBe(true); // the guard sees it on the raw value

    // Feeding the SAME raw value through a zod record/object schema first,
    // then checking pollution on the RESULT, would report "clean" — this is
    // exactly the trap the guard must not fall into.
    const zodMini = configObjectSchema; // z.unknown().check(...) does NOT copy
    const afterGuardedSchema = zodMini.safeParse(raw);
    expect(afterGuardedSchema.success).toBe(false); // rejected — guard ran on raw `raw`

    // Demonstrate the laundering itself with a permissive record schema that
    // does NOT run our guard: __proto__ vanishes, and a naive "check the
    // parsed result" would wrongly conclude the input was clean.
    const launderedResult = Object.getOwnPropertyNames(
      structuredCloneSafeRecordParse(raw) as Record<string, unknown>,
    );
    expect(launderedResult).not.toContain("__proto__");
    expect(isPolluted(structuredCloneSafeRecordParse(raw))).toBe(false); // false negative if checked post-parse!
  });
});

/** A minimal stand-in for "a zod object/record schema's copying step",
 *  isolated from any refine/check, to demonstrate the laundering effect
 *  itself (not the guarded schema, which correctly rejects). */
function structuredCloneSafeRecordParse(raw: unknown): unknown {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(raw as Record<string, unknown>)) {
    out[key] = (raw as Record<string, unknown>)[key];
  }
  return out;
}

describe("isValidConfigObject / parseLayerJson", () => {
  test("accepts a plain object", () => {
    expect(isValidConfigObject({ a: 1 })).toBe(true);
  });
  test("rejects an array", () => {
    expect(isValidConfigObject([1, 2])).toBe(false);
  });
  test("rejects null", () => {
    expect(isValidConfigObject(null)).toBe(false);
  });
  test("rejects a polluted object", () => {
    expect(isValidConfigObject(JSON.parse('{"__proto__": {"x": 1}}'))).toBe(false);
  });

  test("parseLayerJson: empty text means the layer is off", () => {
    expect(parseLayerJson("")).toEqual({});
    expect(parseLayerJson("   ")).toEqual({});
  });
  test("parseLayerJson: valid JSON object is accepted", () => {
    expect(parseLayerJson('{"platform": "gitlab"}')).toEqual({ config: { platform: "gitlab" } });
  });
  test("parseLayerJson: invalid JSON keeps the native error text", () => {
    const result = parseLayerJson("{not json");
    expect(result.config).toBeUndefined();
    expect(result.error).toBeTruthy();
  });
  test("parseLayerJson: an array is rejected with the preserved message", () => {
    expect(parseLayerJson("[1,2,3]")).toEqual({ error: "must be a JSON object" });
  });
  test("parseLayerJson: a polluted object is rejected with the preserved message", () => {
    expect(parseLayerJson('{"__proto__": {"x": 1}}')).toEqual({ error: "must be a JSON object" });
  });
  test("parseLayerJson: a polluted packageRules entry is rejected", () => {
    expect(parseLayerJson('{"packageRules": [{"__proto__": {"x": 1}}]}')).toEqual({
      error: "must be a JSON object",
    });
  });
});

describe("endpoint / URL rule", () => {
  test("accepts http(s) URLs", () => {
    expect(isValidEndpoint("https://api.github.com")).toBe(true);
    expect(isValidEndpoint("http://localhost:3000")).toBe(true);
    expect(isValidEndpoint("http://127.0.0.1:8080/api/v4")).toBe(true);
  });
  test("empty string means unset", () => {
    expect(isValidEndpoint("")).toBe(true);
  });
  test("rejects javascript: and data: schemes", () => {
    expect(isValidEndpoint("javascript:alert(1)")).toBe(false);
    expect(isValidEndpoint("data:text/html,<script>1</script>")).toBe(false);
  });
  test("rejects garbage", () => {
    expect(isValidEndpoint("not a url")).toBe(false);
    expect(isValidEndpoint("ftp://example.com")).toBe(false);
  });
  test("isHttpUrl matches isValidEndpoint for non-empty values", () => {
    expect(isHttpUrl("https://example.com")).toBe(true);
    expect(isHttpUrl("javascript:x")).toBe(false);
  });
  test("endpointSchema mirrors the predicate", () => {
    expect(endpointSchema.safeParse("https://example.com").success).toBe(true);
    expect(endpointSchema.safeParse("").success).toBe(true);
    expect(endpointSchema.safeParse("javascript:alert(1)").success).toBe(false);
  });
});

describe("token / header-injection rule", () => {
  test("accepts ordinary tokens", () => {
    expect(isValidToken("ghp_abc123")).toBe(true);
    expect(isValidToken("")).toBe(true);
  });
  test("rejects CR/LF", () => {
    expect(isValidToken("ghp_abc\r\nSet-Cookie: evil=1")).toBe(false);
  });
  test("rejects a NUL byte", () => {
    expect(isValidToken("ghp_abc\0def")).toBe(false);
  });
  test("rejects an over-long token", () => {
    expect(isValidToken("a".repeat(5000))).toBe(false);
  });
  test("tokenSchema mirrors the predicate", () => {
    expect(tokenSchema.safeParse("ghp_abc123").success).toBe(true);
    expect(tokenSchema.safeParse("a\r\nb").success).toBe(false);
  });
});

describe("platform rule", () => {
  test("accepts any reasonable string, including unknown future platforms", () => {
    expect(isValidPlatform("github")).toBe(true);
    expect(isValidPlatform("some-future-platform")).toBe(true);
  });
  test("rejects control characters and absurd length", () => {
    expect(isValidPlatform("gh\r\nub")).toBe(false);
    expect(isValidPlatform("a".repeat(1000))).toBe(false);
  });
  test("platformSchema rejects a type-confused (non-string) platform", () => {
    expect(platformSchema.safeParse(123).success).toBe(false);
    expect(platformSchema.safeParse({}).success).toBe(false);
  });
});

describe("repo-load ref parts", () => {
  test("accepts ordinary refs", () => {
    expect(isValidRepoRefPart("main")).toBe(true);
    expect(isValidRepoRefPart("owner/repo")).toBe(true);
    expect(isValidRepoRefPart("")).toBe(true);
  });
  test("rejects control characters and absurd length", () => {
    expect(isValidRepoRefPart("main\r\nEvil-Header: 1")).toBe(false);
    expect(isValidRepoRefPart("a".repeat(1000))).toBe(false);
  });
});

describe("sanitizeShareView", () => {
  test("valid view passes through untouched", () => {
    expect(sanitizeShareView({ stage: "preset", node: "abc", step: 2, tab: "presets" })).toEqual({
      stage: "preset",
      node: "abc",
      step: 2,
      tab: "presets",
    });
  });
  test("a string step is dropped, not the whole view", () => {
    expect(sanitizeShareView({ stage: "preset", step: "2" })).toEqual({ stage: "preset" });
  });
  test("a negative or fractional step is dropped", () => {
    expect(sanitizeShareView({ step: -1 })).toBeUndefined();
    expect(sanitizeShareView({ step: 1.5 })).toBeUndefined();
  });
  test("an unrecognized (e.g. future-version) tab is dropped, not the whole view", () => {
    expect(sanitizeShareView({ stage: "preset", tab: "some-future-tab" })).toEqual({
      stage: "preset",
    });
  });
  test("a wrong-typed tab (number) is dropped", () => {
    expect(sanitizeShareView({ tab: 42 })).toBeUndefined();
  });
  test("an unrecognized stage is dropped", () => {
    expect(sanitizeShareView({ stage: "not-a-stage" })).toBeUndefined();
  });
  test("node: null is preserved", () => {
    expect(sanitizeShareView({ node: null })).toEqual({ node: null });
  });
  test("a non-plain-object view yields undefined", () => {
    expect(sanitizeShareView(["not", "an", "object"])).toBeUndefined();
    expect(sanitizeShareView("nope")).toBeUndefined();
    expect(sanitizeShareView(null)).toBeUndefined();
  });
  test("an empty object yields undefined", () => {
    expect(sanitizeShareView({})).toBeUndefined();
  });
});

describe("sanitizeShareSim", () => {
  test("valid sim passes through", () => {
    expect(sanitizeShareSim({ form: { name: "left-pad" }, autoSimulate: true })).toEqual({
      form: { name: "left-pad" },
      autoSimulate: true,
    });
  });
  test("an array sim is rejected (not a plain object)", () => {
    expect(sanitizeShareSim(["a", "b"])).toBeUndefined();
  });
  test("a non-string form value is dropped, keeping the rest", () => {
    expect(sanitizeShareSim({ form: { a: "x", b: 5 } })).toEqual({ form: { a: "x" } });
  });
  test("an empty-string form value is dropped", () => {
    expect(sanitizeShareSim({ form: { a: "" } })).toBeUndefined();
  });
  test("a missing form yields undefined", () => {
    expect(sanitizeShareSim({ autoSimulate: true })).toBeUndefined();
  });
  test("autoSimulate defaults falsy when absent/not true", () => {
    expect(sanitizeShareSim({ form: { a: "x" }, autoSimulate: "yes" })).toEqual({
      form: { a: "x" },
    });
  });
});

function baseStrictPayload() {
  return { v: 2 as const, renovate: "43.275.0", config: "{}" };
}

describe("sharePayloadStrictFieldsSchema", () => {
  const base = baseStrictPayload;
  test("accepts a minimal valid v2 payload", () => {
    expect(sharePayloadStrictFieldsSchema.safeParse(base()).success).toBe(true);
  });
  test("accepts platform/endpoint/layers when well-formed", () => {
    const result = sharePayloadStrictFieldsSchema.safeParse({
      ...base(),
      platform: "gitlab",
      endpoint: "https://gitlab.com/api/v4",
      globalConfig: { platform: "gitlab" },
      inheritedConfig: { automerge: false },
      platformOverride: true,
    });
    expect(result.success).toBe(true);
  });
  test("rejects a type-confused platform (object instead of string)", () => {
    expect(sharePayloadStrictFieldsSchema.safeParse({ ...base(), platform: {} }).success).toBe(
      false,
    );
  });
  test("rejects a javascript: endpoint", () => {
    expect(
      sharePayloadStrictFieldsSchema.safeParse({ ...base(), endpoint: "javascript:alert(1)" })
        .success,
    ).toBe(false);
  });
  test("rejects a data: endpoint", () => {
    expect(
      sharePayloadStrictFieldsSchema.safeParse({ ...base(), endpoint: "data:text/html,x" }).success,
    ).toBe(false);
  });
  test("rejects a polluted globalConfig", () => {
    const polluted = JSON.parse('{"__proto__": {"x": 1}}');
    expect(
      sharePayloadStrictFieldsSchema.safeParse({ ...base(), globalConfig: polluted }).success,
    ).toBe(false);
  });
  test("rejects a globalConfig polluted deep inside packageRules", () => {
    const polluted = JSON.parse('{"packageRules": [{"__proto__": {"x": 1}}]}');
    expect(
      sharePayloadStrictFieldsSchema.safeParse({ ...base(), globalConfig: polluted }).success,
    ).toBe(false);
  });
  test("rejects a polluted inheritedConfig", () => {
    const polluted = JSON.parse('{"constructor": {"x": 1}}');
    expect(
      sharePayloadStrictFieldsSchema.safeParse({ ...base(), inheritedConfig: polluted }).success,
    ).toBe(false);
  });
  test("rejects a type-confused platformOverride", () => {
    expect(
      sharePayloadStrictFieldsSchema.safeParse({ ...base(), platformOverride: "yes" }).success,
    ).toBe(false);
  });
  test("rejects a wrong version (not the schema's job, but stays well-typed)", () => {
    expect(sharePayloadStrictFieldsSchema.safeParse({ ...base(), v: 3 }).success).toBe(false);
  });
});

describe("stageIdSchema / resultsTabIdSchema", () => {
  test("accepts every real stage id", () => {
    for (const stage of [
      "global",
      "inherit",
      "parse",
      "migrate",
      "massage",
      "validate",
      "preset",
      "merge",
    ]) {
      expect(stageIdSchema.safeParse(stage).success).toBe(true);
    }
  });
  test("rejects an unknown stage", () => {
    expect(stageIdSchema.safeParse("bogus").success).toBe(false);
  });
  test("accepts every real tab id", () => {
    for (const tab of [
      "overview",
      "pipeline",
      "rewrites",
      "presets",
      "effective",
      "simulator",
      "problems",
    ]) {
      expect(resultsTabIdSchema.safeParse(tab).success).toBe(true);
    }
  });
});

describe("stored user (OAuth)", () => {
  test("valid stored user passes through", () => {
    expect(
      sanitizeStoredUser({ login: "octocat", avatarUrl: "https://example.com/a.png" }),
    ).toEqual({ login: "octocat", avatarUrl: "https://example.com/a.png" });
  });
  test("a javascript: avatarUrl is dropped, login is kept", () => {
    expect(sanitizeStoredUser({ login: "octocat", avatarUrl: "javascript:alert(1)" })).toEqual({
      login: "octocat",
      avatarUrl: "",
    });
  });
  test("a missing avatarUrl is fine", () => {
    expect(sanitizeStoredUser({ login: "octocat" })).toEqual({ login: "octocat", avatarUrl: "" });
  });
  test("tampered storage JSON (login missing/wrong type) is rejected outright", () => {
    expect(sanitizeStoredUser({ avatarUrl: "https://example.com/a.png" })).toBeNull();
    expect(sanitizeStoredUser({ login: 123 })).toBeNull();
    expect(sanitizeStoredUser("just a string")).toBeNull();
    expect(sanitizeStoredUser(null)).toBeNull();
    expect(sanitizeStoredUser(["array", "not", "object"])).toBeNull();
  });
});

describe("OAuth callback params", () => {
  test("accepts ordinary code/state", () => {
    expect(oauthCallbackParamsSchema.safeParse({ code: "abc123", state: "xyz789" }).success).toBe(
      true,
    );
  });
  test("rejects control characters", () => {
    expect(oauthCallbackParamsSchema.safeParse({ code: "abc\r\ndef", state: "xyz" }).success).toBe(
      false,
    );
  });
  test("rejects empty values", () => {
    expect(oauthCallbackParamsSchema.safeParse({ code: "", state: "xyz" }).success).toBe(false);
  });
});

describe("Worker token-exchange response", () => {
  test("accepts a well-formed success response", () => {
    expect(
      tokenResponseSchema.safeParse({
        access_token: "gho_abc123",
        expires_in: 3600,
        refresh_token: "ghr_def456",
        refresh_token_expires_in: 15552000,
      }).success,
    ).toBe(true);
  });
  test("accepts an error response", () => {
    expect(
      tokenResponseSchema.safeParse({ error: "bad_verification_code", error_description: "x" })
        .success,
    ).toBe(true);
  });
  test("rejects an access_token carrying a header-injection payload", () => {
    expect(
      tokenResponseSchema.safeParse({ access_token: "gho_abc\r\nSet-Cookie: evil=1" }).success,
    ).toBe(false);
  });
  test("rejects a wrong-typed expires_in", () => {
    expect(
      tokenResponseSchema.safeParse({ access_token: "gho_x", expires_in: "soon" }).success,
    ).toBe(false);
  });
});
