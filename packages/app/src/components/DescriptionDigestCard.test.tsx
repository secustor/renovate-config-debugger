/**
 * Roadmap 069 (PR 2): the card end to end, over a real (offline) run — the
 * grouping logic has its own unit tests, so this covers only what those cannot:
 * that the engine's attribution reaches the DOM, that a preset extended twice
 * is called out as redundant instead of repeating itself, that the user's own
 * `packageRules` description surfaces at all (it has no other home in the app),
 * that a leaf label really selects its node in the resolution tree, and that a
 * group stays expanded across a re-run.
 */
import type {
  DescriptionAttribution,
  DescriptionProvenance,
} from "@renovate-config-debugger/engine";
import { runPipeline, type TraceResult } from "@renovate-config-debugger/engine";
import type * as DescriptionProvenanceHook from "@/hooks/description-provenance";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DescriptionDigestCard } from "./DescriptionDigestCard";
import { ROOT_NODE_ID } from "./preset-tree-stats";

/**
 * The engine's degraded fallback cannot be provoked from a real config — it
 * fires only where Renovate's own resolved array contradicts the positional
 * replay — and neither can a `description` holding a non-string, without
 * asserting on a validation warning this card knows nothing about. So the hook
 * is WRAPPED rather than replaced: it always runs (the tests below that want
 * the real thing get it), and a registered stub overrides what it returned.
 */
const stub = vi.hoisted(() => ({
  active: false,
  value: undefined as DescriptionProvenance | null | undefined,
}));

vi.mock("@/hooks/description-provenance", async (importOriginal) => {
  const actual = await importOriginal<typeof DescriptionProvenanceHook>();
  return {
    useDescriptionProvenance: (result: TraceResult | null | undefined) => {
      const real = actual.useDescriptionProvenance(result);
      return stub.active ? stub.value : real;
    },
  };
});

/** Renders the card over hand-built provenance, with no run behind it. */
function renderStubbed(provenance: Partial<DescriptionProvenance>) {
  const entries = provenance.entries ?? [];
  const unattributed = provenance.unattributed ?? [];
  stub.active = true;
  stub.value = {
    dropped: [],
    ruleDescriptions: [],
    degraded: false,
    finalLength: entries.length + unattributed.length,
    ...provenance,
    entries,
    unattributed,
  };
  return render(<DescriptionDigestCard result={{} as TraceResult} />);
}

afterEach(() => {
  stub.active = false;
  stub.value = undefined;
  cleanup();
});

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

function run(config: object) {
  return runPipeline({ fileName: "renovate.json", content: JSON.stringify(config) });
}

/** One entry of the engine's `entries`, in the shape the card consumes. */
function entry(index: number, value: string, rest: Partial<DescriptionAttribution>) {
  return { index, value, viaTopLevel: { kind: "repo" }, ...rest } satisfies DescriptionAttribution;
}

it("marks every approximate sentence, including the ones with no leaf to label", async () => {
  // The caveat at the foot of the card promises that untraceable sentences are
  // marked. The `≈` used to live only on the leaf label — so a fallback landing
  // on the ROOT node (no tree row, hence no label) or on a layer with no preset
  // tree at all (global/inherited/defaults) read as confidently attributed,
  // which is the opposite of what the run knows.
  const view = renderStubbed({
    degraded: true,
    entries: [
      entry(0, "From the bot.", { viaTopLevel: { kind: "global" }, approximate: true }),
      entry(1, "My own summary.", {
        node: { nodeId: ROOT_NODE_ID, name: "(input config)" },
        approximate: true,
      }),
      entry(2, "Pin Docker digests.", {
        viaTopLevel: { kind: "preset", nodeId: "p1", name: "config:best-practices" },
        node: { nodeId: "p1", name: "config:best-practices" },
        approximate: true,
      }),
    ],
  });

  await waitFor(() => expect(view.queryByText("What this config does")).not.toBeNull());

  // Two standalone marks — the tree-less layer and the root node — each
  // carrying the same explanation the leaf label's own `≈` carries.
  const marks = view.container.querySelectorAll(".desc-approx-mark");
  expect(marks).toHaveLength(2);
  for (const mark of marks) {
    expect(mark.getAttribute("title")).toContain("could not be determined");
  }
  // …and the entry that DOES have a leaf keeps carrying the mark on the label.
  expect(view.getByText("≈ config:best-practices")).toBeTruthy();
  expect(view.container.querySelector(".desc-approx-caveat")).not.toBeNull();
});

it("names the array members that are not text instead of dropping them", async () => {
  // `{"description": ["Keep this.", 42]}` resolves — Renovate warns and keeps
  // the 42 — so a card titled "What this config does" would otherwise summarize
  // half an array without saying so.
  const view = renderStubbed({
    entries: [entry(0, "Keep this.", { node: { nodeId: ROOT_NODE_ID, name: "(input config)" } })],
    unattributed: [{ index: 1, value: 42 }],
  });

  await waitFor(() => expect(view.queryByText("What this config does")).not.toBeNull());
  expect(
    view.getByText(
      "1 member of the description array is not text, so no preset can be credited with it.",
    ),
  ).toBeTruthy();
});

it("keeps a group expanded across a re-run", async () => {
  // Provenance is loaded asynchronously, so every re-run has a frame with no
  // digest at all. "Show all" therefore cannot live inside the groups — they
  // unmount in that gap, and the expansion a reader made before an edit would
  // be undone by the edit. `config:best-practices` contributes far more than
  // the collapse threshold, which is what makes the button exist.
  const first = await run({ extends: ["config:best-practices"] });
  const view = render(<DescriptionDigestCard result={first} />);

  const showAll = await waitFor(() => view.getByText(/more — show all/));
  fireEvent.click(showAll);
  const expandedRows = view.container.querySelectorAll(".desc-digest-row").length;
  expect(expandedRows).toBeGreaterThan(5);
  expect(view.queryByText(/more — show all/)).toBeNull();

  // A new run of a config whose descriptions are identical — the next keystroke.
  const second = await run({ extends: ["config:best-practices"], automerge: true });
  view.rerender(<DescriptionDigestCard result={second} />);

  // The gap is real — without it this test would prove nothing.
  expect(view.container.querySelector(".desc-digest-card")).toBeNull();
  await waitFor(() => expect(view.container.querySelector(".desc-digest-card")).not.toBeNull());
  expect(view.container.querySelectorAll(".desc-digest-row")).toHaveLength(expandedRows);
  expect(view.queryByText(/more — show all/)).toBeNull();
});
