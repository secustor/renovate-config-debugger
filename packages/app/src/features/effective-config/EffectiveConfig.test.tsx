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
 * (description-ledger.test.ts); this covers what those cannot — that the
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
  await waitFor(() => expect(descriptionRow(view.container).textContent).toContain("3 strings"));
  // …and how many presets had a hand in it, which no layer chip can express —
  // one, since both extends entries resolve the same preset. Roadmap 082 says
  // it in the design's prose rather than as a bare count chip.
  expect(descriptionRow(view.container).textContent).toContain("1 preset wrote these");

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

  // Roadmap 082 (GAP-17): the row shows BOTH — who wrote each sentence, and how
  // the array was assembled. They answer different questions, and gating them
  // against each other hid the second one on the row that needs both.
  expect(view.container.textContent).toContain("The cascade, bottom to top");

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
 * still merges, holding a real index in the final array. The engine reports it
 * (`unattributed`) and the ledger gives it a line of its own, so the row keeps
 * the blame rendering instead of falling back: what it must never do is print
 * a ledger one member shorter than the array it claims to be.
 */
it("gives a non-string member of the description array its own ledger line", async () => {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({ description: ["Keep this.", 42] }),
  });

  const view = render(<EffectiveConfig result={result} />);

  await waitFor(() => expect(view.container.querySelector(".prov-row")).not.toBeNull());
  const head = descriptionRow(view.container);
  // Counted apart rather than summed: "2 entries" would credit prose the array
  // does not contain, and the generic preview said only `[ 2 items ]`.
  await waitFor(() =>
    expect(descriptionRow(view.container).textContent).toContain("1 sentence + 1 other member"),
  );
  expect(head.textContent).not.toContain("[ 2 items ]");

  fireEvent.click(descriptionRow(view.container));
  const ledger = view.container.querySelector<HTMLElement>(".desc-ledger");
  if (!ledger) {
    throw new Error("the expanded description row rendered no ledger");
  }
  const rows = [...ledger.querySelectorAll<HTMLElement>(".desc-ledger-row")];
  expect(rows).toHaveLength(2);
  expect(rows[1]?.className).toContain("unattributed");
  expect(rows[1]?.textContent).toContain("42");
  expect(rows[1]?.textContent).toContain("no preset can be credited");
});

/**
 * …and the guard behind that is still a guard: a ledger that cannot reproduce
 * the row's final value hands back to the generic chain. Provoked here through
 * the row a run cannot produce on demand — `packageRules`, whose value is an
 * array of objects and which has no ledger at all — so the assertion is that
 * the blame rendering is confined to `description`.
 *
 * Roadmap 082 rides along on the same expansion: the cascade heading, the
 * winner-first order with every losing value struck through, and the deferred
 * per-rule table.
 */
it("keeps the chain on every other key, winner first", async () => {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({
      extends: [":dependencyDashboard"],
      description: "My own summary.",
      packageRules: [{ matchManagers: ["npm"], automerge: true }],
    }),
  });

  const view = render(<EffectiveConfig result={result} />);
  await waitFor(() => expect(view.container.querySelector(".prov-row")).not.toBeNull());

  const rows = [...view.container.querySelectorAll<HTMLElement>(".prov-row-head")];
  const rules = rows.find((head) =>
    head.querySelector(".prov-key-name")?.textContent?.includes("packageRules"),
  );
  if (!rules) {
    throw new Error("no packageRules row");
  }
  fireEvent.click(rules);
  expect(view.container.textContent).toContain("The cascade, bottom to top");
  expect(view.container.textContent).not.toContain("Override chain");
  expect(view.container.querySelector(".desc-ledger")).toBeNull();
  // GAP-14: the winner card carries the value — the row no longer opens with a
  // "Final value" block printing it a second time.
  expect(view.container.textContent).not.toContain("Final value");

  // GAP-11: the ✓ final card LEADS the stack.
  const steps = [...view.container.querySelectorAll<HTMLElement>(".prov-step")];
  expect(steps.length).toBeGreaterThan(1);
  expect(steps[0]?.className).toContain("winning");
  expect(steps.at(-1)?.className).not.toContain("winning");
  // GAP-12: every losing value is struck through, whatever its verb.
  for (const losing of steps.slice(1)) {
    expect(losing.querySelector(".prov-value")?.className).toContain("prov-losing");
  }
  expect(steps[0]?.querySelector(".prov-value")?.className).not.toContain("prov-losing");

  // GAP-13: the per-rule table waits for a click of its own.
  expect(view.container.querySelector(".prov-rules-list")).toBeNull();
  fireEvent.click(view.getByRole("button", { name: /rule.* with their source preset/ }));
  expect(view.container.querySelector(".prov-rules-list")).not.toBeNull();
});

