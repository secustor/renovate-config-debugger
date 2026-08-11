import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DescriptionCard } from "@/lib/description-attribution";
import { DescriptionValue } from "./DescriptionAttribution";

/**
 * Roadmap 069 review — the jump takes its own card with it.
 *
 * A pointer-opened card never held focus, so no blur closes it; the jump
 * switches tabs, and the portalled card outlived the view it was explaining,
 * fixed at its old coordinates over the preset tree.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

const CARD: DescriptionCard = {
  index: 0,
  value: "Use the recommended config",
  layer: { kind: "preset", nodeId: "node-1", name: "config:recommended" },
  path: ["config:recommended"],
  position: 1,
  total: 1,
  nodeId: "node-1",
};

it("closes the card when its tree jump is taken", () => {
  const onSelectPreset = vi.fn();
  const { getByText } = render(<DescriptionValue card={CARD} onSelectPreset={onSelectPreset} />);

  // Opened by POINTER, which is the case with nothing else to close it — the
  // hover gate (roadmap 025) wants the move, not just the enter.
  const anchor = getByText(JSON.stringify(CARD.value));
  fireEvent.mouseEnter(anchor);
  fireEvent.mouseMove(anchor);
  expect(document.querySelector(".desc-attr-card")).not.toBeNull();

  fireEvent.click(getByText("Show in preset tree →"));
  expect(onSelectPreset).toHaveBeenCalledWith("node-1");
  expect(document.querySelector(".desc-attr-card")).toBeNull();
});
