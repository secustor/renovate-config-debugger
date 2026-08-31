/**
 * Roadmap 075 (iteration 5b): the Presets tab's two views and the one rule
 * that binds them — the ledger leads, the tree is one click away, and anything
 * that names a NODE (a provenance chip, a simulator rule, an editor hover, a
 * share link's `node`) lands on the tree with that node selected, exactly as
 * before this iteration existed.
 *
 * Over a real (offline) run: the ledger's numbers are the run's own, so a
 * synthetic tree would prove the wiring and not the view.
 */
import { runPipeline } from "@renovate-config-debugger/engine";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { beforeAll, expect, it, vi } from "vitest";
import { stubResizeObserver } from "@tools/test/jsdom-stubs";
import { PresetsPanel } from "./PresetsPanel";

beforeAll(() => {
  // jsdom lacks the one API the tree's windowing observes.
  stubResizeObserver();
});

const CONFIG = { extends: [":dependencyDashboard"] };

function panel(
  result: Awaited<ReturnType<typeof runPipeline>>,
  opts: { selectedId?: string | null; onSelectNode?: (id: string | null) => void } = {},
) {
  return (
    <PresetsPanel
      result={result}
      onInject={() => undefined}
      selectedId={opts.selectedId ?? null}
      onSelectNode={opts.onSelectNode ?? (() => undefined)}
      authState="unconfigured"
      onSignIn={() => undefined}
    />
  );
}

function run() {
  return runPipeline({ fileName: "renovate.json", content: JSON.stringify(CONFIG) });
}

it("opens on the ledger and keeps the full tree one click away", async () => {
  const result = await run();
  const view = render(panel(result));

  // The ledger leads: a summary strip COUNTING the sources (082 took the
  // per-source tokens out of it — the cards below are the list), a card per
  // source, and not a single tree row.
  const strip = view.container.querySelector(".summary-strip");
  expect(strip?.textContent).toContain("1 source");
  expect(strip?.querySelector(".preset-token")).toBeNull();
  expect(view.container.querySelector(".ledger-card")).not.toBeNull();
  expect(view.container.querySelector(".preset-row")).toBeNull();
  // Every card starts shut — the header is the answer, the body is on request.
  const headToggle = view.container.querySelector(".ledger-head-toggle");
  expect(headToggle?.getAttribute("aria-expanded")).toBe("false");

  fireEvent.click(view.getByRole("button", { name: "open the full tree →" }));
  await waitFor(() => expect(view.container.querySelector(".preset-row")).not.toBeNull());
  // The tree view says how to get back, and does.
  fireEvent.click(view.getByRole("button", { name: "← Back to summary" }));
  expect(view.container.querySelector(".preset-row")).toBeNull();
  expect(view.container.querySelector(".ledger-card")).not.toBeNull();
});

it("lists the options a source set, and its preset token opens that node in the tree", async () => {
  const result = await run();
  const onSelectNode = vi.fn();
  const view = render(panel(result, { onSelectNode }));

  // The card starts shut; its body — the option rows — renders on request.
  const headToggle = view.container.querySelector<HTMLElement>(".ledger-head-toggle");
  if (!headToggle) {
    throw new Error("the ledger rendered no card header");
  }
  fireEvent.click(headToggle);
  const row = view.container.querySelector<HTMLElement>(".ledger-option-row");
  if (!row) {
    throw new Error("the ledger listed no option row for a preset that sets one");
  }
  expect(row.textContent).toContain("dependencyDashboard");
  // The token is the standard cross-link: it selects the node AND puts the
  // tree on screen, so App's landing has a selected row to find.
  fireEvent.click(within(row).getByRole("button", { name: ":dependencyDashboard" }));
  expect(onSelectNode).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(view.container.querySelector(".preset-row")).not.toBeNull());
});

it("switches to the tree when a node is selected from outside the tab", async () => {
  const result = await run();
  const view = render(panel(result));
  expect(view.container.querySelector(".preset-row")).toBeNull();

  // What a provenance chip, a simulator rule or a share link's `node` does:
  // App sets the selection, and the tab must show the tree selected on it.
  const node = result.presetTree?.children[0];
  if (!node) {
    throw new Error("the run resolved no preset node to select");
  }
  view.rerender(panel(result, { selectedId: node.id }));
  await waitFor(() => expect(view.container.querySelector(".preset-name.selected")).not.toBeNull());
  expect(view.container.querySelector(".preset-name.selected")?.textContent).toBe(node.name);
});

it("opens on the tree when the selection is already set at mount", async () => {
  // A share link carrying `node` (007): the results half is a lazy chunk, so
  // App can have applied the selection BEFORE this panel first renders. A panel
  // that only watched for changes would open on the ledger and lose the link's
  // whole point — which is exactly what the e2e suite caught.
  const result = await run();
  const node = result.presetTree?.children[0];
  if (!node) {
    throw new Error("the run resolved no preset node to select");
  }
  const view = render(panel(result, { selectedId: node.id }));
  await waitFor(() => expect(view.container.querySelector(".preset-name.selected")).not.toBeNull());
  expect(view.container.querySelector(".ledger-card")).toBeNull();
});
