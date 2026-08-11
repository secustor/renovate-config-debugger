/**
 * Roadmap 069 (PR 2): the card end to end, over a real (offline) run — the
 * grouping logic has its own unit tests, so this covers only what those cannot:
 * that the engine's attribution reaches the DOM, that a preset extended twice
 * is called out as redundant instead of repeating itself, that the user's own
 * `packageRules` description surfaces at all (it has no other home in the app),
 * and that a leaf label really selects its node in the resolution tree.
 */
import { runPipeline } from "@renovate-config-debugger/engine";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DescriptionDigestCard } from "./DescriptionDigestCard";

afterEach(cleanup);

// Internal presets resolve with no network, so this whole run is offline.
// `:dependencyDashboard` twice is the redundancy case the card exists to name.
const CONFIG = {
  extends: [":dependencyDashboard", ":dependencyDashboard"],
  description: "My own summary.",
  packageRules: [
    {
      description: "Slow down risky major updates",
      matchUpdateTypes: ["major"],
      minimumReleaseAge: "14 days",
    },
  ],
};

it("renders the descriptions grouped by extend, with the user's rules", async () => {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify(CONFIG),
  });
  const onSelectPreset = vi.fn();
  const view = render(<DescriptionDigestCard result={result} onSelectPreset={onSelectPreset} />);

  // Provenance is loaded through the engine's dynamic import, so nothing is
  // painted on the first commit.
  await waitFor(() => expect(view.queryByText("What this config does")).not.toBeNull());

  // The preset's own sentence, attributed to the node that wrote it. By title,
  // not by name: the group's ProvenanceChip carries the same preset name (and
  // the same button role) one row above, which is the point of both.
  const leaf = view.getByTitle(":dependencyDashboard", { exact: false });
  expect(view.getByText("Enable Renovate Dependency Dashboard creation.")).toBeTruthy();
  // …and the second extend of the same preset, which bought nothing.
  expect(view.getByText("redundant — already included above")).toBeTruthy();

  // The repo's own top-level description and its rule description — the latter
  // reaching a surface for the first time. The rule is cited by its index in
  // the USER's config, which is where the reader can act on it.
  expect(view.getByText("My own summary.")).toBeTruthy();
  expect(view.getByText("Slow down risky major updates")).toBeTruthy();
  expect(view.getByText("packageRules[0] — matchUpdateTypes → minimumReleaseAge")).toBeTruthy();

  // The repo's own sentence is written by the root node, which has no row in
  // the preset tree — so it gets no leaf label offering to jump there.
  expect(view.queryByText("(input config)")).toBeNull();
  expect(view.queryByTitle("(input config)", { exact: false })).toBeNull();

  // The leaf label is the tree jump, exactly like the effective config's chips.
  fireEvent.click(leaf);
  expect(onSelectPreset).toHaveBeenCalledTimes(1);
});

it("renders nothing when the config has no descriptions at all", async () => {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({ automerge: true }),
  });
  const view = render(<DescriptionDigestCard result={result} />);

  await waitFor(() => expect(view.container.querySelector(".desc-digest-card")).toBeNull());
  expect(view.container.textContent).toBe("");
});