/**
 * Roadmap 069 (PR 3): the digest card's "show raw order" link promises the
 * description row. Landing has to CLEAR the filters, not just set the query —
 * "only overridden" left from earlier reading would hide the one row the link
 * exists to show.
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

  // Reading state a user can easily be in, and one that can never show this row.
  const onlyOverridden = view.getByLabelText("only overridden");
  fireEvent.click(onlyOverridden);
  expect(view.container.querySelector(".desc-ledger")).toBeNull();

  view.rerender(<EffectiveConfig result={result} focusDescriptionNonce={1} />);

  await waitFor(() => expect(view.container.querySelector(".desc-ledger")).not.toBeNull());
  expect(descriptionRow(view.container).textContent).toContain("strings");
  expect((onlyOverridden as HTMLInputElement).checked).toBe(false);
});

/**
 * Roadmap 075 (iteration 5): the rows are cut by WHO DECIDED each key's final
 * value. The rule itself is unit tested (decider-groups.test.ts) against
 * hand-built chains; what this covers is the wiring against a REAL run — that
 * a key the repo config wrote, a key a preset wrote and a key only Renovate's
 * defaults set each land in their own section, that the defaults section is
 * folded shut until asked for, and that the filter narrows a section while its
 * header keeps reporting the group's honest size.
 */
function sectionOf(container: HTMLElement, id: string): HTMLElement {
  const section = container.querySelector<HTMLElement>(`.prov-section-${id}`);
  if (!section) {
    throw new Error(
      `no ${id} section among: ${[...container.querySelectorAll(".prov-section")]
        .map((s) => s.className)
        .join(", ")}`,
    );
  }
  return section;
}

function keysIn(section: HTMLElement): string[] {
  return [...section.querySelectorAll(".prov-row-head .prov-key-name")].map((el) =>
    (el.textContent ?? "").replace(/[▾▸]/g, "").trim(),
  );
}

/** The rows of a band, including the defaults band's inert ones. */
function defaultKeysIn(section: HTMLElement): string[] {
  return [...section.querySelectorAll(".prov-row-default .prov-key-name")].map((el) =>
    (el.textContent ?? "").trim(),
  );
}

it("groups the rows by the layer that decided each key", async () => {
  // `:dependencyDashboard` is an internal preset (no network) that sets
  // `dependencyDashboard`; `labels` is the repo's own; `rangeStrategy` has a
  // Renovate default nothing here touches.
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({
      extends: [":dependencyDashboard"],
      labels: ["dependencies"],
    }),
  });

  const view = render(<EffectiveConfig result={result} />);
  await waitFor(() => expect(view.container.querySelector(".prov-row")).not.toBeNull());

  expect(keysIn(sectionOf(view.container, "repo"))).toContain("labels");
  expect(keysIn(sectionOf(view.container, "preset"))).toContain("dependencyDashboard");
  // Each key is in exactly one section — the sections partition the rows.
  expect(keysIn(sectionOf(view.container, "preset"))).not.toContain("labels");
  // Roadmap 082 (GAP-3): the presets band is named after the reader's extends.
  expect(sectionOf(view.container, "preset").textContent).toContain(":dependencyDashboard decided");

  // Roadmap 082 (GAP-4): the defaults band is ALWAYS here — folded shut, not
  // filtered away behind a checkbox that had to be found first.
  const defaults = sectionOf(view.container, "defaults");
  expect(defaults.getAttribute("open")).toBeNull();
  expect(defaults.textContent).toContain("nothing in your run touched them");
  expect(view.queryByLabelText(/show default-only/)).toBeNull();

  fireEvent.click(view.getByText(/Renovate defaults filled the remaining/));
  await waitFor(() => expect(sectionOf(view.container, "defaults").getAttribute("open")).toBe(""));
  const opened = sectionOf(view.container, "defaults");
  // GAP-6: the rows are inert — no caret, no button, no cascade to open.
  expect(opened.querySelector(".prov-row-head")).toBeNull();
  // GAP-5/GAP-7: the band stops at the cap and says so, under the one honest
  // note that covers every row above it.
  expect(opened.querySelectorAll(".prov-row-default")).toHaveLength(8);
  expect(opened.textContent).toContain("more defaults — show all");
  expect(opened.textContent).toContain("only the default ever touched these");

  fireEvent.click(view.getByRole("button", { name: /more defaults — show all/ }));
  const shown = sectionOf(view.container, "defaults");
  expect(shown.querySelectorAll(".prov-row-default").length).toBeGreaterThan(8);
  expect(defaultKeysIn(shown)).toContain("rangeStrategy");
});

