import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import type { TraceResult } from "@renovate-config-debugger/engine";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { stubScrollApis } from "@tools/test/jsdom-stubs";
import { simResult } from "@tools/test/simulation";
import { traceResult } from "@tools/test/trace-result";
import { type SimulationRun, useSimulationRun } from "./use-simulation-run";
import { EMPTY_FORM } from "./form";
import type { SimulationOutcome } from "./run-simulation";
import type { FormState } from "@/types/simulator";

/**
 * The async half of "a new run invalidates the previous simulation": the render
 * reset drops the verdict, and a simulation that settles AFTERWARDS must not
 * put it back under a config nobody is looking at.
 */

const { runSimulation } = vi.hoisted(() => ({ runSimulation: vi.fn() }));
vi.mock("./run-simulation", () => ({ runSimulation }));

const noop = () => undefined;

const FORM: FormState = { ...EMPTY_FORM, depName: "react", currentValue: "17.0.0" };
const OUTCOME: SimulationOutcome = { sim: simResult(), effectiveUpdateType: "major" };

/** Both are identity-stable in the real caller (`useSimulatorForm`), and the
 *  reset effect lists them. */
const guard = () => true;
const clearGuard = noop;

/** The hook's latest return, published from an effect rather than from render
 *  (`react(globals)`) — which is also when the assertions read it. */
const seen: { run: SimulationRun | null } = { run: null };

function Harness({ result }: { result: TraceResult }) {
  const run = useSimulationRun({ result, guard, clearGuard });
  useEffect(() => {
    seen.run = run;
  });
  return null;
}

interface Deferred {
  resolve: (outcome: SimulationOutcome) => void;
  reject: () => void;
}

/** Hands back the settle for the one simulation the next `simulate()` starts. */
function deferSimulation(): Deferred {
  const control: Deferred = { resolve: noop, reject: noop };
  runSimulation.mockImplementation(
    () =>
      new Promise<SimulationOutcome>((res, rej) => {
        control.resolve = res;
        control.reject = () => rej(new Error("boom"));
      }),
  );
  return control;
}

describe("useSimulationRun", () => {
  // The hook's scroll restoration runs in a layout effect on every commit.
  beforeAll(stubScrollApis);

  beforeEach(() => {
    seen.run = null;
    runSimulation.mockReset();
  });

  it("drops a verdict whose run has been replaced, without wedging the button", async () => {
    const inFlight = deferSimulation();
    const { rerender } = render(<Harness result={traceResult()} />);

    await act(async () => {
      void seen.run?.simulate(FORM, true);
    });
    expect(seen.run?.running).toBe(true);

    // The pipeline commits a NEW run while the simulation is still queued
    // behind it; the simulation then settles against the old config.
    rerender(<Harness result={traceResult()} />);
    await act(async () => {
      inFlight.resolve(OUTCOME);
    });

    expect(seen.run?.sim).toBeNull();
    expect(seen.run?.simForm).toBeNull();
    expect(seen.run?.ranKey).toBeNull();
    // `running` is panel lifecycle, not run state — leaving it true would
    // strand the Simulate button behind its pending-request drain.
    expect(seen.run?.running).toBe(false);
  });

  it("commits the verdict, and its staleness key, while the run is still on screen", async () => {
    const inFlight = deferSimulation();
    render(<Harness result={traceResult()} />);

    await act(async () => {
      void seen.run?.simulate(FORM, true);
    });
    await act(async () => {
      inFlight.resolve(OUTCOME);
    });

    expect(seen.run?.sim).toBe(OUTCOME.sim);
    expect(seen.run?.simForm).toBe(FORM);
    expect(seen.run?.ranKey).toBe(JSON.stringify(FORM));
    expect(seen.run?.running).toBe(false);
  });

  it("files a failure under its own run only", async () => {
    const inFlight = deferSimulation();
    const { rerender } = render(<Harness result={traceResult()} />);

    await act(async () => {
      void seen.run?.simulate(FORM, true);
    });
    rerender(<Harness result={traceResult()} />);
    await act(async () => {
      inFlight.reject();
    });

    expect(seen.run?.error).toBeNull();
    expect(seen.run?.running).toBe(false);
  });
});
