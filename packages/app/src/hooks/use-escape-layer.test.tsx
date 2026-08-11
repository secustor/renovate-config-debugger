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

  it("leaves the layer alone for a press aimed at a native suggestion popup", () => {
    // Type into `datasource` until the suggestions appear, press Escape to
    // dismiss them, and the same press destroyed the return pill — a layer the
    // user never asked to lose. The popup reports nothing to the page, so the
    // ladder stands aside for the whole combobox.
    const onEscape = vi.fn();
    const { getByLabelText } = render(<Pill onEscape={onEscape} />);

    fireEvent.keyDown(getByLabelText("datasource"), { key: "Escape" });
    expect(onEscape).not.toHaveBeenCalled();
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
