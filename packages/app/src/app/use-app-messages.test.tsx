import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAppMessages } from "./use-app-messages";

/**
 * The notice channel's half of the alternating-space rule (roadmap 086): the
 * `role="status"` region ConfigColumn mounts speaks only when its text
 * changes, and a failed Share copy on Safari is the ordinary outcome — so the
 * same sentence raised twice has to reach the region as two values.
 */
describe("useAppMessages notice", () => {
  it("makes a repeated raise a mutation, so the region announces it again", () => {
    const { result } = renderHook(() => useAppMessages());

    act(() => result.current.setNotice("Couldn’t copy to the clipboard."));
    const first = result.current.notice;
    act(() => result.current.setNotice("Couldn’t copy to the clipboard."));

    expect(first).not.toBeNull();
    expect(result.current.notice).not.toBe(first);
    expect(result.current.notice?.trim()).toBe(first?.trim());
  });

  it("clears without stamping", () => {
    const { result } = renderHook(() => useAppMessages());

    act(() => result.current.setNotice("Loaded owner/repo."));
    act(() => result.current.setNotice(null));

    expect(result.current.notice).toBeNull();
  });
});
