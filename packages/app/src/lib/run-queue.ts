/**
 * Roadmap 067 review: the serial run queue's decision half — no React, no
 * engine, no DOM, so it can be tested.
 *
 * The queue is the most intricate thing this branch added and four of the last
 * five review rounds found a bug in it, every one of them in the bookkeeping
 * rather than in the run: a request dropped instead of queued, a `running` flag
 * turned off by a finished run while its successor was still resolving, a
 * predecessor's failure cancelling the run behind it. None of those were visible
 * to a unit suite while the whole mechanism lived inline in App's body.
 *
 * What is left after the eighth review deleted the duplicate-request fold (see
 * `App.onRun`) is exactly two rules, and both are tested next door:
 *
 * - **One task at a time, in the order they were queued.** Two pipeline runs
 *   must not interleave on the engine, and their commits must land in request
 *   order or the later request's results are overwritten by the earlier one's.
 * - **Busy from the first task joining to the LAST one leaving.** A finished run
 *   must not report the app idle while the run behind it is still going.
 *
 * A task's failure is its own caller's business: it reaches that caller and
 * nothing else, and the queue carries on. (App's own task never rejects —
 * `executeRun` turns a failure into a banner and a null result — but a queue
 * that cancelled everything behind a rejection would be a trap for the next
 * caller, and saying so costs one `catch`.)
 */

export interface RunQueue<T> {
  /** Queues `task` behind everything already queued, and resolves with ITS
   *  result — never a neighbour's. */
  enqueue: (task: () => Promise<T>) => Promise<T>;
  /** How many tasks are queued or executing right now. The `running` flag's
   *  source of truth, and this module's test seam. */
  readonly size: number;
}

/**
 * Builds a queue that runs one task at a time. `onBusyChange` is called only on
 * the transitions — `true` when the queue stops being empty, `false` when it
 * becomes empty again — so a caller may wire it straight to a React state
 * setter without a re-render per queued run.
 */
export function createRunQueue<T>(onBusyChange: (busy: boolean) => void): RunQueue<T> {
  // The tail of the chain: each task awaits the one before it. Typed as the
  // widest thing it holds, since nothing ever reads its value — only its
  // settlement.
  let tail: Promise<unknown> = Promise.resolve();
  let size = 0;
  return {
    get size() {
      return size;
    },
    enqueue(task) {
      size += 1;
      if (size === 1) {
        onBusyChange(true);
      }
      const previous = tail;
      const started = (async () => {
        // Joined rather than propagated: the predecessor's failure belongs to
        // whoever queued IT, and must not cancel this task.
        await previous.catch(() => null);
        return await task();
      })();
      // The next task waits for this one — including when it rejects, which is
      // why the join above is a `catch` and not a bare `await`.
      tail = started;
      return (async () => {
        try {
          return await started;
        } finally {
          size -= 1;
          if (size === 0) {
            onBusyChange(false);
          }
        }
      })();
    },
  };
}
