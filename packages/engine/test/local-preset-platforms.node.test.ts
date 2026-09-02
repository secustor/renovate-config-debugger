/**
 * Drift guard for the hand-port of upstream's `getResolver` switch
 * (`renovate/dist/config/presets/local/index.js`): a Renovate bump that ADDS a
 * platform fails here instead of shipping an `Unknown platform` message
 * Renovate itself would never print. Re-bucketing an id upstream is not caught
 * — this only asserts that some classification happened, never which one. The
 * dropdown in `packages/app/src/data/platform-endpoints.ts` is the second copy
 * of this list.
 *
 * It lives here, not beside `local.ts`, because the real platform registry is a
 * `renovate/dist` deep import, which `.oxlintrc.json` fences out of `src/`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { GlobalConfig } from "../src/renovate-adapter";
import { getPreset } from "../src/shims/presets/local";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  GlobalConfig.reset();
});

/** The two classifications that are a deliberate refusal rather than a lookup miss. */
const REFUSALS = /only reachable via a real Renovate run|does not support local presets/;

type PlatformId = NonNullable<Parameters<typeof GlobalConfig.set>[0]["platform"]>;

async function classify(platform: PlatformId): Promise<{ fetched: boolean; outcome: string }> {
  GlobalConfig.set({ platform });
  let fetched = false;
  globalThis.fetch = ((): Promise<Response> => {
    fetched = true;
    return Promise.resolve(
      new Response(JSON.stringify({ content: "", encoding: "base64" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as unknown as typeof fetch;
  const outcome = await getPreset({ repo: "org/repo" }).then(
    () => "resolved",
    (err: unknown) => (err instanceof Error ? err.message : String(err)),
  );
  return { fetched, outcome };
}

describe("the local preset resolver's platform sets", () => {
  it("classify every platform Renovate registers", async () => {
    const { default: platforms } = await import("renovate/dist/modules/platform/api.js");
    const ids = [...platforms.keys()];
    expect(ids.length).toBeGreaterThan(0);

    const unclassified: string[] = [];
    for (const id of ids) {
      const { fetched, outcome } = await classify(id);
      expect(outcome).not.toMatch(/Unknown platform/);
      // A host resolver took it (the transport was reached), or the shim
      // refused it on purpose; anything else is a fall-through.
      if (!fetched && !REFUSALS.test(outcome)) {
        unclassified.push(`${id}: ${outcome}`);
      }
    }
    expect(unclassified).toEqual([]);
  });
});
