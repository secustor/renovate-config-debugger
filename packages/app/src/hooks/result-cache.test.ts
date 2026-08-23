import { describe, expect, it, vi } from "vitest";
import { makeResultCache } from "./result-cache";

describe("makeResultCache", () => {
  it("computes once per key and hands every caller the same promise", async () => {
    const compute = vi.fn((_deps: null, key: { n: number }) => key.n * 2);
    const cached = makeResultCache(compute);
    const a = { n: 3 };
    const b = { n: 4 };

    const first = cached(null, a);
    const second = cached(null, a);
    expect(second).toBe(first);
    expect(await first).toBe(6);
    expect(await cached(null, b)).toBe(8);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("normalizes an undefined result to null", async () => {
    const cached = makeResultCache(() => undefined as unknown as null);
    expect(await cached(null, {})).toBeNull();
  });

  it("caches a THROW as null rather than as a rejected promise", async () => {
    const cached = makeResultCache(() => {
      throw new Error("walk failed");
    });
    const key = {};
    // Both the first consumer and one arriving after it has settled get null —
    // a cached rejection would give the late one an unhandled rejection with
    // nowhere to report it.
    expect(await cached(null, key)).toBeNull();
    await expect(cached(null, key)).resolves.toBeNull();
  });
});
