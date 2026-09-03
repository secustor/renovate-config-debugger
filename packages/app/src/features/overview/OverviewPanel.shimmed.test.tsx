/**
 * Roadmap 083: the Overview tab end to end, over a real (offline) run.
 *
 * The classifier and the row model have their own unit tests, so this covers
 * only what those cannot: that the design's copy reaches the DOM word for word,
 * that EVERY row names its source (the blue `repo config` pill for the reader's
 * own sentences, the standard preset token for a preset's), that the card's one
 * toggle reveals and re-hides the unmatched tail, that the count it prints is
 * the count it reports for the tab badge, and that the reveal survives the
 * frame a re-run has no provenance in.
 */
import type {
  DescriptionAttribution,
  DescriptionProvenance,
} from "@renovate-config-debugger/engine";
import { runPipeline, type TraceResult } from "@renovate-config-debugger/engine";
import type * as DescriptionProvenanceHook from "@/hooks/description-provenance";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OverviewPanel } from "./OverviewPanel";
import { ROOT_NODE_ID } from "@/lib/preset-tree-stats";
import { descriptionProvenance } from "@tools/test/description-provenance";

/**
 * The engine's degraded fallback cannot be provoked from a real config — it
 * fires only where Renovate's own resolved array contradicts the positional
 * replay — and neither can a `description` holding a non-string, without
 * asserting on a validation warning this panel knows nothing about. So the hook
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

/** Renders the panel over hand-built provenance, with no run behind it. */
function renderStubbed(provenance: Partial<DescriptionProvenance>) {
  stub.active = true;
  stub.value = descriptionProvenance(provenance);
  return render(<OverviewPanel result={{} as TraceResult} />);
}

afterEach(() => {
  stub.active = false;
  stub.value = undefined;
});

function run(config: object) {
  return runPipeline({ fileName: "renovate.json", content: JSON.stringify(config) });
}

/**
 * Internal presets resolve with no network, so this whole run is offline. It is
 * chosen to land one sentence in each of three topics:
 *
 * - `:dependencyDashboard`'s own sentence → `Pull requests & noise`, attributed
 *   to the preset, so its row wears the purple token.
 * - the repo's own top-level `description` → `Grouping`, so its row wears the
 *   blue `repo config` chip.
 * - the repo's `packageRules` description → no keyword at all, so it is the
 *   `Everything else` tail the toggle is about.
 */
const CONFIG = {
  extends: [":dependencyDashboard"],
  description: "Group all npm minor updates into one PR.",
  packageRules: [
    {
      description: "Slow down risky major updates",
      matchUpdateTypes: ["major"],
      minimumReleaseAge: "14 days",
    },
  ],
};

it("renders the design's copy, with a source chip on every row", async () => {
  const result = await run(CONFIG);
  const onSelectPreset = vi.fn();
  const onStats = vi.fn();
  const view = render(
    <OverviewPanel result={result} onSelectPreset={onSelectPreset} onStats={onStats} />,
  );

  // Provenance is loaded through the engine's dynamic import, so nothing is
  // painted on the first commit. The card has no title — the tab strip names
  // it and the tab badge (onStats, below) carries the count — so its first
  // words are the intro line.
  await waitFor(() =>
    expect(
      view.queryByText(
        "Every preset carries a sentence describing what it does. Here they are, sorted by topic instead of by preset.",
      ),
    ).not.toBeNull(),
  );
  // …and the closing line, which is the card explaining its own source.
  const footer = view.container.querySelector(".overview-footer");
  expect(footer?.textContent).toBe(
    "Every sentence here is pulled from a description field. Add one to your own packageRules or presets and it will show up here.",
  );

  // The topics the classifier produced, in the design's order. `Everything
  // else` is behind the toggle, so it is not one of them yet.
  const titles = [...view.container.querySelectorAll(".overview-topic-title")].map(
    (el) => el.textContent,
  );
  expect(titles).toEqual(["Pull requests & noise", "Grouping"]);

  // EVERY row names its source — the design draws no bare rows.
  const rows = [...view.container.querySelectorAll<HTMLElement>(".overview-row")];
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(row.querySelector(".overview-source")).not.toBeNull();
  }

  // The preset's sentence wears the standard token, clickable through to the
  // node in the resolution tree (081) — the artboard draws the chip inert, but
  // an inert name is a name the reader cannot follow.
  const token = view.container.querySelector<HTMLElement>(".overview-source button.preset-token");
  expect(token?.textContent).toBe(":dependencyDashboard");
  fireEvent.click(token as HTMLElement);
  expect(onSelectPreset).toHaveBeenCalledTimes(1);

  // The reader's own sentence wears the blue `repo config` layer chip, which is
  // the app's standard one — so it keeps the glossary card explaining what
  // "repo config" means in Renovate's merge order.
  const repoChip = view.container.querySelector(".overview-source .badge.prov-repo");
  expect(repoChip?.textContent).toBe("repo config");
  expect(repoChip?.className).toContain("explained");

  // The badge quotes the number the card printed, not a second derivation.
  // AWAITED, unlike the click assertions above: those run inside `fireEvent`,
  // which flushes, while this one is reported from an effect. vitest runs
  // without `globals`, so Testing Library's auto-setup never runs and React's
  // act environment is off (the setup file registers cleanup only) — `waitFor`
  // resolving on the paint above therefore does NOT guarantee that commit's
  // passive effects have run. Locally they always had; on a loaded CI runner
  // they had not, and the spy was still empty (CI run 32901774216).
  await waitFor(() => expect(onStats).toHaveBeenLastCalledWith(3));
});

