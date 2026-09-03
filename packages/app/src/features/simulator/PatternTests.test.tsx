/**
 * Roadmap 094: the pattern-test cards' interaction contract — a test is
 * added open, an option picked, patterns and inputs typed in with Enter, an
 * expectation flipped, the seed offer taken — over a STUB engine. What
 * Renovate's own matcher says is the shimmed suite's business.
 */
import { useState } from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { PatternListMatch, TraceResult } from "@renovate-config-debugger/engine";
import { EMPTY_REPO_DEPS } from "./repo-deps";
import { EMPTY_FORM } from "./form";
import { newPatternTest } from "./pattern-tests";
import { PatternTests } from "./PatternTests";
import type { PatternTest } from "@/types/simulator";

/** Exact-match-or-`!`-negate: enough matcher to drive the card. */
function explain(patterns: readonly string[], input: string): PatternListMatch {
  const entries = patterns.map((pattern) => {
    const negative = pattern.startsWith("!");
    const hit = (negative ? pattern.slice(1) : pattern) === input;
    return { pattern, kind: "glob" as const, negative, caseInsensitive: true, invalid: false, hit };
  });
  const positives = entries.filter((entry) => !entry.negative);
  const blocked = entries.some((entry) => entry.negative && entry.hit);
  const matches =
    entries.length > 0 && (positives.length === 0 || positives.some((e) => e.hit)) && !blocked;
  return { matches, entries, reason: matches ? null : blocked ? "blocked" : "no-positive" };
}

vi.mock("@/platform/engine-chunk", () => ({
  loadEngine: () =>
    Promise.resolve({
      explainPatternMatch: explain,
      parsePattern: (pattern: string) => ({
        kind: "glob",
        negative: pattern.startsWith("!"),
        caseInsensitive: true,
        invalid: false,
      }),
      patternListOptionNames: () => ["matchDepNames", "matchPackageNames"],
    }),
}));

const RESULT = { finalConfig: {} } as unknown as TraceResult;

function Harness({ initial = [] }: { initial?: PatternTest[] }) {
  const [tests, setTests] = useState<PatternTest[]>(initial);
  let seq = initial.length;
  return (
    <PatternTests
      tests={tests}
      seedSources={{
        pins: [{ id: "pin-1", form: { ...EMPTY_FORM, packageName: "react" } }],
        repoDeps: EMPTY_REPO_DEPS,
        result: RESULT,
      }}
      onAdd={() => {
        const id = `pattern-${++seq}`;
        setTests((prev) => [...prev, newPatternTest(id)]);
        return id;
      }}
      onUpdate={(id, update) =>
        setTests((prev) => prev.map((test) => (test.id === id ? update(test) : test)))
      }
      onRemove={(id) => setTests((prev) => prev.filter((test) => test.id !== id))}
    />
  );
}

function enter(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
}

it("builds a test from the ghost row: option, patterns, inputs, expectations", async () => {
  const view = render(<Harness />);
  expect(view.container.querySelector(".pattern-empty")).not.toBeNull();

  fireEvent.click(view.getByRole("button", { name: /Test a pattern/ }));
  // Added OPEN, with the option unpicked.
  const select = await view.findByLabelText("Option this test is for");
  expect(select).toHaveProperty("value", "");
  fireEvent.change(select, { target: { value: "matchPackageNames" } });

  enter(view.getByLabelText("Add a pattern"), "react");
  enter(view.getByLabelText("Add a pattern"), "!react-dom");
  await waitFor(() => expect(view.getAllByLabelText(/^Pattern \d/)).toHaveLength(2));

  // A typed input starts as an assertion of the CURRENT verdict.
  enter(view.getByLabelText("Add an input"), "react");
  enter(view.getByLabelText("Add an input"), "lodash");
  await waitFor(() =>
    expect(view.container.querySelector(".pin-summary")?.textContent).toBe("2 of 2 expected"),
  );
  const expectations = view.getAllByRole("button", { name: /^should/ });
  expect(expectations.map((button) => button.textContent)).toEqual(["should match", "should not"]);

  // Flipping the expectation is what makes it a failing test.
  fireEvent.click(expectations[1] as HTMLElement);
  await waitFor(() =>
    expect(view.container.querySelector(".pin-summary")?.textContent).toBe("1 of 2 expected"),
  );
  expect(view.container.querySelector(".pin-dot.error")).not.toBeNull();
  expect(view.container.querySelectorAll(".pattern-input-fail")).toHaveLength(1);

  // The pattern counts: `react` hit one of two; `!react-dom` blocks none.
  const counts = [...view.container.querySelectorAll(".pattern-count")].map((el) => el.textContent);
  expect(counts).toEqual(["1/2", "blocks 0"]);
});

it("offers the last run's values for the picked option, and removes a test", async () => {
  const view = render(
    <Harness
      initial={[{ id: "pattern-1", option: "matchPackageNames", patterns: ["react"], inputs: [] }]}
    />,
  );
  // Collapsed: the head shows the patterns and the pending sentence.
  await waitFor(() =>
    expect(view.container.querySelector(".pin-summary")?.textContent).toBe("no inputs yet"),
  );
  expect(view.container.querySelector(".pattern-head-pattern")?.textContent).toBe("react");

  fireEvent.click(view.getByRole("button", { name: /Expand the pattern test/ }));
  fireEvent.click(
    await view.findByRole("button", { name: "+ add the 1 values from your last run" }),
  );
  await waitFor(() => expect(view.getByLabelText("Input 1")).toHaveProperty("value", "react"));
  // Taken, the offer is gone.
  expect(view.queryByRole("button", { name: /values from your last run/ })).toBeNull();

  fireEvent.click(
    view.getByRole("button", { name: "Remove the pattern test for matchPackageNames" }),
  );
  await waitFor(() => expect(view.container.querySelector(".pattern-card")).toBeNull());
});
