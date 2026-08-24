/**
 * Roadmap 076/030: the custom credential rows survive a round trip, and a
 * tampered or drifted sessionStorage value can never hand a bad credential to
 * a request header — it reads back as fewer rows, or none, never as a throw.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  type CustomHostRule,
  HOST_RULES_KEY,
  persistCustomHostRules,
  readCustomHostRules,
} from "./custom-host-rules";

const RULE: CustomHostRule = { host: "gitea.example.com", hostType: "gitea", token: "t1" };

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// The unit project runs in plain Node (see vitest.config.ts): the storage
// global is stubbed per test, same as storage.test.ts does.
const g = globalThis as { sessionStorage?: StorageLike };
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  g.sessionStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
});

afterEach(() => {
  delete g.sessionStorage;
});

describe("custom host rules", () => {
  test("round-trips a list", () => {
    persistCustomHostRules([RULE, { host: "registry.npmjs.org", hostType: "npm", token: "t2" }]);
    expect(readCustomHostRules()).toEqual([
      RULE,
      { host: "registry.npmjs.org", hostType: "npm", token: "t2" },
    ]);
  });

  test("an empty list removes the key rather than storing []", () => {
    persistCustomHostRules([RULE]);
    persistCustomHostRules([]);
    expect(store.get(HOST_RULES_KEY)).toBeUndefined();
    expect(readCustomHostRules()).toEqual([]);
  });

  test("never persists a rule that could not be read back", () => {
    persistCustomHostRules([
      RULE,
      { host: "https://evil.example.com/x", hostType: "any", token: "t" },
      { host: "ok.example.com", hostType: "any", token: "bad\r\ntoken" },
      { host: "ok.example.com", hostType: "NOT A TYPE", token: "t" },
      { host: "ok.example.com", hostType: "any", token: "" },
    ]);
    expect(readCustomHostRules()).toEqual([RULE]);
  });

  test("drops individual invalid entries on read", () => {
    store.set(HOST_RULES_KEY, JSON.stringify([RULE, { host: "no token" }, null, "nope", 7]));
    expect(readCustomHostRules()).toEqual([RULE]);
  });

  test("treats unparseable or non-array storage as no rules", () => {
    store.set(HOST_RULES_KEY, "{not json");
    expect(readCustomHostRules()).toEqual([]);
    store.set(HOST_RULES_KEY, JSON.stringify({ host: "x" }));
    expect(readCustomHostRules()).toEqual([]);
    expect(store.get(HOST_RULES_KEY)).toBeUndefined();
  });

  test("no stored value is no rules", () => {
    expect(readCustomHostRules()).toEqual([]);
  });
});
