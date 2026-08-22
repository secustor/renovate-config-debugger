import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listUserRepos, probeConfigFile, repoNote, type UserRepo } from "./github-repos";

vi.mock("./oauth", () => ({
  getValidToken: vi.fn(async () => "tok-1"),
}));

// The engine is only touched for its candidate list — mocked so the unit test
// never loads the real module graph.
vi.mock("@renovate-config-debugger/engine", () => ({
  CONFIG_FILE_NAMES: [
    "renovate.json",
    "renovate.json5",
    ".github/renovate.json",
    ".renovaterc",
    "package.json",
  ],
}));

interface StubResponse {
  ok: boolean;
  status?: number;
  body: unknown;
}

/** Routes fetch by URL substring; records the URLs asked for. */
function stubFetch(routes: Record<string, StubResponse>): string[] {
  const asked: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(url);
      const hit = Object.entries(routes).find(([key]) => url.includes(key));
      const res = hit?.[1] ?? { ok: false, status: 404, body: {} };
      return {
        ok: res.ok,
        status: res.status ?? 200,
        json: async () => res.body,
        text: async () => (typeof res.body === "string" ? res.body : JSON.stringify(res.body)),
      };
    }),
  );
  return asked;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function repo(overrides: Partial<UserRepo> = {}): UserRepo {
  return {
    name: "acme/webapp",
    language: null,
    pushedAt: null,
    defaultBranch: "main",
    ...overrides,
  };
}

describe("listUserRepos", () => {
  it("maps the fields and drops archived repos", async () => {
    stubFetch({
      "user/repos": {
        ok: true,
        body: [
          {
            full_name: "acme/webapp",
            language: "TypeScript",
            pushed_at: "2026-08-20T00:00:00Z",
            default_branch: "main",
          },
          { full_name: "acme/old", archived: true, default_branch: "main" },
          { nonsense: true },
        ],
      },
    });
    expect(await listUserRepos()).toEqual([
      {
        name: "acme/webapp",
        language: "TypeScript",
        pushedAt: "2026-08-20T00:00:00Z",
        defaultBranch: "main",
      },
    ]);
  });

  it("throws on an API failure", async () => {
    stubFetch({ "user/repos": { ok: false, status: 401, body: {} } });
    await expect(listUserRepos()).rejects.toThrow(/401/);
  });
});

describe("probeConfigFile", () => {
  it("finds a top-level candidate, first in engine order", async () => {
    stubFetch({
      "git/trees/main": {
        ok: true,
        body: {
          tree: [
            { path: ".renovaterc", type: "blob", sha: "a" },
            { path: "renovate.json5", type: "blob", sha: "b" },
          ],
        },
      },
    });
    expect(await probeConfigFile(repo())).toBe("renovate.json5");
  });

  it("descends into .github/ only when the directory exists", async () => {
    const asked = stubFetch({
      "git/trees/main": {
        ok: true,
        body: { tree: [{ path: ".github", type: "tree", sha: "sub1" }] },
      },
      "git/trees/sub1": {
        ok: true,
        body: { tree: [{ path: "renovate.json", type: "blob", sha: "c" }] },
      },
    });
    expect(await probeConfigFile(repo())).toBe(".github/renovate.json");
    expect(asked.some((u) => u.includes("git/trees/sub1"))).toBe(true);
  });

  it("decides package.json by its renovate key", async () => {
    stubFetch({
      "git/trees/main": {
        ok: true,
        body: { tree: [{ path: "package.json", type: "blob", sha: "d" }] },
      },
      "contents/package.json": { ok: true, body: '{"renovate":{"automerge":true}}' },
    });
    expect(await probeConfigFile(repo())).toBe("package.json");
  });

  it("is null for a package.json without the key, and for an empty repo", async () => {
    stubFetch({
      "git/trees/main": {
        ok: true,
        body: { tree: [{ path: "package.json", type: "blob", sha: "d" }] },
      },
      "contents/package.json": { ok: true, body: '{"name":"x"}' },
    });
    expect(await probeConfigFile(repo())).toBeNull();
    stubFetch({ "git/trees/main": { ok: true, body: { tree: [] } } });
    expect(await probeConfigFile(repo())).toBeNull();
  });

  it("refuses to compose a request from an invalid name", async () => {
    const asked = stubFetch({});
    expect(await probeConfigFile(repo({ name: "../evil" }))).toBeNull();
    expect(asked).toEqual([]);
  });
});

describe("repoNote", () => {
  const now = Date.parse("2026-08-23T00:00:00Z");

  it("joins language and age", () => {
    expect(repoNote(repo({ language: "Go", pushedAt: "2026-08-21T00:00:00Z" }), now)).toBe(
      "Go · updated 2d ago",
    );
  });

  it("scales the age unit and survives missing fields", () => {
    expect(repoNote(repo({ pushedAt: "2026-08-01T00:00:00Z" }), now)).toBe("updated 3w ago");
    expect(repoNote(repo({ pushedAt: "2026-08-22T20:00:00Z" }), now)).toBe("updated today");
    expect(repoNote(repo({ language: "Rust" }), now)).toBe("Rust");
    expect(repoNote(repo(), now)).toBe("");
  });
});
