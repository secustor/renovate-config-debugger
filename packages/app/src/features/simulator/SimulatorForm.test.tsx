import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useShortcut } from "@/hooks/use-shortcut";
import { RUN_SHORTCUT } from "@/lib/shortcuts";
import { EMPTY_FORM } from "./form";
import { SimulatorForm } from "./SimulatorForm";

/**
 * Roadmap 068 review — which Enter this form claims.
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
 *
 * Roadmap 079 added the third claimant the same rules have to hold for: a
 * multi-value field's draft input, where bare Enter commits a chip and must
 * never also fire a verdict.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

function Harness({
  onRun,
  openGroup = 0,
  compact = false,
}: {
  onRun: () => void;
  openGroup?: number;
  compact?: boolean;
}) {
  useShortcut(RUN_SHORTCUT, onRun);
  return (
    <SimulatorForm
      form={EMPTY_FORM}
      setForm={() => undefined}
      setUpdateTypeTouched={() => undefined}
      effectiveUpdateType=""
      derivedUpdateType={undefined}
      updateTypeKeyDown={() => undefined}
      datasourceNames={["npm"]}
      managerNames={["npm"]}
      // Group 0 by default, because `manager` — the second combobox — lives in
      // it and a collapsed group renders no fields.
      openGroup={openGroup}
      onOpenGroupChange={() => undefined}
      onQuickFill={() => undefined}
      onSubmit={() => undefined}
      compact={compact}
    />
  );
}

function renderForm(props: { openGroup?: number; compact?: boolean } = {}) {
  const onRun = vi.fn();
  const view = render(<Harness onRun={onRun} {...props} />);
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

describe("SimulatorForm — the redesigned shape (079)", () => {
  it("states the update as a sentence with four blanks and a derived chip", () => {
    const { view } = renderForm();

    for (const name of ["packageName", "currentValue", "newValue", "datasource"]) {
      expect(view.getByLabelText(name, { exact: true })).toBeTruthy();
    }
    // updateType is stated, not asked — but the override is one click away,
    // and it is the same nine types 015 offered.
    const updateType = view.getByLabelText("updateType", { exact: true });
    expect(updateType).toHaveProperty("value", "");
    expect(updateType.getAttribute("title")).toBe(
      "fill the version pair to derive it — click to set one",
    );
    expect(view.container.querySelector(".sim-ut-value")?.textContent).toBe("(unset)");
  });

  it("holds the rest in three groups, one open at a time, each counting itself", () => {
    const { view } = renderForm();

    const heads = view.container.querySelectorAll(".sim-group-head");
    expect(heads).toHaveLength(3);
    // Nothing is filled in, so every count pill is the ghost one.
    expect(view.container.querySelectorAll(".sim-group-count.set")).toHaveLength(0);
    // Only the open group's body is mounted (the harness opens the first).
    expect(view.container.querySelectorAll(".sim-group-body")).toHaveLength(1);
    expect(heads[0]?.getAttribute("aria-expanded")).toBe("true");
    expect(heads[1]?.getAttribute("aria-expanded")).toBe("false");
  });

  it("previews the descriptor as an aside standalone, as a collapsed section compact", () => {
    // Standalone: the sticky aside is there, and an empty form says so rather
    // than printing seven keys set to "".
    const standalone = renderForm().view;
    expect(standalone.container.querySelector(".sim-descriptor")).not.toBeNull();
    expect(standalone.container.querySelector(".sim-descriptor-section")).toBeNull();
    expect(standalone.container.querySelector(".sim-descriptor-json")?.textContent).toBe("{}");
    expect(standalone.container.querySelector(".sim-descriptor-empty")).not.toBeNull();

    cleanup();
    // Compact (the Tests tab's Add-a-test panel): no aside column — the same
    // document lives in the collapsed "Descriptor JSON" section instead (082).
    const compact = renderForm({ compact: true }).view;
    expect(compact.container.querySelector(".sim-descriptor")).toBeNull();
    expect(compact.container.querySelector(".sim-form-body.with-preview")).toBeNull();
    expect(compact.container.querySelector(".sim-descriptor-section")).not.toBeNull();
  });

  it("gives a multi-value field's Enter to the chip, never to the form", () => {
    // Group 1 holds `registryUrls`, the first of the three chip fields.
    const { view, onRun } = renderForm({ openGroup: 1 });
    const draft = view.getByLabelText("registryUrls", { exact: true });

    // Bare Enter is consumed here — the default is prevented, so implicit
    // submission cannot happen even though the field is no combobox.
    expect(fireEvent.keyDown(draft, { key: "Enter" })).toBe(false);
    // …and the Run chord still reaches the page listener, as everywhere else.
    fireEvent.keyDown(draft, { key: "Enter", metaKey: true });
    expect(onRun).toHaveBeenCalledOnce();
  });
});
