import { afterEach, describe, expect, test } from "vitest";
import {
  localGet,
  localRemove,
  localSet,
  persistSession,
  persistTheme,
  readLocal,
  readSession,
  readTheme,
  runStorageMigrations,
  sessionGet,
  sessionRemove,
  sessionSet,
  THEME_KEY,
} from "./storage";

/**
 * Roadmap 033 — the storage wrappers under the conditions that used to
 * white-screen the app: storage that THROWS on every access (Safari private
 * windows historically, cookie-blocking modes, lockdown webviews) and storage
 * that is absent entirely. Every wrapper must degrade to "value not there" /
 * "write didn't stick", and the one-time migration must neither throw before
 * `createRoot()` nor ever run twice against working storage.
 */

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

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
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

const boom = () => {
  throw new Error("The operation is insecure.");
};

/** Storage in the disabled state: every access throws (the Safari behavior). */
function throwingStorage(): StorageLike {
  return {
    getItem: boom,
    setItem: boom,
    removeItem: boom,
    key: boom,
    get length(): number {
      return boom();
    },
  };
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
    expect(readLocal("rcd.platform", "github", () => true)).toBe("github");
    expect(readSession("rcd.githubToken", "", () => true)).toBe("");
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

/** Roadmap 037 — the theme override. `applyTheme` is not covered here: it
 *  touches `document`, which this node-environment project has none of. */
describe("theme persistence", () => {
  test("absent, unreadable and invalid values all read as auto", () => {
    const local = memoryStorage();
    g.localStorage = local;
    expect(readTheme()).toBe("auto");
    local.map.set(THEME_KEY, "sepia");
    expect(readTheme()).toBe("auto");
    // …and the bad value is dropped, not left to be re-read every load (030).
    expect(local.map.has(THEME_KEY)).toBe(false);

    g.localStorage = throwingStorage();
    expect(readTheme()).toBe("auto");
  });

  test("light/dark round-trip; auto stores nothing at all", () => {
    const local = memoryStorage();
    g.localStorage = local;
    persistTheme("dark");
    expect(local.map.get(THEME_KEY)).toBe("dark");
    expect(readTheme()).toBe("dark");
    persistTheme("light");
    expect(readTheme()).toBe("light");
    // Absence IS the default, so a cleared key can never read back as an
    // override.
    persistTheme("auto");
    expect(local.map.has(THEME_KEY)).toBe(false);
    expect(readTheme()).toBe("auto");
  });
});

describe("runStorageMigrations", () => {
  test("moves the 009 legacy PATs to sessionStorage, renames to rcd., stamps rcd.v", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    g.localStorage = local;
    g.sessionStorage = session;
    local.map.set("rcv.githubToken", "legacy-pat");
    runStorageMigrations();
    expect(session.map.get("rcd.githubToken")).toBe("legacy-pat");
    expect(local.map.has("rcv.githubToken")).toBe(false);
    expect(local.map.has("rcd.githubToken")).toBe(false);
    expect(local.map.get("rcd.v")).toBe("2");
  });

  test("never clobbers a value already under the current key", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    g.localStorage = local;
    g.sessionStorage = session;
    local.map.set("rcv.gitlabToken", "legacy");
    session.map.set("rcd.gitlabToken", "current");
    runStorageMigrations();
    expect(session.map.get("rcd.gitlabToken")).toBe("current");
    expect(session.map.has("rcv.gitlabToken")).toBe(false);
    expect(local.map.has("rcv.gitlabToken")).toBe(false);
  });

  test("the rename sweep covers every rcv.-prefixed key in both storages", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    g.localStorage = local;
    g.sessionStorage = session;
    local.map.set("rcv.theme", "dark");
    local.map.set("rcv.oauth.cookieSession", "12345");
    session.map.set("rcv.oauth.token", "tok");
    local.map.set("unrelated.key", "kept");
    runStorageMigrations();
    expect(local.map.get("rcd.theme")).toBe("dark");
    expect(local.map.get("rcd.oauth.cookieSession")).toBe("12345");
    expect(session.map.get("rcd.oauth.token")).toBe("tok");
    expect(local.map.get("unrelated.key")).toBe("kept");
    expect([...local.map.keys(), ...session.map.keys()].some((k) => k.startsWith("rcv."))).toBe(
      false,
    );
  });

  test("a pre-rename rcv.v marker is honored: applied migrations do not replay", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    g.localStorage = local;
    g.sessionStorage = session;
    local.map.set("rcv.v", "1");
    // Under the v0 rules this localStorage PAT would move to sessionStorage;
    // the old marker says v1 already ran, so only the rename sweep touches it.
    local.map.set("rcv.githubToken", "stays-local");
    runStorageMigrations();
    expect(local.map.get("rcd.githubToken")).toBe("stays-local");
    expect(session.map.has("rcd.githubToken")).toBe(false);
    expect(local.map.has("rcv.v")).toBe(false);
    expect(local.map.get("rcd.v")).toBe("2");
  });

  test("runs once ever: the marker stops a second pass (pre-033 it reran every load)", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    g.localStorage = local;
    g.sessionStorage = session;
    runStorageMigrations();
    expect(local.map.get("rcd.v")).toBe("2");
    // A localStorage token appearing AFTER the migration ran (e.g. seeded by
    // hand) is not the 009 legacy state — it must be left alone.
    local.map.set("rcv.githubToken", "post-migration");
    runStorageMigrations();
    expect(local.map.get("rcv.githubToken")).toBe("post-migration");
    expect(session.map.has("rcd.githubToken")).toBe(false);
  });

  test("a marker from a newer app version is left untouched", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    g.localStorage = local;
    g.sessionStorage = session;
    local.map.set("rcd.v", "7");
    runStorageMigrations();
    expect(local.map.get("rcd.v")).toBe("7");
  });

  test("one throwing key aborts neither the rest of the sweep nor the marker", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    g.localStorage = local;
    g.sessionStorage = session;
    local.map.set("rcv.poison", "x");
    local.map.set("rcv.theme", "dark");
    const plainSet = local.setItem;
    local.setItem = (key, value) => {
      if (key === "rcd.poison") {
        boom();
      }
      plainSet(key, value);
    };
    runStorageMigrations();
    // The poisoned key stays under its old name; everything else migrated.
    expect(local.map.get("rcv.poison")).toBe("x");
    expect(local.map.get("rcd.theme")).toBe("dark");
    expect(local.map.get("rcd.v")).toBe("2");
  });

  test("a pre-rename marker from a newer version is carried over and the old key retired", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    g.localStorage = local;
    g.sessionStorage = session;
    local.map.set("rcv.v", "7");
    runStorageMigrations();
    expect(local.map.get("rcd.v")).toBe("7");
    expect(local.map.has("rcv.v")).toBe(false);
  });

  test("storage-disabled: does not throw (the old module-scope loop did, before createRoot)", () => {
    g.localStorage = throwingStorage();
    g.sessionStorage = throwingStorage();
    expect(() => runStorageMigrations()).not.toThrow();
  });
});
