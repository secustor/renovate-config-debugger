/**
 * Roadmap 075 (iteration 6): the Tests tab's two views and the rules that bind
 * them — the pins list leads and is what a run re-checks, the full simulator is
 * one quiet link away and unchanged, and anything that names a SIMULATION (a
 * share link's `sim`) or a RULE (a cross-link's index) opens the simulator
 * itself rather than the list.
 *
 * Over a real (offline — no `extends`, so nothing is fetched) run, because the
 * pin cards' numbers are the run's own: a synthetic result would prove the
 * wiring and not the verdict.
 */
import { useState } from "react";
import { runPipeline } from "@renovate-config-debugger/engine";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, expect, it } from "vitest";
import type { SimRequest } from "@/hooks/use-share-link";
import type { FormState } from "./form";
import type { PinnedTest } from "./pins";
import { TestsPanel } from "./TestsPanel";

afterEach(cleanup);

beforeAll(() => {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = () => undefined;
  window.scrollTo = () => undefined;
});

const CONFIG = {
  packageRules: [
    { matchPackageNames: ["react"], groupName: "react" },
    { matchSourceUrls: ["https://github.com/nowhere/nothing"], automerge: true },
  ],
};

function run() {
  return runPipeline({ fileName: "renovate.json", content: JSON.stringify(CONFIG) });
}

/** App's half of the contract: it owns the pins, the panel does the rest. */
function Harness({
  result,
  initialPins = [],
  simRequest,
}: {
  result: Awaited<ReturnType<typeof runPipeline>>;
  initialPins?: PinnedTest[];
  simRequest?: SimRequest | null;
}) {
  const [pins, setPins] = useState<PinnedTest[]>(initialPins);
  // Every callback is required (the shell always passes all of them), so the
  // harness supplies the whole set; the ones no assertion here reads are inert
  // stubs rather than absent props.
  const [mergeStepIndex, setMergeStepIndex] = useState(0);
  return (
    <TestsPanel
      result={result}
      pins={pins}
      onAddPin={(form: FormState) =>
        setPins((prev) => [...prev, { id: `pin-${prev.length + 1}`, form }])
      }
      onRemovePin={(id: string) => setPins((prev) => prev.filter((pin) => pin.id !== id))}
      onSelectPreset={() => undefined}
      onJumpToEditor={() => undefined}
      focusRuleIndex={null}
      onRuleFocused={() => undefined}
      errorLib={null}
      simRequest={simRequest ?? null}
      onCopySimLink={() => Promise.resolve()}
      onShare={() => Promise.resolve()}
      mergeStepIndex={mergeStepIndex}
      onMergeStepChange={setMergeStepIndex}
    />
  );
}

async function pinReact(view: ReturnType<typeof render>): Promise<void> {
  fireEvent.click(view.getByRole("button", { name: /Pin a dependency/ }));
  fireEvent.change(view.getByLabelText("packageName", { exact: true }), {
    target: { value: "react" },
  });
  fireEvent.change(view.getByLabelText("currentValue", { exact: true }), {
    target: { value: "17.0.0" },
  });
  fireEvent.change(view.getByLabelText("newValue", { exact: true }), {
    target: { value: "17.0.1" },
  });
  fireEvent.click(view.getByRole("button", { name: "Pin ⏎" }));
  await waitFor(() => expect(view.container.querySelector(".pin-card")).not.toBeNull());
}

