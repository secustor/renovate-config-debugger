import { cleanup, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useEngineDerivation } from "./use-engine-derivation";

/**
 * The two things the shared hook owns beyond "call the engine": what it does
 * with a rejection, and what it shows in the frame between two inputs.
 *
 * The engine is mocked rather than run: both cases are about the hook's own
 * bookkeeping, mocking is the only way to produce a rejection deterministically,
 * and it keeps the renovate module graph out of this file.
 */
vi.mock("@renovate-config-debugger/engine", () => ({}));

afterEach(cleanup);

type State = string | null | undefined;

it("never pairs a new input with the previous input's derivation", async () => {
  // The reset has to happen during render. Done in the effect it would land
  // after the commit, painting one frame in which the NEW input carries the OLD
  // derivation — whose per-run preset node ids (`p1`, `p2`, …) resolve against
  // the new tree, so a row flashes attributed to whichever preset inherited
  // the id.
  const seen: State[] = [];
  function OneInput({ input }: { input: string }) {
    seen.push(useEngineDerivation([input], () => Promise.resolve(`derived:${input}`)));
    return null;
  }

  const view = render(<OneInput input="first" />);
  await waitFor(() => expect(seen.at(-1)).toBe("derived:first"));

  const before = seen.length;
  view.rerender(<OneInput input="second" />);

  // Every render observed since the swap, not just the last one: the gap must
  // be empty throughout, and the render that performs the reset is one of them.
  expect(seen.slice(before)).not.toHaveLength(0);
  expect(seen.slice(before).filter((state) => state !== undefined)).toEqual([]);
  await waitFor(() => expect(seen.at(-1)).toBe("derived:second"));
});

it("settles as unavailable when the derivation throws", async () => {
  // A chunk that fails to load, or a walk that blows up on an exotic tree.
  // Either way the surface renders nothing — what it must NOT do is stay on
  // `undefined` ("still loading") forever with an unhandled rejection behind it.
  const states: State[] = [];
  function Throwing() {
    states.push(
      useEngineDerivation<string>([], () => {
        throw new Error("engine exploded");
      }),
    );
    return null;
  }

  render(<Throwing />);
  expect(states).toEqual([undefined]);
  await waitFor(() => expect(states.at(-1)).toBeNull());
});

it("settles every consumer that mounts in the same commit", async () => {
  // Two consumers of the same run mount together (the effective config's rows
  // and its blame ledger, the simulator's rule rows), so two derivations wait
  // on the engine chunk at once. The import is single-flighted for exactly this
  // reason: a second in-flight `import()` of the same specifier never settles
  // under the test module runner, which strands the second consumer on
  // `undefined` — "still loading" — for good.
  let states: State[] = [];
  function TwoConsumers() {
    const first = useEngineDerivation<string>(["k"], () => Promise.resolve("first"));
    const second = useEngineDerivation<string>(["k"], () => Promise.resolve("second"));
    useEffect(() => {
      states = [first, second];
    }, [first, second]);
    return null;
  }

  render(<TwoConsumers />);
  await waitFor(() => expect(states).toEqual(["first", "second"]));
});

it("does not re-derive while the inputs hold still", async () => {
  // `derive` closes over this render's props and is redeclared every render, so
  // the hook reads it through a latest-ref instead of depending on it. A
  // re-render that changes nothing must therefore cost nothing.
  const derive = vi.fn(() => Promise.resolve("derived"));
  function Steady({ spin }: { spin: number }) {
    // `spin` is deliberately NOT an input — it stands for the sibling state
    // that a keystroke churns.
    void spin;
    useEngineDerivation(["stable"], derive);
    return null;
  }

  const view = render(<Steady spin={0} />);
  await waitFor(() => expect(derive).toHaveBeenCalledTimes(1));
  view.rerender(<Steady spin={1} />);
  view.rerender(<Steady spin={2} />);
  expect(derive).toHaveBeenCalledTimes(1);
});
