import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { type ToggleSet, useToggleSet } from "./use-toggle-set";

/**
 * The six copies of this idiom the hook replaced relied on two properties
 * beyond "ids go in and out", and both are load-bearing:
 *
 * - every callback keeps its identity, so a memoized child does not re-render
 *   because its parent did;
 * - an operation that changes nothing returns the SAME set, so React's bail-out
 *   still applies — the preset tree runs `retain` on every new result, and most
 *   results keep every id.
 *
 * `reset` being a plain setState is the third property, and it is asserted by
 * the two components that call it during render rather than here: an effect
 * would flush after the commit and drop a click that landed in the gap.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

/** One button per operation, plus the members as text. Every render appends the
 *  hook's return value, so a test can compare identities across renders. */
function Harness({ log }: { log: ToggleSet<string>[] }) {
  const api = useToggleSet();
  log.push(api);
  return (
    <div>
      <span data-testid="members">{[...api.set].join(",")}</span>
      <button type="button" onClick={() => api.toggle("a")}>
        toggleA
      </button>
      <button type="button" onClick={() => api.add("a")}>
        addA
      </button>
      <button type="button" onClick={() => api.remove("a")}>
        removeA
      </button>
      <button type="button" onClick={() => api.addAll(["b", "c"])}>
        addBC
      </button>
      <button type="button" onClick={() => api.retain((id) => id === "a")}>
        retainA
      </button>
      <button type="button" onClick={() => api.reset()}>
        clear
      </button>
      <button type="button" onClick={() => api.reset(new Set(["b"]))}>
        resetToB
      </button>
    </div>
  );
}

function mount() {
  const log: ToggleSet<string>[] = [];
  const view = render(<Harness log={log} />);
  return {
    log,
    members: () => view.getByTestId("members").textContent,
    /** The set as of the last render — the identity React is holding. */
    set: () => {
      const api = log.at(-1);
      if (!api) {
        throw new Error("the harness has not rendered");
      }
      return api.set;
    },
    press: (name: string) => fireEvent.click(view.getByRole("button", { name })),
  };
}

describe("useToggleSet", () => {
  it("toggles, adds, removes, retains and resets", () => {
    const h = mount();
    expect(h.members()).toBe("");

    h.press("toggleA");
    expect(h.members()).toBe("a");
    h.press("toggleA");
    expect(h.members()).toBe("");

    h.press("addBC");
    expect(h.members()).toBe("b,c");
    h.press("addA");
    expect(h.members()).toBe("b,c,a");

    h.press("retainA");
    expect(h.members()).toBe("a");
    h.press("removeA");
    expect(h.members()).toBe("");

    h.press("resetToB");
    expect(h.members()).toBe("b");
    h.press("clear");
    expect(h.members()).toBe("");
  });

  it("keeps every callback identity stable across renders", () => {
    const h = mount();
    const first = h.log[0];
    h.press("toggleA");
    h.press("addBC");
    const latest = h.log.at(-1);
    if (!first || !latest) {
      throw new Error("the harness has not rendered");
    }
    expect(h.log.length).toBeGreaterThan(1);
    expect(latest.toggle).toBe(first.toggle);
    expect(latest.add).toBe(first.add);
    expect(latest.remove).toBe(first.remove);
    expect(latest.addAll).toBe(first.addAll);
    expect(latest.retain).toBe(first.retain);
    expect(latest.reset).toBe(first.reset);
  });

  it("returns the same set when an operation changes nothing", () => {
    const h = mount();
    h.press("addA");
    expect(h.members()).toBe("a");
    const settled = h.set();

    // Already in, and nothing to drop: the same Set object each time, which is
    // what lets React bail out instead of re-rendering the panel.
    h.press("addA");
    expect(h.set()).toBe(settled);
    h.press("retainA");
    expect(h.set()).toBe(settled);
    h.press("removeA");
    expect(h.members()).toBe("");
  });

  it("empties to one shared identity, so a repeated reset is free", () => {
    const h = mount();
    h.press("addA");
    h.press("clear");
    const empty = h.set();
    h.press("clear");
    expect(h.set()).toBe(empty);
  });
});
