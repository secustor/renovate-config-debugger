import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTabDigits } from "./use-tab-digits";

/**
 * Roadmap 068 review finding 3 — `useTabDigits` used to gate the window
 * listener's INSTALLATION on `enabled` (`useEffect(…, [enabled])`), the exact
 * shape `use-shortcut.ts` moved away from: App can flip this hook's `enabled`
 * (`keysLive && Boolean(result)`) out from under a held digit — pressing `?`
 * while `3` is held flips `keysLive` — and tearing the listener down and
 * rebuilding it for that flip is the anti-pattern the sibling hook was fixed
 * to avoid, even though a held digit has no dangerous browser default to leak
 * into the way `?` does. Fixed by reading `enabled` through a ref and keeping
 * one listener installed for the component's lifetime.
 */

function Harness({ enabled }: { enabled: boolean }) {
  useTabDigits(7, () => undefined, { enabled });
  return null;
}

describe("useTabDigits listener stability", () => {
  it("keeps a single window listener across an `enabled` flip instead of tearing it down mid-hold", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { rerender } = render(<Harness enabled={true} />);
    // Mirrors a digit held while `?` opens the sheet and flips `keysLive`
    // false, then the sheet closing flipping it back true — all while the
    // physical key could still be down.
    rerender(<Harness enabled={false} />);
    rerender(<Harness enabled={true} />);

    const keydownAdds = addSpy.mock.calls.filter((call) => call[0] === "keydown").length;
    const keydownRemoves = removeSpy.mock.calls.filter((call) => call[0] === "keydown").length;

    expect(keydownAdds).toBe(1);
    expect(keydownRemoves).toBe(0);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
