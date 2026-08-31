import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProvenanceLayer } from "@renovate-config-debugger/engine";
import { ProvenanceChip } from "./ProvenanceChip";

/**
 * Roadmap 068 review — the chip is a `role="button"` span, so it implements its
 * own activation, and an activation written before ⌘⏎ was a page-wide binding
 * fired on any Enter at all. A keyboard user who Tabs onto a chip and presses
 * ⌘⏎ to re-run then got a tab switch and a selected preset node instead: a
 * WRONG action, with the results they were reading replaced.
 */

const PRESET_LAYER: ProvenanceLayer = {
  kind: "preset",
  nodeId: "node-1",
  name: "config:recommended",
};

function renderChip() {
  const onSelectPreset = vi.fn();
  const view = render(<ProvenanceChip layer={PRESET_LAYER} onSelectPreset={onSelectPreset} />);
  return { chip: view.getByRole("button"), onSelectPreset };
}

describe("ProvenanceChip activation", () => {
  it("leaves a modified Enter to the page", () => {
    const { chip, onSelectPreset } = renderChip();

    // Not claimed either: `useShortcut` bails on `defaultPrevented`, so
    // swallowing the default here would kill Run just as thoroughly as acting
    // on it would send the reader somewhere they did not ask to go.
    expect(fireEvent.keyDown(chip, { key: "Enter", metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(chip, { key: "Enter", ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(chip, { key: "Enter", shiftKey: true })).toBe(true);
    expect(onSelectPreset).not.toHaveBeenCalled();
  });

  it("still activates on a bare Enter and Space", () => {
    const { chip, onSelectPreset } = renderChip();

    fireEvent.keyDown(chip, { key: "Enter" });
    fireEvent.keyDown(chip, { key: " " });

    expect(onSelectPreset).toHaveBeenCalledTimes(2);
    expect(onSelectPreset).toHaveBeenCalledWith("node-1");
  });
});
