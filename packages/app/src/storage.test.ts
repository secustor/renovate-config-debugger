import { afterEach, describe, expect, test } from "vitest";
import {
  localGet,
  localRemove,
  localSet,
  persistSession,
  readLocal,
  readSession,
  runStorageMigrations,
  sessionGet,
  sessionRemove,
  sessionSet,
} from "./storage";

/**
 * Roadmap 033 — the storage wrappers under the conditions that used to
 * white-screen the app: storage that THROWS on every access (Safari private
 * windows historically, cookie-blocking modes, lockdown webviews) and storage
 * that is absent entirely. Every wrapper must degrade to "value not there" /
 * "write didn't stick", and the one-time migration must neither throw before
 * `createRoot()` nor ever run twice against working storage.
 */

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const onlyGood = (v: string) => v === "good";

/** A minimal working storage; `map` is exposed for direct assertions. */
function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const boom = () => {
  throw new Error("The operation is insecure.");
};

/** Storage in the disabled state: every access throws (the Safari behavior). */
function throwingStorage(): StorageLike {
  return { getItem: boom, setItem: boom, removeItem: boom };
}

// vitest runs these in a plain Node environment: the storage globals are
// stubbed per-test and cleared afterwards.
const g = globalThis as { localStorage?: StorageLike; sessionStorage?: StorageLike };

afterEach(() => {
  delete g.localStorage;
  delete g.sessionStorage;
});

describe("safe wrappers with working storage", () => {
  test("get/set/remove round-trip", () => {
    g.localStorage = memoryStorage();
    g.sessionStorage = memoryStorage();
    localSet("k", "v");
    expect(localGet("k")).toBe("v");
    localRemove("k");
    expect(localGet("k")).toBeNull();
    sessionSet("s", "w");
    expect(sessionGet("s")).toBe("w");
    sessionRemove("s");
    expect(sessionGet("s")).toBeNull();
  });

  test("readLocal/readSession silently reset an invalid stored value (roadmap 030)", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    g.localStorage = local;
    g.sessionStorage = session;
    local.map.set("k", "bad");
    session.map.set("s", "bad");
    expect(readLocal("k", "fallback", onlyGood)).toBe("fallback");
    expect(local.map.has("k")).toBe(false);
    expect(readSession("s", "fallback", onlyGood)).toBe("fallback");
    expect(session.map.has("s")).toBe(false);
  });

  test("persistSession removes on empty value", () => {
    const session = memoryStorage();
    g.sessionStorage = session;
    persistSession("s", "v");
    expect(session.map.get("s")).toBe("v");
    persistSession("s", "");
    expect(session.map.has("s")).toBe(false);
  });
});

describe("storage-disabled: throwing storage degrades instead of crashing", () => {
  test("reads are null, writes are no-ops, nothing throws", () => {
    g.localStorage = throwingStorage();
    g.sessionStorage = throwingStorage();
    expect(localGet("k")).toBeNull();
    expect(() => localSet("k", "v")).not.toThrow();
    expect(() => localRemove("k")).not.toThrow();
    expect(sessionGet("s")).toBeNull();
    expect(() => sessionSet("s", "v")).not.toThrow();
    expect(() => sessionRemove("s")).not.toThrow();
  });

  test("the validated reads the App's useState initializers use fall back", () => {
    g.localStorage = throwingStorage();
    g.sessionStorage = throwingStorage();
    expect(readLocal("rcv.platform", "github", () => true)).toBe("github");
    expect(readSession("rcv.githubToken", "", () => true)).toBe("");
  });

  test("absent storage (no global at all) behaves the same", () => {
    g.localStorage = undefined;
    g.sessionStorage = undefined;
    expect(localGet("k")).toBeNull();
    expect(() => localSet("k", "v")).not.toThrow();
    expect(sessionGet("s")).toBeNull();
    expect(() => sessionRemove("s")).not.toThrow();
  });
});

describe("runStorageMigrations", () => {
  test("moves the 009 legacy PATs to sessionStorage and stamps rcv.v", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    g.localStorage = local;
    g.sessionStorage = session;
    local.map.set("rcv.githubToken", "legacy-pat");
    runStorageMigrations();
    expect(session.map.get("rcv.githubToken")).toBe("legacy-pat");
    expect(local.map.has("rcv.githubToken")).toBe(false);
    expect(local.map.get("rcv.v")).toBe("1");
  });

  test("never clobbers a token already in sessionStorage", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    g.localStorage = local;
    g.sessionStorage = session;
    local.map.set("rcv.gitlabToken", "legacy");
    session.map.set("rcv.gitlabToken", "current");
    runStorageMigrations();
    expect(session.map.get("rcv.gitlabToken")).toBe("current");
    expect(local.map.has("rcv.gitlabToken")).toBe(false);
  });

  test("runs once ever: the marker stops a second pass (pre-033 it reran every load)", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    g.localStorage = local;
    g.sessionStorage = session;
    runStorageMigrations();
    expect(local.map.get("rcv.v")).toBe("1");
    // A localStorage token appearing AFTER the migration ran (e.g. seeded by
    // hand) is not the 009 legacy state — it must be left alone.
    local.map.set("rcv.githubToken", "post-migration");
    runStorageMigrations();
    expect(local.map.get("rcv.githubToken")).toBe("post-migration");
    expect(session.map.has("rcv.githubToken")).toBe(false);
  });

  test("a marker from a newer app version is left untouched", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    g.localStorage = local;
    g.sessionStorage = session;
    local.map.set("rcv.v", "7");
    runStorageMigrations();
    expect(local.map.get("rcv.v")).toBe("7");
  });

  test("storage-disabled: does not throw (the old module-scope loop did, before createRoot)", () => {
    g.localStorage = throwingStorage();
    g.sessionStorage = throwingStorage();
    expect(() => runStorageMigrations()).not.toThrow();
  });
});
