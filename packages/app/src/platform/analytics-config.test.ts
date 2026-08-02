import { afterEach, describe, expect, test, vi } from "vitest";
import { getMeasurementId, isTrackableHostname } from "./analytics";

/**
 * `getMeasurementId` mirrors `getOAuthConfig` (roadmap 043): a deployment-time
 * `globalThis.__RCV_ANALYTICS__` that wins over the build-time
 * `VITE_GA_MEASUREMENT_ID` var, and a served-file source that must therefore
 * be validated — a malformed global falls through to the var, and an id that
 * is not `G-` + alphanumerics never loads gtag at all (it would end up in the
 * script URL).
 *
 * Roadmap 053 adds the hostname to that resolution. The hostname is a
 * parameter rather than a `location` read precisely so these stay pure-module
 * tests in the node-environment "unit" project.
 */

/** A hostname that stands in for a real deployment. */
const DEPLOYED = "renovate.secustor.dev";

function setEnv(id: string | undefined): void {
  vi.stubEnv("VITE_GA_MEASUREMENT_ID", id);
}

function setGlobal(value: unknown): void {
  globalThis.__RCV_ANALYTICS__ = value;
}

afterEach(() => {
  vi.unstubAllEnvs();
  setGlobal(undefined);
});

describe("getMeasurementId", () => {
  test("is null when neither source is configured", () => {
    setEnv(undefined);
    expect(getMeasurementId(DEPLOYED)).toBeNull();
  });

  test("reads the build-time var when there is no runtime global", () => {
    setEnv("G-ENV123");
    expect(getMeasurementId(DEPLOYED)).toBe("G-ENV123");
  });

  test("the runtime global wins over the build-time var", () => {
    setEnv("G-ENV123");
    setGlobal({ measurementId: "  G-RUNTIME1  " });
    expect(getMeasurementId(DEPLOYED)).toBe("G-RUNTIME1");
  });

  test.for([
    ["not an object", "G-RUNTIME1"],
    ["missing the id", {}],
    ["a non-string id", { measurementId: 42 }],
    ["a blank id", { measurementId: "   " }],
    ["not a GA4 id", { measurementId: "UA-12345-1" }],
  ] as const)("a global that is %s falls through to the var", ([, value]) => {
    setEnv("G-ENV123");
    setGlobal(value);
    expect(getMeasurementId(DEPLOYED)).toBe("G-ENV123");
  });

  test("an id that could break out of the script URL is rejected", () => {
    setEnv(undefined);
    setGlobal({ measurementId: "G-1&injected=x" });
    expect(getMeasurementId(DEPLOYED)).toBeNull();
  });
});

/**
 * The hostname guard (roadmap 053). The bug it exists for: the Pages build's
 * inlined id, running in the e2e job's `vite preview` on localhost, reported
 * every Playwright context as a new user.
 */
describe("getMeasurementId on a local hostname", () => {
  test.for(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "app.localhost", ""] as const)(
    "the build-time var is ignored on %s",
    (hostname) => {
      setEnv("G-ENV123");
      expect(getMeasurementId(hostname)).toBeNull();
    },
  );

  test("a self-host's own runtime id still tracks there", () => {
    // The one case the guard must not break: `RCV_GA_MEASUREMENT_ID` names the
    // deployer's property, and their container may well be reached on
    // localhost.
    setGlobal({ measurementId: "G-SELFHOST1" });
    expect(getMeasurementId("localhost")).toBe("G-SELFHOST1");
  });
});

describe("isTrackableHostname", () => {
  test.for(["localhost", "LOCALHOST", "127.0.0.1", "0.0.0.0", "::1", "[::1]", ""] as const)(
    "%s is not trackable",
    (hostname) => {
      expect(isTrackableHostname(hostname)).toBe(false);
    },
  );

  test.for(["app.localhost", "rcv.internal.localhost"] as const)(
    "the reserved .localhost TLD is not trackable: %s",
    (hostname) => {
      expect(isTrackableHostname(hostname)).toBe(false);
    },
  );

  test.for([
    "renovate.secustor.dev",
    // Matching must be exact or dot-suffixed, never a substring: these are
    // somebody's real hosts.
    "localhost-mirror.example.com",
    "mylocalhost.example.com",
    "127.0.0.1.example.com",
  ] as const)("%s is trackable", (hostname) => {
    expect(isTrackableHostname(hostname)).toBe(true);
  });
});
