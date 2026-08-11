import { describe, expect, it } from "vitest";
import { createRunQueue } from "./run-queue";

/**
 * Roadmap 067 review: the run queue's two rules, each with the defect it exists
 * to prevent written beside it. Four of the five review rounds before this one
 * found a bug in this bookkeeping while it was inline in App's body and
 * reachable only through a full pipeline run.
 */

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

/** The placeholder `deferred` starts with — shared, because it is never the one
 *  that runs and a fresh one per call is what `consistent-function-scoping`
 *  objects to. */
const NEVER_CALLED = () => {};

function deferred<T>(): Deferred<T> {
  // Assigned synchronously by the executor below — written this way rather than
  // with a definite-assignment assertion, which reads like the non-null
  // assertions the lint rules ban.
  let resolve: (value: T) => void = NEVER_CALLED;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Drains every pending microtask — a macrotask boundary, so any number of
 *  chained `await`s inside the queue have run by the time this resolves. */
function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("createRunQueue", () => {
  it("runs one task at a time, in the order they were queued", async () => {
    // Two pipeline runs must not interleave on the engine, and their commits
    // must land in request order — the later request's results are what the
    // user is owed, and an out-of-order commit leaves the editor holding one
    // config while the results describe another.
    const queue = createRunQueue<string>(() => {});
    const log: string[] = [];
    const first = deferred<void>();
    const second = deferred<void>();

    function task(name: string, gate: Promise<void>) {
      return async () => {
        log.push(`start ${name}`);
        await gate;
        log.push(`end ${name}`);
        return name;
      };
    }

    const a = queue.enqueue(task("a", first.promise));
    const b = queue.enqueue(task("b", second.promise));

    await flush();
    expect(log).toEqual(["start a"]);
    expect(queue.size).toBe(2);

    first.resolve();
    await flush();
    expect(log).toEqual(["start a", "end a", "start b"]);

    second.resolve();
    // Each caller gets ITS task's result, not the neighbour it queued behind.
    expect(await a).toBe("a");
    expect(await b).toBe("b");
    expect(log).toEqual(["start a", "end a", "start b", "end b"]);
    expect(queue.size).toBe(0);
  });

  it("stays busy until the LAST task leaves", async () => {
    // The fifth review's defect: a finished run turned the light off while its
    // successor was still resolving, so the Run button came back enabled and
    // the spinner stopped in the middle of a run.
    const busy: boolean[] = [];
    const queue = createRunQueue<number>((next) => busy.push(next));
    const first = deferred<void>();
    const second = deferred<void>();

    const a = queue.enqueue(async () => {
      await first.promise;
      return 1;
    });
    expect(busy).toEqual([true]);
    const b = queue.enqueue(async () => {
      await second.promise;
      return 2;
    });
    // Only the transitions are reported: a second queued run is not a second
    // "now busy", or every queued run would cost a re-render.
    expect(busy).toEqual([true]);
    expect(queue.size).toBe(2);

    first.resolve();
    expect(await a).toBe(1);
    expect(busy).toEqual([true]);
    expect(queue.size).toBe(1);

    second.resolve();
    expect(await b).toBe(2);
    expect(busy).toEqual([true, false]);
    expect(queue.size).toBe(0);

    // …and an empty queue that fills again announces itself afresh.
    await queue.enqueue(async () => 3);
    expect(busy).toEqual([true, false, true, false]);
  });

  it("keeps going after a task fails, and tells only that task's caller", async () => {
    const busy: boolean[] = [];
    const queue = createRunQueue<string>((next) => busy.push(next));
    const log: string[] = [];

    const failing = queue.enqueue(async () => {
      log.push("boom");
      throw new Error("boom");
    });
    const behind = queue.enqueue(async () => {
      log.push("after");
      return "after";
    });

    await expect(failing).rejects.toThrow("boom");
    expect(await behind).toBe("after");
    expect(log).toEqual(["boom", "after"]);
    expect(busy).toEqual([true, false]);
    expect(queue.size).toBe(0);
  });
});