it("hides the unmatched tail behind one toggle, and gives it back", async () => {
  const result = await run(CONFIG);
  const view = render(<OverviewPanel result={result} />);

  const toggle = await waitFor(() => view.getByText("1 more in “Everything else” — show all"));
  // No per-topic "show all": the design has exactly one disclosure on this card.
  expect(view.container.querySelectorAll("button.overview-more")).toHaveLength(1);
  expect(view.queryByText("Slow down risky major updates")).toBeNull();

  fireEvent.click(toggle);
  expect(view.getByText("Everything else")).toBeTruthy();
  expect(view.getByText("Slow down risky major updates")).toBeTruthy();
  // The rule's own provenance survives as the row's tooltip — the design gives
  // a row three slots and no fourth.
  const ruleRow = view.getByText("Slow down risky major updates").closest(".overview-row");
  expect(ruleRow?.getAttribute("title")).toBe(
    "packageRules[0] — matchUpdateTypes → minimumReleaseAge",
  );

  fireEvent.click(view.getByText("show less"));
  expect(view.queryByText("Slow down risky major updates")).toBeNull();
});

it("keeps the tail open across a re-run", async () => {
  // Provenance is loaded asynchronously, so every re-run has a frame with no
  // digest at all. The reveal therefore cannot live inside the group that
  // renders it — the group unmounts in that gap, and the reveal a reader made
  // before an edit would be undone by the edit.
  const first = await run(CONFIG);
  const view = render(<OverviewPanel result={first} />);

  fireEvent.click(await waitFor(() => view.getByText(/more in “Everything else”/)));
  expect(view.getByText("Slow down risky major updates")).toBeTruthy();

  const second = await run({ ...CONFIG, automerge: true });
  view.rerender(<OverviewPanel result={second} />);

  // The gap is real — without it this test would prove nothing.
  expect(view.container.querySelector(".overview-card")).toBeNull();
  await waitFor(() => expect(view.container.querySelector(".overview-card")).not.toBeNull());
  expect(view.getByText("Slow down risky major updates")).toBeTruthy();
  expect(view.getByText("show less")).toBeTruthy();
});

it("says so honestly when a run carries no descriptions at all", async () => {
  const result = await run({ automerge: true });
  const view = render(<OverviewPanel result={result} />);

  // A bare header over nothing would promise a summary the run cannot give;
  // rendering nothing at all would leave the tab looking broken.
  await waitFor(() => expect(view.container.querySelector(".empty-note")).not.toBeNull());
  expect(view.container.querySelector(".overview-card")).toBeNull();
  expect(view.container.textContent).toContain("No descriptions");
});

