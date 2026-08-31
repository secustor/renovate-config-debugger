import type { DescriptionProvenance, TraceResult } from "@renovate-config-debugger/engine";
import { cleanup, render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useDescriptionProvenance } from "./description-provenance";

/**
 * Roadmap 069 (PR 2), 2026-08-11 review — the two things the hook owns beyond
 * "call the engine": what it does with a rejection, and what it shows in the
 * frame between two runs.
 *
 * The engine is mocked rather than run: both cases are about the hook's own
 * bookkeeping, mocking is the only way to produce a rejection deterministically,
 * and it keeps the renovate module graph out of this file.
 */
const engine = vi.hoisted(() => ({
  computeDescriptionProvenance: vi.fn<(result: TraceResult) => DescriptionProvenance | undefined>(),
}));

vi.mock("@renovate-config-debugger/engine", () => engine);

beforeEach(() => {
  engine.computeDescriptionProvenance.mockReset();
});

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
  // A chunk that fails to load, or a walk that blows up on an exotic tree. The
  // per-result promise is CACHED, so a rejection stored there would hand every
  // consumer of that run its own unhandled rejection and hang them all on
  // `undefined` — "still loading" — for as long as the result lives.
  engine.computeDescriptionProvenance.mockImplementation(() => {
    throw new Error("engine exploded");
  });
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

it("never pairs a new run with the previous run's provenance", async () => {
  // The reset has to happen during render. Done in the effect it would land
  // after the commit, painting one frame in which the NEW result carries the
  // OLD attribution — whose per-run node ids (`p1`, `p2`, …) resolve against
  // the new tree, so a sentence flashes attributed to whichever preset
  // inherited the id.
  const first = {} as TraceResult;
  const second = {} as TraceResult;
  const provenanceOf = (result: TraceResult): DescriptionProvenance =>
    ({
      entries: [],
      unattributed: [],
      finalLength: 0,
      dropped: [],
      ruleDescriptions: [],
      degraded: result === second,
    }) satisfies DescriptionProvenance;
  engine.computeDescriptionProvenance.mockImplementation(provenanceOf);

  const seen: State[] = [];
  function OneResult({ result }: { result: TraceResult }) {
    seen.push(useDescriptionProvenance(result));
    return null;
  }

  const view = render(<OneResult result={first} />);
  await waitFor(() => expect(seen.at(-1)).toEqual(provenanceOf(first)));

  const before = seen.length;
  view.rerender(<OneResult result={second} />);

  // Every render observed since the swap, not just the last one: the gap must
  // be empty throughout, and the render that performs the reset is one of them.
  expect(seen.slice(before)).not.toHaveLength(0);
  expect(seen.slice(before).filter((state) => state !== undefined)).toEqual([]);
  await waitFor(() => expect(seen.at(-1)).toEqual(provenanceOf(second)));
});