it("heads each band with the rows it is showing", async () => {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({ labels: ["dependencies"], automerge: true, rebaseWhen: "auto" }),
  });

  const view = render(<EffectiveConfig result={result} />);
  await waitFor(() => expect(view.container.querySelector(".prov-row")).not.toBeNull());

  const repo = sectionOf(view.container, "repo");
  const total = keysIn(repo).length;
  expect(total).toBeGreaterThan(1);
  expect(repo.textContent).toContain(`Your repo config decided ${total} options`);

  // Roadmap 082 (GAP-20): the "N of M shown" pill is gone with the layer
  // filters — a narrowed band simply reports what it is showing, which is the
  // only number the reader can check.
  fireEvent.change(view.getByPlaceholderText("Filter keys…"), { target: { value: "labels" } });
  await waitFor(() => expect(keysIn(sectionOf(view.container, "repo"))).toEqual(["labels"]));
  expect(sectionOf(view.container, "repo").textContent).toContain(
    "Your repo config decided 1 option",
  );
  expect(view.container.querySelector(".prov-section-shown")).toBeNull();
});

/**
 * Roadmap 069 (PR 5): the same attribution at the point of contact — the
 * As-JSON document's `description` strings. The model and its wording are unit
 * tested (lib/description-attribution.test.ts); what this covers is the wiring
 * plus the one thing no unit test can: that the POSITIONAL GUARD is really what
 * decides, so the keep-internal document (whose array is not the attributed
 * one) stays plain while the fully expanded one gains the cards.
 */
it("attributes the description strings of the As-JSON document", async () => {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({
      extends: [":dependencyDashboard"],
      description: "My own summary.",
    }),
  });

  const onSelectPreset = vi.fn();
  const view = render(<EffectiveConfig result={result} onSelectPreset={onSelectPreset} />);
  await waitFor(() => expect(view.getByRole("radio", { name: "As JSON" })).toBeTruthy());
  fireEvent.click(view.getByRole("radio", { name: "As JSON" }));
  await waitFor(() => expect(view.container.querySelector(".config-view")).toBeTruthy());

  // Default mode keeps `:dependencyDashboard` as an `extends` reference, so the
  // document's `description` is NOT the array the attribution indexes — no
  // cards at all rather than cards naming the wrong preset.
  expect(view.container.querySelectorAll(".json-desc")).toHaveLength(0);

  fireEvent.change(view.getByLabelText("Expand presets:"), { target: { value: "full" } });
  await waitFor(() => expect(view.container.querySelectorAll(".json-desc")).toHaveLength(2));

  // The preset's sentence comes first (own body merges last), and its card
  // names the preset, the path it arrived by and its slot in the array.
  const strings = [...view.container.querySelectorAll<HTMLElement>(".json-desc")];
  const preset = strings[0];
  if (!preset) {
    throw new Error("expected the preset's own sentence to be attributed");
  }
  fireEvent.focus(preset);
  const card = document.querySelector<HTMLElement>(".desc-attr-card");
  if (!card) {
    throw new Error("focusing an attributed string opened no card");
  }
  expect(card.textContent).toContain("wrote this description");
  expect(card.querySelector(".desc-attr-path")?.textContent).toBe(
    "(input config) › :dependencyDashboard",
  );
  expect(card.textContent).toContain("Position 1 of 2");

  // …and its jump is the same tree selection every other chip in this view offers.
  fireEvent.click(within(card).getByText("Show in preset tree →"));
  expect(onSelectPreset).toHaveBeenCalledTimes(1);

  // The reader's own sentence is not a preset: repo chip, no path, no jump.
  const own = strings[1];
  if (!own) {
    throw new Error("expected the repo's own sentence to be attributed");
  }
  fireEvent.focus(own);
  const repoCard = document.querySelector<HTMLElement>(".desc-attr-card");
  expect(repoCard?.textContent).toContain("repo config");
  expect(repoCard?.querySelector(".desc-attr-path")).toBeNull();
  expect(repoCard?.textContent).not.toContain("Show in preset tree");
});

