import { afterEach, describe, expect, test, vi } from "vitest";
import { getMeasurementId } from "./analytics";

/**
 * `getMeasurementId` mirrors `getOAuthConfig` (roadmap 043): a deployment-time
 * `globalThis.__RCV_ANALYTICS__` that wins over the build-time
 * `VITE_GA_MEASUREMENT_ID` var, and a served-file source that must therefore
 * be validated — a malformed global falls through to the var, and an id that
 * is not `G-` + alphanumerics never loads gtag at all (it would end up in the
 * script URL).
 */

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
    expect(getMeasurementId()).toBeNull();
  });

  test("reads the build-time var when there is no runtime global", () => {
    setEnv("G-ENV123");
    expect(getMeasurementId()).toBe("G-ENV123");
  });

  test("the runtime global wins over the build-time var", () => {
    setEnv("G-ENV123");
    setGlobal({ measurementId: "  G-RUNTIME1  " });
    expect(getMeasurementId()).toBe("G-RUNTIME1");
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
    expect(getMeasurementId()).toBe("G-ENV123");
  });

  test("an id that could break out of the script URL is rejected", () => {
    setEnv(undefined);
    setGlobal({ measurementId: "G-1&injected=x" });
    expect(getMeasurementId()).toBeNull();
  });
});
