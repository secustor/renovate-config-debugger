import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ShareButton } from "./ShareButton";

/**
 * The receipt is a claim about the clipboard, so it may only appear when
 * `onShare` (`buildShareLinkAndCopy`) resolved. On an insecure-context
 * deployment the clipboard write rejects and the address bar is all the user
 * gets — the popover would be telling them something untrue.
 */

it("draws no receipt when the copy failed", async () => {
  const onShare = vi.fn(() => Promise.reject(new Error("clipboard unavailable")));
  render(<ShareButton onShare={onShare} />);

  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  await waitFor(() => expect(onShare).toHaveBeenCalledTimes(1));

  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
});

it("draws the receipt when the copy succeeded", async () => {
  render(<ShareButton onShare={() => Promise.resolve()} />);

  fireEvent.click(screen.getByRole("button", { name: "Share" }));

  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Link copied"));
  expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
});
