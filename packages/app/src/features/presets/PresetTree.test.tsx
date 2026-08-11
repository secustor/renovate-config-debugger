/**
 * Roadmap 069 (PR 4): describe mode end to end, over a real (offline) run. The
 * per-node index and every note's wording have their own unit tests, so this
 * covers only what those cannot: that the engine's attribution reaches the
 * DOM, that compact — the default — is byte-for-byte the tree that existed
 * before this PR, that describe mode adds a row only for the nodes that have
 * something to say, and that the position marker really is the jump to the
 * Effective config's ledger.
 */
import { runPipeline } from "@renovate-config-debugger/engine";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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
  onShowDescriptionOrder?: () => void,
) {
  return (
    <PresetTree
      result={result}
      onInject={() => undefined}
      selectedId={null}
      onSelectNode={() => undefined}
      authState="unconfigured"
      onSignIn={() => undefined}
      installUrl="https://example.invalid"
      onShowDescriptionOrder={onShowDescriptionOrder}
    />
  );
}

it("shows each node's own sentence in describe mode, and nothing in compact", async () => {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify(CONFIG),
  });
  const onShowDescriptionOrder = vi.fn();
  const view = render(tree(result, onShowDescriptionOrder));

  // Provenance is loaded through the engine's dynamic import, so the toggle
  // (and the title's count) appear a commit later than the tree itself.
  await waitFor(() => expect(view.queryByRole("radio", { name: "describe" })).not.toBeNull());
  expect(view.getByText("2 contribute descriptions", { exact: false })).toBeTruthy();

  // Compact is the default and renders exactly today's tree: no quote rows, no
  // position markers.
  const quoteRows = () => view.container.querySelectorAll(".preset-desc-row");
  const compactRowCount = view.container.querySelectorAll(".preset-row").length;
  expect(quoteRows()).toHaveLength(0);
  expect(view.container.querySelectorAll(".preset-desc-pos")).toHaveLength(0);

  fireEvent.click(view.getByRole("radio", { name: "describe" }));

  // …and describe mode adds a row per FACT, not per node: the two contributing
  // presets gain a quote line, the nodes around them gain nothing.
  expect(view.container.querySelectorAll(".preset-row")).toHaveLength(compactRowCount);
  expect(quoteRows()).toHaveLength(2);
  expect(view.getByText(DASHBOARD_SENTENCE)).toBeTruthy();

  // The marker ties the node to its slot in the final array…
  const marker = view.getByText("→ #1 of 2");
  expect(marker.tagName).toBe("BUTTON");
  // …and, given App's plumbing, is the jump to the row that prints it.
  fireEvent.click(marker);
  expect(onShowDescriptionOrder).toHaveBeenCalledTimes(1);

  fireEvent.click(view.getByRole("radio", { name: "compact" }));
  expect(quoteRows()).toHaveLength(0);
});

it("offers no describe mode when nothing in the run has a description", async () => {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({ extends: ["github>test-org/nope"], automerge: true }),
  });
  const view = render(tree(result));

  // A failed preset resolves nothing, so there is neither a sentence nor a
  // drop to explain — the toggle would be a control over an empty set.
  await waitFor(() => expect(view.container.querySelector(".preset-row")).not.toBeNull());
  expect(view.queryByRole("radio", { name: "describe" })).toBeNull();
});
