/**
 * Replay-02 N3: the stats effect used to call `onStats` while provenance was
 * still loading, reporting an honest-looking `{keys: 0}` that overwrote App's
 * pending `null` — the Overview painted "✓ accepted … merged into 0 effective
 * options" next to the tab badge's 0 on first paint, self-correcting only
 * once provenance resolved. The contract this locks: silence until real
 * numbers exist, and the first report already carries them.
 */
import { runPipeline } from "@renovate-config-debugger/engine";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EffectiveConfig } from "./EffectiveConfig";

afterEach(cleanup);

/** The `description` row's head button, whatever else the run produced. */
function descriptionRow(container: HTMLElement): HTMLElement {
  const rows = [...container.querySelectorAll<HTMLElement>(".prov-row-head")];
  const row = rows.find((head) =>
    head.querySelector(".prov-key-name")?.textContent?.includes("description"),
  );
  if (!row) {
    throw new Error(
      `no description row among: ${rows.map((head) => head.querySelector(".prov-key-name")?.textContent).join(", ")}`,
    );
  }
  return row;
}

it("reports stats only once provenance has resolved, never a loading-time zero", async () => {
  // No `extends`, so the run resolves offline; several non-default options so
  // the real report has something to count.
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({
      automerge: true,
      labels: ["dependencies"],
      rangeStrategy: "bump",
    }),
  });

  const onStats = vi.fn();
  render(<EffectiveConfig result={result} onStats={onStats} />);

  // Mount-time effects run with provenance still loading — the old code
  // reported {keys: 0} right here.
  expect(onStats).not.toHaveBeenCalled();

  await waitFor(() => expect(onStats).toHaveBeenCalled());
  const first = onStats.mock.calls[0]?.[0] as { keys: number } | undefined;
  expect(first?.keys).toBeGreaterThan(0);
});

/**
 * Roadmap 069 (PR 3): the `description` row stops being an anonymous string
 * array. The grouping and the wording have their own unit tests
 * (lib/description-ledger.test.ts); this covers what those cannot — that the
 * engine's per-string attribution reaches the DOM through the row's own
 * expansion, that a re-extended preset's repeated sentence is called out
 * instead of silently listed twice, and that a source chip really selects its
 * node in the resolution tree.
 */
it("expands the description row into a per-string blame ledger", async () => {
  // Internal presets resolve with no network. `:dependencyDashboard` twice is
  // the duplicate case: Renovate concatenates its sentence a second time.
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({
      extends: [":dependencyDashboard", ":dependencyDashboard"],
      description: "My own summary.",
    }),
  });

  const onSelectPreset = vi.fn();
  const view = render(<EffectiveConfig result={result} onSelectPreset={onSelectPreset} />);

  // The collapsed row already says what the array holds — the generic preview
  // would have said `[ 3 items ]`.
  await waitFor(() => expect(descriptionRow(view.container).textContent).toContain("3 entries"));
  // …and how many presets had a hand in it, which no layer chip can express —
  // one, since both extends entries resolve the same preset.
  expect(descriptionRow(view.container).textContent).toContain("1 preset");

  fireEvent.click(descriptionRow(view.container));
  const ledger = view.container.querySelector<HTMLElement>(".desc-ledger");
  if (!ledger) {
    throw new Error("the expanded description row rendered no ledger");
  }

  // Every string, in the final array's order, with the preset that wrote it.
  const rows = [...ledger.querySelectorAll(".desc-ledger-row")];
  expect(rows).toHaveLength(3);
  expect(rows.map((row) => row.querySelector(".desc-ledger-idx")?.textContent)).toEqual([
    "1",
    "2",
    "3",
  ]);
  // …and the second extend's copy struck through, pointing at the first.
  expect(within(ledger).getByText("duplicate of #1")).toBeTruthy();
  expect(rows[1]?.className).toContain("duplicate");

  // The chain rendering belongs to every OTHER key now.
  expect(view.container.textContent).not.toContain("Override chain");

  // The source chip is the tree jump, exactly like the row's own origin chip.
  fireEvent.click(within(ledger).getByText(":dependencyDashboard"));
  expect(onSelectPreset).toHaveBeenCalledTimes(1);
});
