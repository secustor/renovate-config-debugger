import { afterEach, describe, expect, test } from "vitest";
import { initAnalytics } from "./analytics";

/**
 * The WIRING half of roadmap 053: `initAnalytics` itself, which
 * `analytics.config.test.ts` (node-env, pure functions) cannot reach. The one
 * line that keeps the share fragment and the OAuth `?code=` out of Google —
 * `gtag("config", id, { page_location })` — is only observable through the
 * `dataLayer` this suite reads, so dropping that third argument must fail here.
 *
 * `.tsx` for the jsdom "components" project: it needs a DOM, not React.
 */

const GTAG_SRC = 'script[src*="googletagmanager"]';

function trackWith(measurementId: string): void {
  globalThis.__RCD_ANALYTICS__ = { measurementId };
}

/** The `config` call's arguments — gtag pushes `arguments` objects, so the
 *  entries are indexed, never spread. */
function configCall(): Record<number, unknown> | undefined {
  return (window.dataLayer ?? [])
    .map((entry) => entry as Record<number, unknown>)
    .find((entry) => entry[0] === "config");
}

afterEach(() => {
  globalThis.__RCD_ANALYTICS__ = undefined;
  window.dataLayer = undefined;
  for (const script of document.head.querySelectorAll(GTAG_SRC)) {
    script.remove();
  }
  // jsdom keeps the URL across tests; `replaceState` is the only way to set it
  // without a "Not implemented: navigation" error.
  window.history.replaceState(null, "", "/");
});

describe("initAnalytics", () => {
  test("reports the bare page, never the OAuth code or the share fragment", () => {
    trackWith("G-TEST123");
    window.history.replaceState(null, "", "/?code=abc123#config=eJy");

    initAnalytics();

    const pageLocation = configCall()?.[2] as { page_location?: string } | undefined;
    expect(pageLocation?.page_location).toBe(`${window.location.origin}/`);
    expect(pageLocation?.page_location).not.toContain("#");
    expect(pageLocation?.page_location).not.toContain("?");
  });

  test("without an id nothing is loaded and nothing is queued", () => {
    initAnalytics();

    expect(window.dataLayer).toBeUndefined();
    expect(document.head.querySelector(GTAG_SRC)).toBeNull();
  });
});
