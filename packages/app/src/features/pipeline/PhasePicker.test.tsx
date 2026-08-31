import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhasePicker } from "./PhasePicker";
import { EMPTY_VIEW as EMPTY, repoDep } from "@tools/test/repo-deps";

/**
 * Roadmap 090 — the phase picker: Renovate's four phases, the two this app
 * runs, and the counts behind each door.
 *
 * The claim under test is the honest one: a phase nothing is behind says so
 * (and cannot be selected), and a count appears only once the thing that
 * produces it has reported.
 */

afterEach(cleanup);

function renderPicker(
  over: Partial<Parameters<typeof PhasePicker>[0]> = {},
): ReturnType<typeof render> {
  return render(
    <PhasePicker
      phase="config"
      onSelectPhase={vi.fn()}
      effectiveKeys={62}
      extract={EMPTY}
      {...over}
    />,
  );
}

describe("PhasePicker", () => {
  it("names all four phases in Renovate's order, whether or not they run here", () => {
    const view = renderPicker();
    const names = [...view.container.querySelectorAll(".phase-seg-name")].map(
      (node) => node.textContent,
    );
    expect(names).toEqual(["Config", "Extract", "Lookup", "Update"]);
  });

  it("disables the two phases nothing is behind and says why", () => {
    const view = renderPicker();
    for (const label of ["Lookup", "Update"]) {
      const segment = view.getByRole("radio", { name: `${label}, not available yet` });
      expect((segment as HTMLButtonElement).disabled).toBe(true);
      expect(segment.getAttribute("title")).toBe("Not available today");
    }
  });

  it("counts the effective config's options under Config", () => {
    const view = renderPicker();
    expect(view.getByRole("radio", { name: "Config, 62 options" })).toBeTruthy();
    // …and says nothing at all while the count is still being computed.
    cleanup();
    const pending = renderPicker({ effectiveKeys: null });
    expect(pending.getByRole("radio", { name: "Config" })).toBeTruthy();
  });

  it("counts the extracted deps only once discovery has reported", () => {
    const loading = renderPicker({ extract: { ...EMPTY, status: "loading", repo: "acme/webapp" } });
    expect(loading.getByRole("radio", { name: "Extract, reading…" })).toBeTruthy();
    cleanup();

    const ready = renderPicker({
      extract: {
        ...EMPTY,
        status: "ready",
        repo: "acme/webapp",
        deps: [
          repoDep("react", "package.json", "npm", {
            value: "17.0.0",
            meta: "package.json · 17.0.0",
          }),
        ],
      },
    });
    const segment = ready.getByRole("radio", { name: "Extract, +1 deps" });
    expect(segment.querySelector(".phase-seg-note.ok")).toBeTruthy();
  });

  it("reports the phase the reader picked", () => {
    const onSelectPhase = vi.fn();
    const view = renderPicker({ onSelectPhase });

    fireEvent.click(view.getByRole("radio", { name: "Extract" }));
    expect(onSelectPhase).toHaveBeenCalledWith("extract");
  });
});
