import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { UntrustedEndpointGuard } from "@/lib/share";
import type { RunInputs } from "@/lib/run-inputs";
import type { LoadedRepo } from "@/types/repo";
import { type RepoLoad, type RepoLoadHost, useRepoLoad } from "./use-repo-load";

/**
 * Security 2026-09-01: a load from a KNOWN host used to end a share link's
 * untrusted-endpoint guard outright, on the premise that the host's shipped
 * default replaces the platform context. It does not replace the 008 global
 * layer, which is still in the editor and still WINS the engine's resolution —
 * so the run that followed reached the attacker's endpoint with every
 * credential attached. These drive the real hook against a stubbed fetch.
 */

const UNTRUSTED = "https://evil.example/api/v3/";

vi.mock("@/platform/run", () => ({
  loadRepoConfig: vi.fn(() => Promise.resolve({ fileName: "renovate.json", content: "{}" })),
  loadRepoFile: vi.fn(() => Promise.resolve(null)),
  extractPackageJsonConfig: vi.fn(() => Promise.resolve(null)),
}));

const { loadRepoConfig } = await import("@/platform/run");

/** What a link naming {@link UNTRUSTED} left standing. */
function standingGuard(): UntrustedEndpointGuard {
  return { endpoints: [UNTRUSTED], host: UNTRUSTED, acknowledged: false };
}

interface Recorded {
  guards: (UntrustedEndpointGuard | null)[];
  runs: { inputs: RunInputs; suppressTokens: boolean }[];
  loaded: LoadedRepo[];
  inherited: { suppressTokens: boolean }[];
}

let recorded: Recorded;
let held: RepoLoad | null = null;

function makeHost(overrides: Partial<RepoLoadHost>, guard: UntrustedEndpointGuard): RepoLoadHost {
  const guardRef: { current: UntrustedEndpointGuard | null } = { current: guard };
  return {
    platform: "github",
    endpoint: "https://api.github.com",
    applyPlatformContext: () => {},
    loadConfigText: () => {},
    setFileName: () => {},
    setNotice: () => {},
    setFatal: () => {},
    blockedByLayerErrors: () => false,
    applyUntrustedGuard: (next) => {
      guardRef.current = next;
      recorded.guards.push(next);
    },
    untrustedGuardRef: guardRef,
    onRun: (inputs, opts) => {
      recorded.runs.push({ inputs, suppressTokens: opts.suppressTokens });
      return Promise.resolve(null);
    },
    globalConfig: undefined,
    platformOverride: false,
    repoInput: "github.com/owner/repo",
    resolveInheritedConfig: (args) => {
      recorded.inherited.push({ suppressTokens: args.suppressTokens });
      return Promise.resolve(undefined);
    },
    oauthConfigured: false,
    onRepoLoaded: (repo) => {
      recorded.loaded.push(repo);
    },
    ...overrides,
  };
}

function Harness({ host }: { host: RepoLoadHost }) {
  const api = useRepoLoad(host);
  // Written from an effect, never during render (`react/globals`).
  useEffect(() => {
    held = api;
  }, [api]);
  return null;
}

/** The hook after the last committed render — `render` and `act` both flush
 *  effects, so this always sees the latest. */
function current(): RepoLoad {
  if (held === null) {
    throw new Error("the harness did not render");
  }
  return held;
}

async function loadFrom(
  overrides: Partial<RepoLoadHost>,
  guard: UntrustedEndpointGuard = standingGuard(),
): Promise<void> {
  held = null;
  render(<Harness host={makeHost(overrides, guard)} />);
  await act(async () => {
    await current().onLoadRepo();
  });
}

beforeEach(() => {
  recorded = { guards: [], runs: [], loaded: [], inherited: [] };
  vi.mocked(loadRepoConfig).mockClear();
});

describe("a repo load under a standing untrusted-endpoint guard", () => {
  test("keeps the guard, and every credential withheld, while the global layer still names the host", async () => {
    await loadFrom({ globalConfig: { endpoint: UNTRUSTED } });

    expect(recorded.guards.at(-1)).toEqual(standingGuard());
    expect(vi.mocked(loadRepoConfig).mock.calls[0]?.[1]).toEqual({ suppressTokens: true });
    expect(recorded.inherited).toEqual([{ suppressTokens: true }]);
    expect(recorded.runs.at(-1)?.suppressTokens).toBe(true);
    expect(recorded.loaded.at(-1)?.suppressTokens).toBe(true);
  });

  test("an overridden global layer is still in force for the NEXT run, so it still suppresses", async () => {
    await loadFrom({ globalConfig: { endpoint: UNTRUSTED }, platformOverride: true });

    expect(recorded.guards.at(-1)).not.toBeNull();
    expect(recorded.runs.at(-1)?.suppressTokens).toBe(true);
  });

  test("names the endpoint still in force, not the stale one the link parked", async () => {
    await loadFrom({ globalConfig: { endpoint: "https://other.example/" } });

    expect(recorded.guards.at(-1)).toEqual({
      endpoints: ["https://other.example/"],
      host: "https://other.example/",
      acknowledged: false,
    });
  });

  test("an acknowledged guard is not re-raised — the load introduces no new host", async () => {
    await loadFrom(
      { globalConfig: { endpoint: UNTRUSTED } },
      {
        ...standingGuard(),
        acknowledged: true,
      },
    );

    expect(recorded.guards.at(-1)?.acknowledged).toBe(true);
    expect(recorded.runs.at(-1)?.suppressTokens).toBe(true);
  });

  test("an acknowledged guard IS re-raised for a host it never named", async () => {
    await loadFrom(
      { globalConfig: { endpoint: "https://other.example/" } },
      {
        ...standingGuard(),
        acknowledged: true,
      },
    );

    expect(recorded.guards.at(-1)?.acknowledged).toBe(false);
  });

  test("a failed load leaves the guard standing — the link's endpoint is still live", async () => {
    vi.mocked(loadRepoConfig).mockRejectedValueOnce(
      Object.assign(new Error("not found"), { name: "RepoConfigNotFoundError", probed: ["a"] }),
    );

    await loadFrom({});

    expect(recorded.guards).toEqual([]);
    expect(recorded.runs).toEqual([]);
  });

  test("ends the guard once nothing untrusted survives the load", async () => {
    await loadFrom({});

    expect(recorded.guards.at(-1)).toBeNull();
    expect(vi.mocked(loadRepoConfig).mock.calls[0]?.[1]).toEqual({ suppressTokens: false });
    expect(recorded.runs.at(-1)?.suppressTokens).toBe(false);
    expect(recorded.loaded.at(-1)?.suppressTokens).toBe(false);
  });

  test("a bare owner/repo load stays suppressed, as it always has", async () => {
    await loadFrom({ repoInput: "owner/repo", platform: "github", endpoint: UNTRUSTED });

    expect(recorded.runs.at(-1)?.suppressTokens).toBe(true);
  });
});