/**
 * Roadmap 082: the toolbar's copy. It is the design's one-click way to the
 * resolved document, and it must be reachable from the row view — which is
 * where a reader spends the tab — not only from As JSON.
 */
it("offers the resolved document from the toolbar in both views", async () => {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({ extends: [":dependencyDashboard"] }),
  });

  const view = render(<EffectiveConfig result={result} />);
  const copy = await waitFor(() =>
    view.getByRole("button", { name: "Copy effective config as JSON" }),
  );
  // …while the By-key view is still the one on screen.
  expect(view.getByRole("radio", { name: "By key" }).getAttribute("aria-checked")).toBe("true");
  expect(copy.title).toBe("Copy effective config as JSON");

  // And it stays put in As JSON, beside that view's own labelled copy.
  fireEvent.click(view.getByRole("radio", { name: "As JSON" }));
  await waitFor(() =>
    expect(view.getByRole("button", { name: "Copy resolved config" })).toBeTruthy(),
  );
  expect(view.getByRole("button", { name: "Copy effective config as JSON" })).toBeTruthy();
});

/**
 * Roadmap 082 (GAP-1/GAP-2): ONE toolbar row, in both views — filter, "only
 * overridden", the view switch, the copy. The two controls the design does not
 * have (the layer `<select>`, the "show default-only" checkbox) are gone, and
 * the two that survive stay on screen in the As-JSON view, where they are inert
 * rather than absent: they narrow ROWS, and that document is copied whole.
 */
it("keeps one toolbar in both views, with the row filters inert over the document", async () => {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({ extends: [":dependencyDashboard"], labels: ["deps"] }),
  });

  const view = render(<EffectiveConfig result={result} />);
  await waitFor(() => expect(view.container.querySelector(".prov-row")).not.toBeNull());

  expect(view.container.querySelectorAll(".prov-toolbar")).toHaveLength(1);
  expect(view.queryByLabelText("Filter keys by layer")).toBeNull();
  expect(view.queryByLabelText(/show default-only/)).toBeNull();

  const filter = view.getByPlaceholderText("Filter keys…");
  const onlyOverridden = view.getByLabelText("only overridden");
  expect((filter as HTMLInputElement).disabled).toBe(false);

  fireEvent.click(view.getByRole("radio", { name: "As JSON" }));
  await waitFor(() => expect(view.getByLabelText("Expand presets:")).toBeTruthy());
  expect(view.getByPlaceholderText("Filter keys…")).toBeTruthy();
  expect((view.getByPlaceholderText("Filter keys…") as HTMLInputElement).disabled).toBe(true);
  expect((onlyOverridden as HTMLInputElement).disabled).toBe(true);
});

/**
 * Roadmap 082 (GAP-8): the note the view could not state before. `:pinAll`
 * pins digests, and a repo config that sets the same value again is a line that
 * changes nothing — a fact that lived in the chain's no-op steps, which every
 * rendering filtered out.
 */
it("calls out a repo line that repeats what a preset already set", async () => {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({
      extends: [":dependencyDashboard"],
      dependencyDashboard: true,
    }),
  });

  const view = render(<EffectiveConfig result={result} />);
  await waitFor(() => expect(view.container.querySelector(".prov-row")).not.toBeNull());

  const note = view.getByText("also set by :dependencyDashboard — same value");
  expect(note.className).toContain("warn");
  // The band header names the deciding layer, so the row's third cell no longer
  // repeats it as a chip (GAP-19).
  const row = note.closest(".prov-row-head");
  expect(row?.querySelector(".badge.prov-layer")).toBeNull();
});
