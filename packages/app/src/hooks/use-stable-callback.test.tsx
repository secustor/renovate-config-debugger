import { render } from "@testing-library/react";
import { useEffect } from "react";
import { expect, test } from "vitest";
import { useStableCallback } from "./use-stable-callback";

/** The two halves of the idiom, which only a re-render can show: the handed-out
 *  identity, and the closure the next call actually runs. Published from an
 *  effect — mutating a module binding during render is what
 *  `react/immutability` forbids. */
const seen: { fn: (() => number) | null; identities: Set<() => number> } = {
  fn: null,
  identities: new Set(),
};

function Probe({ value }: { value: number }) {
  const fn = useStableCallback(() => value);
  useEffect(() => {
    seen.fn = fn;
    seen.identities.add(fn);
  });
  return null;
}

test("keeps one identity while calling the current render's closure", () => {
  const { rerender } = render(<Probe value={1} />);
  expect(seen.fn?.()).toBe(1);

  rerender(<Probe value={2} />);
  expect(seen.fn?.()).toBe(2);
  expect(seen.identities.size).toBe(1);
});
