import type { ProvenanceLayer } from "@renovate-config-debugger/engine";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { LayerSource } from "./LayerSource";

/**
 * The shared "who wrote this" cell, over the prop matrix its four callers
 * actually pass — the Overview's topic rows, the blame ledger's lines and its
 * dropped footnote, and the cascade step.
 *
 * What is pinned here is the contract those four rely on and used to restate
 * one at a time: a preset writer is ALWAYS the standard `preset-token` and
 * never a layer chip (081's rule, which the dropped footnote was the app's last
 * exception to), the jump is gated on the node existing rather than on the
 * callback existing, and the cascade step's wrapper-less shape stays
 * wrapper-less.
 */

afterEach(cleanup);

const REPO: ProvenanceLayer = { kind: "repo" };
const PRESET: ProvenanceLayer = { kind: "preset", nodeId: "n1", name: "config:recommended" };

test("names a preset writer with the standard token, never a layer chip", () => {
  const view = render(
    <LayerSource preset={{ name: "group:recommended", nodeId: "n5" }} layer={PRESET} />,
  );
  const token = view.container.querySelector(".preset-token");
  expect(token?.textContent).toBe("group:recommended");
  expect(view.container.querySelector(".prov-layer")).toBeNull();
});

test("falls back to the layer's chip when there is no preset to name", () => {
  const view = render(<LayerSource preset={null} layer={REPO} />);
  expect(view.container.querySelector(".preset-token")).toBeNull();
  expect(view.container.querySelector(".prov-layer")?.textContent).toBe("repo config");
});

test("jumps on click, and only when the writer has a node to jump to", () => {
  const onSelectPreset = vi.fn();
  const jumps = render(
    <LayerSource
      preset={{ name: "group:recommended", nodeId: "n5" }}
      onSelectPreset={onSelectPreset}
    />,
  );
  fireEvent.click(jumps.getByRole("button", { name: "group:recommended" }));
  expect(onSelectPreset).toHaveBeenCalledWith("n5");

  cleanup();
  onSelectPreset.mockClear();

  // The root node is the input config: it has no row in the resolution tree, so
  // an offer to show it there would select a node that never renders. Inert
  // token — a `<code>`, not a control.
  const inert = render(
    <LayerSource preset={{ name: "(input config)" }} onSelectPreset={onSelectPreset} />,
  );
  expect(inert.queryByRole("button")).toBeNull();
  expect(inert.container.querySelector("code.preset-token")?.textContent).toBe("(input config)");
  expect(onSelectPreset).not.toHaveBeenCalled();
});

test("marks an approximate attribution with the shared mark, naming what was guessed", () => {
  const confident = render(<LayerSource preset={{ name: "a", nodeId: "n1" }} />);
  expect(confident.container.querySelector(".desc-approx-mark")).toBeNull();
  cleanup();

  const guessed = render(
    <LayerSource
      preset={{ name: "group:recommended", nodeId: "n1" }}
      approximate
      approximateName="group:recommended"
    />,
  );
  const mark = guessed.container.querySelector(".desc-approx-mark");
  expect(mark).not.toBeNull();
  // The shared wording, naming the token beside it — never a second hedge.
  expect(mark?.getAttribute("title")).toBe(
    "Contributed somewhere inside group:recommended — the exact preset could not be determined",
  );
  cleanup();

  // A cell that fell through to the chip has no token to name, and the bare
  // mark is exactly the case `ApproximateMark` exists for.
  const unnamed = render(<LayerSource preset={null} layer={REPO} approximate />);
  expect(unnamed.container.querySelector(".desc-approx-mark")?.getAttribute("title")).toBe(
    "The exact preset that wrote this sentence could not be determined",
  );
});

test("wraps the cell only when the caller asks for one", () => {
  const cell = render(
    <LayerSource className="desc-ledger-src" preset={{ name: "a", nodeId: "n1" }}>
      <span className="desc-ledger-via">because</span>
    </LayerSource>,
  );
  const wrapper = cell.container.querySelector(".desc-ledger-src");
  expect(wrapper).not.toBeNull();
  // Children ride INSIDE the cell, after the token — the dropped row's reason.
  expect(wrapper?.querySelector(".desc-ledger-via")?.textContent).toBe("because");
  expect(wrapper?.querySelector(".preset-token")).not.toBeNull();
  cleanup();

  // The cascade step spreads its token, the verb and its badges across one head
  // row, so there is no cell to wrap.
  const bare = render(<LayerSource preset={{ name: "a", nodeId: "n1" }} />);
  expect(bare.container.firstElementChild?.className).toBe("preset-token");
});
