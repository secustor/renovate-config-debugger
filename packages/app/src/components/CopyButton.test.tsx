import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./CopyButton";

/**
 * Roadmap 036 — the shared copy affordance. Three behaviors the four
 * implementations it replaced each got slightly differently: the payload is
 * built LAZILY (not on every render of a long results list), the copied state
 * flips the label and reverts on its own, and a clipboard that is unavailable
 * (insecure context) fails QUIETLY rather than throwing into the console.
 */

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

// vitest runs without `globals`, so RTL's automatic per-test cleanup never
// registers itself — without this the previous test's buttons stay mounted.
afterEach(cleanup);

describe("CopyButton", () => {
  it("copies lazily, flips to Copied, and reverts after 1.5s", async () => {
    const writes: string[] = [];
    stubClipboard(async (text) => {
      writes.push(text);
    });
    const getText = vi.fn(() => "payload");

    const view = render(<CopyButton getText={getText} label="Copy result" />);
    // Rendering must not serialize anything — that is the whole point of
    // handing in a getter rather than a string.
    expect(getText).not.toHaveBeenCalled();

    const button = view.getByRole("button", { name: "Copy result" });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(writes).toEqual(["payload"]);
    await waitFor(() => {
      expect(view.getByRole("button", { name: "Copied" })).toBeTruthy();
    });
    expect(button.className).toContain("copied");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1600));
    });
    expect(view.getByRole("button", { name: "Copy result" })).toBeTruthy();
  });

  it("stays quiet when the clipboard is unavailable (insecure context)", async () => {
    stubClipboard(() => Promise.reject(new Error("Document is not focused")));
    const view = render(<CopyButton getText={() => "payload"} label="Copy link" />);

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Copy link" }));
    });

    // No throw, and no false success: the label never claims it copied.
    expect(view.getByRole("button", { name: "Copy link" })).toBeTruthy();
  });

  it("runs an `onCopy` action instead of writing text (the share link case)", async () => {
    stubClipboard(() => Promise.reject(new Error("clipboard must not be used here")));
    const onCopy = vi.fn(() => Promise.resolve());
    const view = render(<CopyButton onCopy={onCopy} label="Copy link" />);

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Copy link" }));
    });

    expect(onCopy).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(view.getByRole("button", { name: "Copied" })).toBeTruthy();
    });
  });

  it("swallows the click inside a <summary> so <details> does not toggle", async () => {
    stubClipboard(() => Promise.resolve());
    const view = render(
      <details>
        <summary>
          Fetched content
          <CopyButton inSummary getText={() => "x"} label="Copy as markdown" />
        </summary>
        <p>body</p>
      </details>,
    );

    const details = view.container.querySelector("details");
    if (!details) {
      throw new Error("expected the rendered output to contain a <details> element");
    }
    expect(details.open).toBe(false);
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Copy as markdown" }));
    });
    expect(details.open).toBe(false);
  });
});