it("says a run with no preset resolution is unavailable, and reports no count", async () => {
  // `null` is "unavailable", not "empty": claiming the config carries no
  // descriptions would be a false statement about it, and the `0` behind it
  // would be the wrong zero the tab badge must never print.
  stub.active = true;
  stub.value = null;
  const onStats = vi.fn();
  const view = render(<OverviewPanel result={{} as TraceResult} onStats={onStats} />);

  await waitFor(() => expect(view.container.querySelector(".empty-note")).not.toBeNull());
  expect(view.container.textContent).toContain(
    "Description attribution is unavailable because preset resolution did not complete.",
  );
  expect(view.container.textContent).not.toContain("No descriptions");
  expect(onStats).not.toHaveBeenCalled();
});

it("offers the raw order only when there is a description row to land on", async () => {
  const onShowRawOrder = vi.fn();
  const withArray = await run(CONFIG);
  const view = render(<OverviewPanel result={withArray} onShowRawOrder={onShowRawOrder} />);

  await waitFor(() => expect(view.queryByText("show raw order")).not.toBeNull());
  fireEvent.click(view.getByText("show raw order"));
  expect(onShowRawOrder).toHaveBeenCalledTimes(1);

  // Rules-only: the card still has something to say (the user's own rule prose
  // has no other home), but Renovate never hoists it into `description`, so the
  // link would filter the Effective config down to a key that is not there.
  cleanup();
  const rulesOnly = await run({
    // A rule sentence that lands in a topic the card shows unfolded, so this
    // test asserts on the link and not on the tail toggle.
    packageRules: [
      { description: "Automerge patch updates", matchUpdateTypes: ["patch"], automerge: true },
    ],
  });
  const second = render(<OverviewPanel result={rulesOnly} onShowRawOrder={onShowRawOrder} />);
  await waitFor(() => expect(second.getByText("Automerge patch updates")).toBeTruthy());
  expect(second.queryByText("show raw order")).toBeNull();
  expect(onShowRawOrder).toHaveBeenCalledTimes(1);
});

/** One entry of the engine's `entries`, in the shape the panel consumes. */
function entry(index: number, value: string, rest: Partial<DescriptionAttribution>) {
  return { index, value, viaTopLevel: { kind: "repo" }, ...rest } satisfies DescriptionAttribution;
}

it("keeps 069's honest extras that the artboard does not draw", async () => {
  // The caveat at the foot promises that untraceable sentences are marked, and
  // a summary that silently omits a member of the array it is summarizing is
  // the thing the aside exists to prevent. Neither is optional just because the
  // design did not draw them.
  const view = renderStubbed({
    degraded: true,
    entries: [
      // All three land in a topic the card shows unfolded — the tail is the
      // toggle's test, not this one's.
      entry(0, "Schedule updates on weekends.", {
        viaTopLevel: { kind: "global" },
        approximate: true,
      }),
      entry(1, "Group all npm minor updates into one PR.", {
        node: { nodeId: ROOT_NODE_ID, name: "(input config)" },
        approximate: true,
      }),
      entry(2, "Pin Docker digests.", {
        viaTopLevel: { kind: "preset", nodeId: "p1", name: "config:best-practices" },
        node: { nodeId: "p1", name: "config:best-practices" },
        approximate: true,
      }),
    ],
    unattributed: [{ index: 3, value: 42 }],
  });

  await waitFor(() => expect(view.container.querySelector(".overview-card")).not.toBeNull());

  // Every approximate row carries the mark — including the two with no preset
  // token to sit beside (the tree-less `global` layer, and the root node, whose
  // chip is `repo config`).
  const marks = view.container.querySelectorAll(".desc-approx-mark");
  expect(marks).toHaveLength(3);
  expect(view.container.querySelector(".desc-approx-caveat")).not.toBeNull();
  expect(
    view.getByText(
      "1 member of the description array is not text, so no preset can be credited with it.",
    ),
  ).toBeTruthy();

  // The tree-less layers keep their own hues — the artboard's two colours have
  // no slot for a global or inherited config, and inventing one would say the
  // bot's sentence came from this repo.
  expect(view.container.querySelector(".overview-row .prov-dot.prov-global")).not.toBeNull();
  expect(view.container.querySelector(".overview-source .badge.prov-global")).not.toBeNull();
});
