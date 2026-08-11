import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ESCAPE_PRIORITY, type EscapePriority } from "@/lib/escape-stack";
import { useEscapeLayer } from "./use-escape-layer";

/**
 * Roadmap 067 review — the ladder's document listener and the one target it
 * yields to. The ordering itself is `escape-stack.test.ts`'s (pure); what needs
 * a DOM is which PRESS reaches the stack at all.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

function Pill({
  onEscape,
  priority = ESCAPE_PRIORITY.ambient,
}: {
  onEscape: () => void;
  priority?: EscapePriority;
}) {
  useEscapeLayer(true, onEscape, priority);
  return (
    <>
      <input aria-label="packageName" />
      <input aria-label="datasource" list="datasources" />
      <datalist id="datasources">
        <option value="npm" />
      </datalist>
    </>
  );
}

describe("useEscapeLayer", () => {
  it("dismisses the layer from inside a plain text field", () => {
    // The constraint round three established, and the reason the bail below is
    // as narrow as it is: the return pill and the session menu were
    // undismissable while the caret sat in a simulator field.
    const onEscape = vi.fn();
    const { getByLabelText } = render(<Pill onEscape={onEscape} />);

    fireEvent.keyDown(getByLabelText("packageName"), { key: "Escape" });
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it("leaves the layer alone for the FIRST press in a combobox", () => {
    // Type into `datasource` until the suggestions appear, press Escape to
    // dismiss them, and the same press destroyed the return pill — a layer the
    // user never asked to lose. The popup reports nothing to the page, so the
    // ladder stands aside for a press that could be its.
    const onEscape = vi.fn();
    const { getByLabelText } = render(<Pill onEscape={onEscape} />);

    fireEvent.keyDown(getByLabelText("datasource"), { key: "Escape" });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("gives the layer the next press, and re-arms the yield when the user types", () => {
    // What the rank alone could not do: `ambient` sits below the popover/menu
    // threshold, so the return pill was undismissable from these two fields for
    // the whole session, though the `?` sheet prints Escape as dismissing it.
    // One press is the popup's; the one after it is the page's — a wasted
    // keystroke at worst, instead of a layer destroyed or a key that is inert
    // forever.
    const onEscape = vi.fn();
    const { getByLabelText } = render(<Pill onEscape={onEscape} />);
    const combobox = getByLabelText("datasource");

    fireEvent.keyDown(combobox, { key: "Escape" });
    fireEvent.keyDown(combobox, { key: "Escape" });
    expect(onEscape).toHaveBeenCalledOnce();

    // Typing can put the suggestions back, so the next Escape is the popup's
    // again — and the one after it is the page's again.
    fireEvent.keyDown(combobox, { key: "n" });
    fireEvent.keyDown(combobox, { key: "Escape" });
    expect(onEscape).toHaveBeenCalledOnce();
    fireEvent.keyDown(combobox, { key: "Escape" });
    expect(onEscape).toHaveBeenCalledTimes(2);
  });

  it("re-arms the yield on a click too, which can also open the popup", () => {
    // Clicking the control is the other way the suggestions come back, and it
    // produces no keydown — hence the second listener. Without it, a user who
    // clicked back into the field and pressed Escape would lose the layer to the
    // press that closed the popup, which is the regression the yield exists for.
    const onEscape = vi.fn();
    const { getByLabelText } = render(<Pill onEscape={onEscape} />);
    const combobox = getByLabelText("datasource");

    fireEvent.keyDown(combobox, { key: "Escape" });
    fireEvent.keyDown(combobox, { key: "Escape" });
    expect(onEscape).toHaveBeenCalledOnce();

    fireEvent.pointerDown(combobox);
    fireEvent.keyDown(combobox, { key: "Escape" });
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it("still dismisses a popover from one of those fields", () => {
    // The yield above is for a popup that opened ITSELF as the user typed; it
    // cannot outrank a card the user asked for. Nothing closes the rule-evidence
    // popover on blur and it does not trap focus, so Tabbing out of it and back
    // into `datasource` is reachable — and while the bail was unconditional the
    // card was undismissable from there, the stranding this ladder exists to
    // stop.
    const onEscape = vi.fn();
    const { getByLabelText } = render(
      <Pill onEscape={onEscape} priority={ESCAPE_PRIORITY.popover} />,
    );

    fireEvent.keyDown(getByLabelText("datasource"), { key: "Escape" });
    expect(onEscape).toHaveBeenCalledOnce();
  });
});
