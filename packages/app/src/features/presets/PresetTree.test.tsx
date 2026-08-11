/**
 * Roadmap 069 (PR 4): the tree's description surfaces end to end, over a real
 * (offline) run. The per-node index and every note's wording have their own
 * unit tests, so this covers only what those cannot: that the engine's
 * attribution reaches the DOM through the hover card on a described NAME, that
 * the card's jump really is the App-level cross-link to the blame ledger, that
 * the detail panel repeats the same facts as a Description entry, and that a
 * run without descriptions mounts no affordance at all.
 */
import { runPipeline } from "@renovate-config-debugger/engine";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { PresetTree } from "./PresetTree";

afterEach(cleanup);

beforeAll(() => {
  // jsdom lacks the one API the tree's windowing observes.
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// Internal presets resolve with no network, so this whole run is offline. Two
// sentences, from two different nodes, one level down.
const CONFIG = {
  extends: [":dependencyDashboard", ":semanticPrefixFixDepsChoreOthers"],
};

const DASHBOARD_SENTENCE = "Enable Renovate Dependency Dashboard creation.";

function tree(
  result: Awaited<ReturnType<typeof runPipeline>>,
  opts: {
    onShowDescriptionOrder?: () => void;
    selectedId?: string | null;
    onSelectNode?: (id: string | null) => void;
  } = {},
) {
  return (
    <PresetTree
      result={result}
      onInject={() => undefined}
      selectedId={opts.selectedId ?? null}
      onSelectNode={opts.onSelectNode ?? (() => undefined)}
      authState="unconfigured"
      onSignIn={() => undefined}
      installUrl="https://example.invalid"
      onShowDescriptionOrder={opts.onShowDescriptionOrder}
    />
  );
}

/** The open hover card's body, portalled to `<body>` — `null` when none is. */
function openCard(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".preset-desc-body");
}

it("shows a described node's sentences in a hover card on its name", async () => {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify(CONFIG),
  });
  const onShowDescriptionOrder = vi.fn();
  const view = render(tree(result, { onShowDescriptionOrder }));

  // Provenance loads through the engine's dynamic import, so the count (and
  // the hover affordance) appear a commit later than the tree itself.
  await waitFor(() =>
    expect(view.getByText("2 contribute descriptions", { exact: false })).toBeTruthy(),
  );

  // The rows themselves stay untouched: no quote rows, no markers — the facts
  // live on the name, marked by the `described` cue.
  expect(view.container.querySelector(".preset-desc-line")).toBeNull();
  const name = view.getByRole("button", { name: ":dependencyDashboard" });
  expect(name.className).toContain("described");
  expect(openCard()).toBeNull();

  fireEvent.focus(name);
  const card = openCard();
  if (!card) {
    throw new Error("focusing a described name opened no card");
  }
  expect(card.textContent).toContain(DASHBOARD_SENTENCE);
  // …with the sentence's slot in the FINAL array, non-strings included.
  expect(card.textContent).toContain("→ #1 of 2");

  // The card's jump is the App-level cross-link to the blame ledger — and it
  // closes the card it lives in, which is about to point at another tab.
  fireEvent.click(within(card).getByText("Show the full description array →"));
  expect(onShowDescriptionOrder).toHaveBeenCalledTimes(1);
  expect(openCard()).toBeNull();
});

it("repeats the selected node's description in the detail panel", async () => {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify(CONFIG),
  });
  // Selection is controlled by App; capture the id the name click reports and
  // feed it back, exactly as App would.
  let selected: string | null = null;
  const onSelectNode = (id: string | null) => {
    selected = id;
  };
  const view = render(tree(result, { onSelectNode }));

  // Wait for the DESCRIBED name, not just the name: when provenance resolves,
  // the plain button is remounted inside the hover anchor, and a handle taken
  // before that swap would be a detached node by the time it is clicked.
  const name = await waitFor(() => {
    const button = view.getByRole("button", { name: ":dependencyDashboard" });
    expect(button.className).toContain("described");
    return button;
  });
  fireEvent.click(name);
  expect(selected).not.toBeNull();
  view.rerender(tree(result, { onSelectNode, selectedId: selected }));

  const panel = view.container.querySelector<HTMLElement>(".preset-panel");
  if (!panel) {
    throw new Error("selecting a node opened no detail panel");
  }
  // Provenance may resolve after the panel mounts — the entry appears then.
  await waitFor(() => expect(within(panel).getByText("Description")).toBeTruthy());
  expect(within(panel).getByText(DASHBOARD_SENTENCE)).toBeTruthy();
  expect(within(panel).getByText("→ #1 of 2")).toBeTruthy();
});

it("offers no description affordance when nothing in the run has one", async () => {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({ extends: ["github>test-org/nope"], automerge: true }),
  });
  const view = render(tree(result));

  // A failed preset resolves nothing, so there is neither a sentence nor a
  // drop to explain — no count in the title, no cue on the name, no card.
  await waitFor(() => expect(view.container.querySelector(".preset-row")).not.toBeNull());
  expect(view.container.textContent).not.toContain("contribute descriptions");
  const name = view.getByRole("button", { name: "github>test-org/nope" });
  expect(name.className).not.toContain("described");
  fireEvent.focus(name);
  expect(openCard()).toBeNull();
});