it("opens on the pins list, pins a dependency from the ghost form, and checks it against the run", async () => {
  const result = await run();
  const view = render(<Harness result={result} />);

  // The list leads: a summary strip, the explainer, the ghost row — and not
  // the simulator card.
  expect(view.container.querySelector(".summary-strip")?.textContent).toContain("0");
  expect(view.container.querySelector(".pin-ghost")).not.toBeNull();
  expect(view.queryByText("Update simulator")).toBeNull();

  await pinReact(view);

  const card = view.container.querySelector<HTMLElement>(".pin-card");
  if (!card) {
    throw new Error("pinning produced no card");
  }
  expect(card.textContent).toContain("react");
  // The outcome, in the run's own terms: the rule that groups react matched,
  // and the count is over the whole merged rule list.
  await waitFor(() => {
    expect(within(card).getByText("grouped: react")).toBeTruthy();
  });
  expect(within(card).getByText("1 of 2 rules")).toBeTruthy();
  // Amber, and for the honest reason: the reader's second rule lost to a
  // `sourceUrl` this descriptor leaves unset, which is exactly the caveat the
  // verdict card raises (replay-02 R3). Green is for a verdict the tool is
  // confident about, whatever it says.
  expect(card.querySelector(".pin-dot.warn")).not.toBeNull();

  // Expanding names both sides in the simulator's own grammar: what matched,
  // and which of the reader's OWN rules did not.
  fireEvent.click(within(card).getByRole("button", { expanded: false }));
  expect(within(card).getByText("✓ 1 matched")).toBeTruthy();
  expect(card.textContent).toContain("packageRules[0]");
  expect(within(card).getByText("✗ 1 of your own rules didn’t match")).toBeTruthy();
  expect(card.textContent).toContain("failed on matchSourceUrls");

  // …and removing it leaves the list empty again.
  fireEvent.click(view.getByRole("button", { name: "Remove the pinned test for react" }));
  expect(view.container.querySelector(".pin-card")).toBeNull();
});

it("re-checks the pins against a NEW run without being asked", async () => {
  const first = await run();
  const view = render(<Harness result={first} />);
  await pinReact(view);
  await waitFor(() => expect(view.getByText("grouped: react")).toBeTruthy());

  // The edit a reader would make: the rule now automerges react instead of
  // grouping it. Nothing asks the pin to re-run — the new RESULT is the ask.
  const second = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({ packageRules: [{ matchPackageNames: ["react"], automerge: true }] }),
  });
  view.rerender(<Harness result={second} />);
  await waitFor(() => expect(view.getByText("automerge ✓")).toBeTruthy());
  expect(view.queryByText("grouped: react")).toBeNull();
  expect(view.getByText("1 of 1 rules")).toBeTruthy();
});

it("opens a pin in the full simulator, pre-filled, and comes back", async () => {
  const result = await run();
  const view = render(<Harness result={result} />);
  await pinReact(view);
  const card = view.container.querySelector<HTMLElement>(".pin-card");
  if (!card) {
    throw new Error("pinning produced no card");
  }
  fireEvent.click(within(card).getByRole("button", { expanded: false }));
  fireEvent.click(within(card).getByRole("button", { name: "open in simulator →" }));

  // The simulator, with this pin's descriptor in its form (the same channel a
  // share link's `sim` uses, so there is one pre-fill mechanism, not two).
  await waitFor(() => expect(view.getByText("Update simulator")).toBeTruthy());
  await waitFor(() =>
    expect(view.getByLabelText("packageName", { exact: true })).toHaveProperty("value", "react"),
  );
  fireEvent.click(view.getByRole("button", { name: "← Back to tests" }));
  expect(view.container.querySelector(".pin-card")).not.toBeNull();
});

it("lands on the simulator when the link that opened the app carried a simulation", async () => {
  const result = await run();
  const view = render(
    <Harness
      result={result}
      simRequest={{
        form: { packageName: "react", currentValue: "17.0.0", newValue: "17.0.1" },
        autoSimulate: true,
        ranResult: result,
        nonce: 1,
      }}
    />,
  );
  // No click: a `sim` link names a simulation, and the simulator is where one
  // is read (the auto-run itself is `useShareLinkRequest`'s, unchanged).
  expect(view.getByText("Update simulator")).toBeTruthy();
  expect(view.container.querySelector(".pin-ghost")).toBeNull();
  await waitFor(() => expect(view.container.querySelector(".sim-verdict-block")).not.toBeNull(), {
    timeout: 30_000,
  });
});
