import { describe, expect, test } from "vitest";
import { RunStore } from "./run-store";

/** The eviction and recency policy, on its own — the session-level assertions
 *  (how many runs a server holds, what a held run carries) live in
 *  `server.test.ts`, where a real connection supplies them. */

/** The store only ever reads `result`/`input` back out. */
const FAKE = { events: [], errors: [], warnings: [] } as unknown as Parameters<RunStore["put"]>[0];
const INPUT = { fileName: "renovate.json", content: "{}" };

describe("RunStore", () => {
  test("evicts the oldest run, and keeps the one being drilled into", () => {
    const store = new RunStore(2);
    const a = store.put(FAKE, INPUT);
    const b = store.put(FAKE, INPUT);
    // Touching `a` makes `b` the least recently used.
    store.get(a.runId);
    const c = store.put(FAKE, INPUT);
    expect(store.size).toBe(2);
    expect(() => store.get(b.runId)).toThrow(/no run/);
    expect(store.get(a.runId).runId).toBe(a.runId);
    expect(store.get(c.runId).runId).toBe(c.runId);
  });

  test("states its own policy: the limit, and the held ids oldest first", () => {
    const store = new RunStore(2);
    expect(store.limit).toBe(2);
    const a = store.put(FAKE, INPUT);
    const b = store.put(FAKE, INPUT);
    expect(store.heldIds()).toEqual([a.runId, b.runId]);
    // A get refreshes recency, so the drilled-into run leaves eviction order.
    store.get(a.runId);
    expect(store.heldIds()).toEqual([b.runId, a.runId]);
  });
});
