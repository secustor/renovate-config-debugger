import type { DescriptionProvenance, TraceResult } from "@renovate-config-debugger/engine";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useDescriptionProvenance } from "./description-provenance";

/**
 * Roadmap 069 (PR 2), 2026-08-11 review — the hook's failure path. The engine
 * is reached through a dynamic import and the per-result promise is CACHED, so
 * a throw (a chunk that fails to load, a walk that blows up on an exotic tree)
 * would otherwise be stored as a rejected promise: every consumer of that run
 * gets its own unhandled rejection and hangs on `undefined` — "still loading" —
 * for as long as the result lives. It must settle as `null` (unavailable), for
 * every consumer, exactly like a run that lacks the data.
 *
 * The engine is mocked here rather than run: this is about what the hook does
 * with a rejection, and mocking is the only way to produce one deterministically
 * (it also keeps the renovate graph out of this file).
 */

vi.mock("@renovate-config-debugger/engine", () => ({
  computeDescriptionProvenance: () => {
    throw new Error("engine exploded");
  },
}));

afterEach(cleanup);

// The hook only ever hands the result to the engine (mocked) and uses it as a
// WeakMap key, so an empty object is the whole fixture this needs.
const RESULT = {} as TraceResult;

type State = DescriptionProvenance | null | undefined;

/** Renders the hook twice over the SAME result — two consumers sharing the one
 *  cached promise, which is the case a poisoned cache entry breaks. */
function Harness({ onState }: { onState: (states: State[]) => void }) {
  const first = useDescriptionProvenance(RESULT);
  const second = useDescriptionProvenance(RESULT);
  onState([first, second]);
  return null;
}

it("settles as unavailable when the engine throws, for every consumer", async () => {
  let states: State[] = [];
  render(
    <Harness
      onState={(next) => {
        states = next;
      }}
    />,
  );

  expect(states).toEqual([undefined, undefined]);
  await waitFor(() => expect(states).toEqual([null, null]));

  // …and the cached rejection is not replayed at the next consumer either.
  cleanup();
  states = [];
  render(
    <Harness
      onState={(next) => {
        states = next;
      }}
    />,
  );
  await waitFor(() => expect(states).toEqual([null, null]));
});
