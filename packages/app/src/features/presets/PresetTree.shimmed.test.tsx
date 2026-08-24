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

it("shows a shed wrapper description plainly, without drop mechanics", async () => {
  // `config:best-practices` is a wrapper preset — body of only `description` +
  // `extends` — so Renovate sheds its sentence by design and it never reaches
  // the final array. That is the EXPECTED case, not a problem: the card shows
  // the sentence as the preset's own words, with no slot marker, no
  // strikethrough note, no merge mechanics.
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({ extends: ["config:best-practices"] }),
  });
  const view = render(tree(result));

  const name = await waitFor(() => {
    const button = view.getByRole("button", { name: "config:best-practices" });
    expect(button.className).toContain("described");
    return button;
  });
  fireEvent.focus(name);
  const card = openCard();
  if (!card) {
    throw new Error("focusing the wrapper's name opened no card");
  }
  const dropped = card.querySelector<HTMLElement>(".desc-dropped");
  if (!dropped) {
    throw new Error("the wrapper's shed sentence rendered no line");
  }
  expect(dropped.textContent).toContain("best practices from the Renovate maintainers");
  expect(dropped.textContent).not.toContain("Renovate drops");
  expect(dropped.querySelector(".preset-desc-note")).toBeNull();
  expect(dropped.querySelector(".preset-desc-pos")).toBeNull();
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

it("draws a source pill only for a preset that isn't Renovate's own", async () => {
  const internal = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify(CONFIG),
  });
  const internalView = render(tree(internal));
  await waitFor(() => expect(internalView.container.querySelector(".preset-row")).not.toBeNull());
  // Every node here is `internal` — the default, and the overwhelming
  // majority. A column of identical `internal` pills says nothing, so none
  // are drawn. The contribution count stays, keeping its glossary affordance.
  expect(internalView.container.querySelector(".badge.src")).toBeNull();
  const opts = internalView.container.querySelector<HTMLElement>(".badge.contrib.opts.explained");
  if (!opts) {
    throw new Error("a node with options of its own rendered no contribution count");
  }
  expect(opts.tabIndex).toBe(0);
  expect(opts.textContent).toContain("2 opts");

  const fetched = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({ extends: ["github>test-org/nope"] }),
  });
  const fetchedView = render(tree(fetched));
  await waitFor(() => expect(fetchedView.container.querySelector(".preset-row")).not.toBeNull());
  expect(fetchedView.container.querySelector(".badge.src")?.textContent).toBe("github");
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
