import { afterEach, describe, expect, test, vi } from "vitest";
import { getOAuthConfig } from "./oauth";

/**
 * Roadmap 043 — `getOAuthConfig` reads two sources now: the deployment-time
 * `globalThis.__RCV_OAUTH__` (what the Docker image writes into
 * `/rcv-config.js`) and the build-time `VITE_*` vars (what the Pages build
 * inlines). One published image must be able to turn sign-in on without a
 * rebuild, so the runtime source wins — but only when it is actually usable,
 * because it is a served file a deployment can get wrong.
 */

/** `vi.stubEnv` covers `import.meta.env` too, so both sources are drivable.
 *  ALL three vars are stubbed — vitest loads a developer's gitignored
 *  `packages/app/.env` (the local-testing OAuth config) into
 *  `import.meta.env`, so any var left unstubbed leaks that machine's value
 *  into the fixture. */
function setEnv(clientId: string | undefined, workerUrl: string | undefined): void {
  vi.stubEnv("VITE_GITHUB_CLIENT_ID", clientId);
  vi.stubEnv("VITE_OAUTH_WORKER_URL", workerUrl);
  vi.stubEnv("VITE_GITHUB_APP_SLUG", undefined);
}

function setGlobal(value: unknown): void {
  globalThis.__RCV_OAUTH__ = value;
}

afterEach(() => {
  vi.unstubAllEnvs();
  setGlobal(undefined);
});

describe("getOAuthConfig", () => {
  test("is null when neither source is configured", () => {
    setEnv(undefined, undefined);
    expect(getOAuthConfig()).toBeNull();
  });

  test("reads the build-time vars when there is no runtime global", () => {
    setEnv("env-client", "https://worker.example/");
    expect(getOAuthConfig()).toEqual({
      clientId: "env-client",
      workerUrl: "https://worker.example",
      appSlug: undefined,
    });
  });

  test("the runtime global wins over the build-time vars", () => {
    setEnv("env-client", "https://env-worker.example");
    setGlobal({
      clientId: "  runtime-client  ",
      workerUrl: "https://runtime-worker.example///",
      appSlug: "rcv",
    });
    expect(getOAuthConfig()).toEqual({
      clientId: "runtime-client",
      workerUrl: "https://runtime-worker.example",
      appSlug: "rcv",
    });
  });

  test.for([
    ["not an object", "https://runtime.example"],
    ["a blank client id", { clientId: "   ", workerUrl: "https://runtime.example" }],
    ["a missing worker URL", { clientId: "runtime-client" }],
    ["a non-string worker URL", { clientId: "runtime-client", workerUrl: 42 }],
  ] as const)("a global that is %s falls through to the vars", ([, value]) => {
    setEnv("env-client", "https://env-worker.example");
    setGlobal(value);
    expect(getOAuthConfig()?.clientId).toBe("env-client");
  });

  test("a malformed global with no vars behind it is simply off", () => {
    setEnv(undefined, undefined);
    setGlobal({ clientId: "runtime-client" });
    expect(getOAuthConfig()).toBeNull();
  });
});
