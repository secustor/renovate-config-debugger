import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useSyncedReset } from "./use-synced-reset";

/** A nonce consumer whose owner starts at 0 rather than at the current value —
 *  `AddTestBox`'s quick-start chip shape. */
function Seeded({ nonce, onSeed }: { nonce: number; onSeed: () => void }) {
  useSyncedReset(nonce, onSeed, () => 0);
  return <span>seeded</span>;
}

/** A view holding state derived from `owner`, reset when `owner` changes. */
function Derived({ owner, onReset }: { owner: string; onReset?: () => void }) {
  const [picked, setPicked] = useState("none");
  useSyncedReset(owner, () => {
    setPicked("none");
    onReset?.();
  });
  return (
    <div>
      <span data-testid="picked">{picked}</span>
      <button type="button" onClick={() => setPicked("row-1")}>
        pick
      </button>
    </div>
  );
}

describe("useSyncedReset", () => {
  it("leaves state alone while the identity holds", () => {
    const { rerender } = render(<Derived owner="a" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("picked").textContent).toBe("row-1");
    // Same owner, new render: nothing is thrown away.
    rerender(<Derived owner="a" />);
    expect(screen.getByTestId("picked").textContent).toBe("row-1");
  });

  it("resets when the identity changes", () => {
    const { rerender } = render(<Derived owner="a" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("picked").textContent).toBe("row-1");
    rerender(<Derived owner="b" />);
    expect(screen.getByTestId("picked").textContent).toBe("none");
  });

  it("does not fire on the first render", () => {
    // The owner starts AT the value, so mounting is not a change. A hook that
    // fired here would wipe state the component was constructed with.
    const onReset = vi.fn();
    render(<Derived owner="a" onReset={onReset} />);
    expect(onReset).not.toHaveBeenCalled();
  });

  it("fires once per change, not once per render", () => {
    const onReset = vi.fn();
    const { rerender } = render(<Derived owner="a" onReset={onReset} />);
    rerender(<Derived owner="b" onReset={onReset} />);
    expect(onReset).toHaveBeenCalledTimes(1);
    rerender(<Derived owner="b" onReset={onReset} />);
    rerender(<Derived owner="b" onReset={onReset} />);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("resets BEFORE the paint, so no frame shows the stale state", () => {
    // This is the whole reason the idiom is during-render rather than an
    // effect. `render`/`rerender` are act-wrapped, so if the reset were
    // deferred to an effect this assertion would still pass — what it really
    // pins is that no intermediate DOM state is observable, which we check by
    // asserting the very first committed text after the change.
    const seen: string[] = [];
    function Probe({ owner }: { owner: string }) {
      const [picked, setPicked] = useState("row-1");
      useSyncedReset(owner, () => setPicked("none"));
      seen.push(picked);
      return <span data-testid="picked">{picked}</span>;
    }
    const { rerender } = render(<Probe owner="a" />);
    seen.length = 0;
    rerender(<Probe owner="b" />);
    // React re-runs the component immediately with the new state; the render
    // that observed the change never reaches the DOM with the old value.
    expect(seen.at(-1)).toBe("none");
    expect(screen.getByTestId("picked").textContent).toBe("none");
  });

  describe("the initial-owner thunk", () => {
    it("fires on the first render when the value is already past the start", () => {
      // `AddTestBox`'s quick-start chip: clicked BEFORE the box mounted, so the
      // nonce is already non-zero and that seed must still be applied.
      const onSeed = vi.fn();
      render(<Seeded nonce={3} onSeed={onSeed} />);
      expect(onSeed).toHaveBeenCalledTimes(1);
    });

    it("stays quiet when the value is still at the start", () => {
      const onSeed = vi.fn();
      render(<Seeded nonce={0} onSeed={onSeed} />);
      expect(onSeed).not.toHaveBeenCalled();
    });

    it("distinguishes an undefined start from no start given", () => {
      // `EffectiveConfig`'s nonce owner starts at undefined ON PURPOSE, which
      // an optional plain value could not express.
      const onLand = vi.fn();
      function Landing({ nonce }: { nonce: number | undefined }) {
        useSyncedReset(nonce, onLand, () => undefined);
        return <span>landing</span>;
      }
      render(<Landing nonce={7} />);
      expect(onLand).toHaveBeenCalledTimes(1);
    });
  });

  it("compares with Object.is, so NaN does not reset forever", () => {
    const onReset = vi.fn();
    function NanOwner({ owner }: { owner: number }) {
      useSyncedReset(owner, onReset);
      return <span>n</span>;
    }
    const { rerender } = render(<NanOwner owner={Number.NaN} />);
    rerender(<NanOwner owner={Number.NaN} />);
    rerender(<NanOwner owner={Number.NaN} />);
    // `!==` would be true for every one of these and loop the reset forever.
    expect(onReset).not.toHaveBeenCalled();
  });
});
