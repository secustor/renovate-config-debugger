/**
 * Golden project: the engine's task queue, and the one thing a caller can do
 * about a task it no longer wants.
 *
 * Roadmap 068 (L4): renovate's config modules hold module-level state, so
 * every engine entry point is serialized through one queue — which means a
 * call whose client already went away does not merely waste its own time, it
 * holds up every question asked after it. The work itself is synchronous and
 * stateful and cannot be interrupted; NOT STARTING it is the whole of what is
 * achievable, and it is checked at the one moment that matters: when the queue
 * reaches the task.
 */
import { describe, expect, it } from "vitest";
import { runPipeline, simulatePackageRules } from "../src/index";

const CONFIG = { fileName: "renovate.json", content: '{"labels":["deps"]}' };

describe("engine queue", () => {
  it("never starts a run whose caller has gone away", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runPipeline(CONFIG, controller.signal)).rejects.toThrow(/cancelled/);
  });

  it("…nor a simulation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      simulatePackageRules({ config: {}, dep: { depName: "react" } }, controller.signal),
    ).rejects.toThrow(/cancelled/);
  });

  it("a cancelled task does not take the queue down with it", async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    const [refused, ran] = await Promise.allSettled([
      runPipeline(CONFIG, cancelled.signal),
      runPipeline(CONFIG, new AbortController().signal),
    ]);
    expect(refused.status).toBe("rejected");
    expect(ran.status).toBe("fulfilled");
    expect(ran.status === "fulfilled" && ran.value.finalConfig?.labels).toEqual(["deps"]);
  });

  it("a signal that is never aborted changes nothing", async () => {
    const result = await runPipeline(CONFIG, new AbortController().signal);
    expect(result.finalConfig?.labels).toEqual(["deps"]);
  });
});
