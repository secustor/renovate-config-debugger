import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useShortcut } from "@/hooks/use-shortcut";
import { RUN_SHORTCUT } from "@/lib/shortcuts";
import { EMPTY_FORM } from "./form";
import { SimulatorForm } from "./SimulatorForm";

/**
 * Roadmap 067 review — which Enter this form claims.
 *
 * It declines implicit submission from the two `<datalist>` comboboxes, where
 * Enter belongs to the suggestion list. That guard read `e.key` alone, so it
 * also prevented the default of ⌘/Ctrl+⏎, and `useShortcut` bails on
 * `defaultPrevented` — leaving the app's primary shortcut dead in exactly the
 * `datasource` and `manager` fields. Hence the harness: the real page listener,
 * bound to the real registry entry, next to the real form.
 *
 * Implicit submission itself is jsdom's blind spot (it does not implement it),
 * so the bare-Enter half is asserted where the form actually acts on it — the
 * default of the keydown, which is the browser's signal to submit or not.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

function Harness({ onRun }: { onRun: () => void }) {
  useShortcut(RUN_SHORTCUT, onRun);
  return (
    <SimulatorForm
      form={EMPTY_FORM}
      setForm={() => undefined}
      updateTypeTouched={false}
      setUpdateTypeTouched={() => undefined}
      effectiveUpdateType=""
      derivedUpdateType={undefined}
      updateTypeKeyDown={() => undefined}
      datasourceNames={["npm"]}
      managerNames={["npm"]}
      // Open, because `manager` — the second combobox — lives in this drawer
      // and `SummaryDrawer` renders its body only while open.
      moreFieldsOpen={true}
      onMoreFieldsToggle={() => undefined}
      onQuickFill={() => undefined}
      onSubmit={() => undefined}
    />
  );
}

function renderForm() {
  const onRun = vi.fn();
  const view = render(<Harness onRun={onRun} />);
  return { view, onRun };
}

describe("SimulatorForm — Enter", () => {
  it("lets the Run chord through from a combobox", () => {
    const { view, onRun } = renderForm();

    fireEvent.keyDown(view.getByLabelText("datasource"), { key: "Enter", metaKey: true });
    expect(onRun).toHaveBeenCalledOnce();

    // Ctrl too: `matchShortcut` accepts either modifier on every platform, so
    // the form has to stand aside for both.
    fireEvent.keyDown(view.getByLabelText("manager"), { key: "Enter", ctrlKey: true });
    expect(onRun).toHaveBeenCalledTimes(2);
  });

  it("still declines a bare Enter in a combobox, and only there", () => {
    // The guard the fix must not undo: arrowing to `npm` and pressing Enter to
    // TAKE it must not also fire a whole verdict. `fireEvent` reports the
    // dispatch result, which is false exactly when the default was prevented.
    const { view } = renderForm();

    expect(fireEvent.keyDown(view.getByLabelText("datasource"), { key: "Enter" })).toBe(false);
    expect(fireEvent.keyDown(view.getByLabelText("packageName"), { key: "Enter" })).toBe(true);
  });
});
