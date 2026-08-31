import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RuleAttribution, TraceResult } from "@renovate-config-debugger/engine";
import { useStarterPins } from "./use-starter-pins";
import type { FormState } from "@/types/simulator";

/**
 * Roadmap 091: the seeding trigger. What a starter IS lives in
 * `features/simulator/starter-pins.test.ts`; this covers the two decisions the
 * shell makes — WHOSE rules are derived from (the repo config's, by
 * provenance), and WHEN the attempt happens (never while provenance is still
 * computing, once when it lands either way).
 */

/** The reader's own rule first, a preset's second — the run merges them into
 *  one array and only provenance can tell them apart. */
const RULES = [
  { matchManagers: ["npm"], matchUpdateTypes: ["minor"], groupName: "npm minor" },
  { matchManagers: ["nuget"], automerge: true },
];

const RESULT = { finalConfig: { packageRules: RULES } } as unknown as TraceResult;

const PROVENANCE = [
  { index: 0, layer: { kind: "repo" }, sourceIndex: 0 },
  { index: 1, layer: { kind: "preset", name: "config:recommended" }, sourceIndex: 0 },
] as unknown as RuleAttribution[];

function Harness({
  result,
  ruleProvenance,
  seedStarterPins,
}: {
  result: TraceResult | null;
  ruleProvenance: RuleAttribution[] | null | undefined;
  seedStarterPins: (forms: FormState[]) => void;
}) {
  useStarterPins({ result, ruleProvenance, seedStarterPins });
  return null;
}

describe("useStarterPins", () => {
  it("derives from the reader's own rules only, once provenance lands", () => {
    const seed = vi.fn();
    const { rerender } = render(
      <Harness result={RESULT} ruleProvenance={undefined} seedStarterPins={seed} />,
    );
    // Still computing: an attempt now would trip the latch on a half-answer.
    expect(seed).not.toHaveBeenCalled();

    rerender(<Harness result={RESULT} ruleProvenance={PROVENANCE} seedStarterPins={seed} />);
    expect(seed).toHaveBeenCalledTimes(1);
    const forms = seed.mock.calls[0]?.[0] as FormState[];
    // The preset's nuget rule is not the reader's, so it is not demonstrated.
    expect(forms.map((form) => form.manager)).toStrictEqual(["npm"]);
    expect(forms[0]?.updateType).toBe("minor");
  });

  it("attempts — and so trips the latch — even when provenance is unavailable", () => {
    const seed = vi.fn();
    render(<Harness result={RESULT} ruleProvenance={null} seedStarterPins={seed} />);
    expect(seed).toHaveBeenCalledWith([]);
  });

  it("does nothing before a run has produced a config", () => {
    const seed = vi.fn();
    render(<Harness result={null} ruleProvenance={PROVENANCE} seedStarterPins={seed} />);
    expect(seed).not.toHaveBeenCalled();
  });
});
