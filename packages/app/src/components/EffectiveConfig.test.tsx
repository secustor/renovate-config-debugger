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

  // The repo's own sentence is written by the ROOT node — the input config,
  // which is not a preset and has no row in the resolution tree. It wears the
  // repo-config chip, so there is no jump to promise and none to break.
  const repoChip = within(ledger).getByText("repo config");
  expect(repoChip.getAttribute("role")).toBeNull();
  expect(within(ledger).queryByText("(input config)")).toBeNull();
  fireEvent.click(repoChip);
  expect(onSelectPreset).not.toHaveBeenCalled();

  // The source chip is the tree jump, exactly like the row's own origin chip.
  fireEvent.click(within(ledger).getByText(":dependencyDashboard"));
  expect(onSelectPreset).toHaveBeenCalledTimes(1);
});

/**
 * Roadmap 069 (PR 3): `description` is `type: array, subType: string` to
 * Renovate — a non-string member is a validation warning, not a refusal, and
 * still merges. The engine's walk only attributes strings, so the ledger would
 * silently omit it; the row has to notice and hand back to the generic chain.
 */
it("keeps the generic rendering when the ledger cannot account for the whole array", async () => {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({ description: ["Keep this.", 42] }),
  });

  const view = render(<EffectiveConfig result={result} />);

  await waitFor(() => expect(view.container.querySelector(".prov-row")).not.toBeNull());
  const head = descriptionRow(view.container);
  // The ledger's "2 entries — …" would be a lie: it has one line for a
  // two-member array.
  expect(head.textContent).toContain("[ 2 items ]");
  expect(head.textContent).not.toContain("entries");

  fireEvent.click(head);
  expect(view.container.querySelector(".desc-ledger")).toBeNull();
  expect(view.container.textContent).toContain("Override chain");
});

/**
 * Roadmap 069 (PR 3): the digest card's "show raw order" link promises the
 * description row. Landing has to CLEAR the filters, not just set the query —
 * a layer filter or "only overridden" left from earlier reading would hide the
 * one row the link exists to show. (`show default-only` is left alone:
 * `description` has no Renovate default, so it is never a default-only row.)
 */
it("clears the other filters when the digest card lands on the description row", async () => {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({
      extends: [":dependencyDashboard"],
      description: "My own summary.",
    }),
  });

  const view = render(<EffectiveConfig result={result} />);
  await waitFor(() => expect(view.container.querySelector(".prov-row")).not.toBeNull());

  // Reading state a user can easily be in: "only what the defaults set", plus
  // "only overridden". Neither can ever show the description row.
  const layerSelect = view.getByLabelText("Filter keys by layer");
  fireEvent.change(layerSelect, { target: { value: "defaults" } });
  const onlyOverridden = view.getByLabelText("only overridden");
  fireEvent.click(onlyOverridden);
  expect(view.container.querySelector(".desc-ledger")).toBeNull();

  view.rerender(<EffectiveConfig result={result} focusDescriptionNonce={1} />);

  await waitFor(() => expect(view.container.querySelector(".desc-ledger")).not.toBeNull());
  expect(descriptionRow(view.container).textContent).toContain("entries");
  expect((layerSelect as HTMLSelectElement).value).toBe("all");
  expect((onlyOverridden as HTMLInputElement).checked).toBe(false);
});
