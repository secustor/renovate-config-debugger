import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LogLoadOverlay } from "./LogLoadOverlay";

function renderOverlay(over: Partial<Parameters<typeof LogLoadOverlay>[0]> = {}) {
  return render(
    <LogLoadOverlay loading={false} error={null} onLoad={vi.fn()} onClose={vi.fn()} {...over} />,
  );
}

describe("LogLoadOverlay (roadmap 095)", () => {
  it("says the log stays in the browser", () => {
    const view = renderOverlay();
    expect(view.container.textContent).toContain(
      "Parsed in your browser — nothing is sent anywhere.",
    );
  });

  it("loads pasted text, and only once something is pasted", () => {
    const onLoad = vi.fn();
    const view = renderOverlay({ onLoad });
    const submit = view.getByRole("button", { name: "Load pasted log" });
    expect(submit).toHaveProperty("disabled", true);
    fireEvent.change(view.getByLabelText("Paste a Renovate log"), { target: { value: "{}" } });
    fireEvent.click(submit);
    expect(onLoad).toHaveBeenCalledExactlyOnceWith("{}");
  });

  it("shows a parse error inline", () => {
    const view = renderOverlay({ error: "No JSON log lines found." });
    expect(view.getByRole("alert").textContent).toBe("No JSON log lines found.");
  });

  it("closes from Cancel and from the scrim", () => {
    const onClose = vi.fn();
    const view = renderOverlay({ onClose });
    fireEvent.click(view.getByRole("button", { name: "Cancel" }));
    fireEvent.click(view.getByRole("button", { name: "Cancel loading from a Renovate log" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
