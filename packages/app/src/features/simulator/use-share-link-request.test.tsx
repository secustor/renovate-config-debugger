import { render } from "@testing-library/react";
import { type Dispatch, type SetStateAction, useRef } from "react";
import type { TraceResult } from "@renovate-config-debugger/engine";
import { describe, expect, it, vi } from "vitest";
import { traceResult } from "@tools/test/trace-result";
import { type SimRequest, useShareLinkRequest } from "./use-share-link-request";
import type { Simulate } from "./use-simulation-run";
import type { FormState } from "@/types/simulator";

/**
 * Roadmap 068 review — the consuming half of the attribution invariant stated
 * in `hooks/use-share-link.ts`: a share link's simulator request goes to the
 * result its OWN link produced, never to whatever verdict happened to be on
 * screen when the link arrived. Both branches of that rule are here; which
 * entry path decoded the link is deliberately not a factor in either.
 */

function request(ranResult: TraceResult | null): SimRequest {
  return {
    form: { depName: "react", currentValue: "17.0.0" },
    autoSimulate: true,
    ranResult,
    nonce: 1,
  };
}

function Harness({
  simRequest,
  result,
  setForm,
  simulate,
}: {
  simRequest: SimRequest | null;
  result: TraceResult;
  setForm: Dispatch<SetStateAction<FormState>>;
  simulate: Simulate;
}) {
  const simulateRef = useRef<Simulate | null>(simulate);
  useShareLinkRequest({
    simRequest,
    result,
    setForm,
    setUpdateTypeTouched: () => undefined,
    simulateRef,
  });
  return null;
}

describe("useShareLinkRequest", () => {
  it("holds a request whose own run failed until a result it predates arrives", () => {
    // The link's config threw, so it produced no result to be attributed to —
    // and the run on screen is the previous link's. Applying the descriptor
    // there is the misattribution the invariant forbids; dropping it instead
    // would lose the sender's "look at this dependency" for good, since the
    // nonce is only ever consumed once. So it waits.
    const setForm = vi.fn();
    const simulate = vi.fn(() => Promise.resolve());
    const stale = traceResult();
    const failed = request(null);
    const { rerender } = render(
      <Harness simRequest={null} result={stale} setForm={setForm} simulate={simulate} />,
    );

    rerender(<Harness simRequest={failed} result={stale} setForm={setForm} simulate={simulate} />);
    expect(setForm).not.toHaveBeenCalled();
    expect(simulate).not.toHaveBeenCalled();

    // The user fixes the config the link shipped and runs it: a result this
    // request predates, and — no other link having been through to replace
    // the request — this link's.
    rerender(
      <Harness simRequest={failed} result={traceResult()} setForm={setForm} simulate={simulate} />,
    );
    expect(setForm).toHaveBeenCalledOnce();
    expect(simulate).toHaveBeenCalledOnce();
  });

  it("applies a held request on the first look of a fresh mount", () => {
    // The other half of the same hold, and the reason the wait branch cannot
    // strand a request: when the link's run returned a trace with NO effective
    // config, the simulator panel is not mounted for it at all (ResultsColumn
    // renders an empty note instead), so the run the user gets after fixing the
    // config mounts this hook — and its first look is that run.
    const setForm = vi.fn();
    const simulate = vi.fn(() => Promise.resolve());
    render(
      <Harness
        simRequest={request(null)}
        result={traceResult()}
        setForm={setForm}
        simulate={simulate}
      />,
    );
    expect(setForm).toHaveBeenCalledOnce();
    expect(simulate).toHaveBeenCalledOnce();
  });

  it("applies a request only to the result its link named", () => {
    const setForm = vi.fn();
    const simulate = vi.fn(() => Promise.resolve());
    const ran = traceResult();
    const named = request(ran);

    // The named result has not committed here — this is the previous link's,
    // still up while the new link's run finishes behind it.
    const { rerender } = render(
      <Harness simRequest={named} result={traceResult()} setForm={setForm} simulate={simulate} />,
    );
    expect(setForm).not.toHaveBeenCalled();
    expect(simulate).not.toHaveBeenCalled();

    rerender(<Harness simRequest={named} result={ran} setForm={setForm} simulate={simulate} />);
    expect(setForm).toHaveBeenCalledOnce();
    expect(simulate).toHaveBeenCalledOnce();
  });
});
