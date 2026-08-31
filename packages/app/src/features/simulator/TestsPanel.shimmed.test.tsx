/**
 * Roadmap 075 (iteration 6): the Tests tab's two views and the rules that bind
 * them — the pins list leads and is what a run re-checks, the full simulator is
 * one quiet link away and unchanged, and anything that names a SIMULATION (a
 * share link's `sim`) or a RULE (a cross-link's index) opens the simulator
 * itself rather than the list.
 *
 * Over a real (offline — no `extends`, so nothing is fetched) run, because the
 * pin cards' numbers are the run's own: a synthetic result would prove the
 * wiring and not the verdict.
 */
import { useState } from "react";
import { presetInjectionKey, runPipeline } from "@renovate-config-debugger/engine";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { SimRequest } from "@/hooks/use-share-link";
import { EMPTY_REPO_DEPS } from "./repo-deps";
import { TestsPanel } from "./TestsPanel";
import type { FormState, PinnedTest } from "@/types/simulator";
import type { RepoConnectOffer, RepoDep, RepoDepsView } from "@/types/repo";

afterEach(cleanup);

beforeAll(() => {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = () => undefined;
  window.scrollTo = () => undefined;
});

const CONFIG = {
  packageRules: [
    { matchPackageNames: ["react"], groupName: "react" },
    { matchSourceUrls: ["https://github.com/nowhere/nothing"], automerge: true },
  ],
};

function run() {
  return runPipeline({ fileName: "renovate.json", content: JSON.stringify(CONFIG) });
}

/** App's half of the contract: it owns the pins, the panel does the rest. */
function Harness({
  result,
  initialPins = [],
  simRequest,
  repoDeps = EMPTY_REPO_DEPS,
  repoConnect = { suggestion: null, onConnect: () => undefined, onOpenLoad: () => undefined },
}: {
  result: Awaited<ReturnType<typeof runPipeline>>;
  initialPins?: PinnedTest[];
  simRequest?: SimRequest | null;
  repoDeps?: RepoDepsView;
  repoConnect?: RepoConnectOffer;
}) {
  const [pins, setPins] = useState<PinnedTest[]>(initialPins);
  // Every callback is required (the shell always passes all of them), so the
  // harness supplies the whole set; the ones no assertion here reads are inert
  // stubs rather than absent props.
  const [mergeStepIndex, setMergeStepIndex] = useState(0);
  return (
    <TestsPanel
      result={result}
      pins={pins}
      onAddPin={(form: FormState) =>
        setPins((prev) => [...prev, { id: `pin-${prev.length + 1}`, form }])
      }
      onRemovePin={(id: string) => setPins((prev) => prev.filter((pin) => pin.id !== id))}
      onSelectPreset={() => undefined}
      onJumpToEditor={() => undefined}
      focusRuleIndex={null}
      onRuleFocused={() => undefined}
      errorLib={null}
      simRequest={simRequest ?? null}
      onCopySimLink={() => Promise.resolve()}
      onShare={() => Promise.resolve()}
      mergeStepIndex={mergeStepIndex}
      onMergeStepChange={setMergeStepIndex}
      repoDeps={repoDeps}
      onLoadRepoDeps={() => undefined}
      repoConnect={repoConnect}
    />
  );
}

async function pinReact(view: ReturnType<typeof render>): Promise<void> {
  fireEvent.change(view.getByLabelText("packageName", { exact: true }), {
    target: { value: "react" },
  });
  fireEvent.change(view.getByLabelText("currentValue", { exact: true }), {
    target: { value: "17.0.0" },
  });
  fireEvent.change(view.getByLabelText("newValue", { exact: true }), {
    target: { value: "17.0.1" },
  });
  fireEvent.click(view.getByRole("button", { name: "Pin as a standing test" }));
  await waitFor(() => expect(view.container.querySelector(".pin-card")).not.toBeNull());
}

/**
 * The Tests tab names the preset a rule COMES FROM, and a rule almost never
 * comes from the preset the config extends: `config:best-practices` writes
 * none of the ~730 rules it contributes. Injected presets stand in for that
 * shape — an umbrella whose nested leaf writes the rule that fires.
 */
const NESTED_PRESETS = {
  [presetInjectionKey({ presetSource: "github", repo: "test-org/umbrella" })]: {
    extends: ["github>test-org/leaf"],
  },
  [presetInjectionKey({ presetSource: "github", repo: "test-org/leaf" })]: {
    packageRules: [{ matchPackageNames: ["react"], groupName: "react" }],
  },
};

it("names the nested preset that wrote a matched rule, not the extend it arrived through", async () => {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({ extends: ["github>test-org/umbrella"] }),
    injectedPresets: NESTED_PRESETS,
  });
  const view = render(<Harness result={result} />);
  await pinReact(view);

  const card = view.container.querySelector<HTMLElement>(".pin-card");
  if (!card) {
    throw new Error("pinning produced no card");
  }
  await waitFor(() => expect(card.textContent).toContain("grouped as “react”"));
  fireEvent.click(within(card).getByRole("button", { expanded: false }));
  expect(card.textContent).toContain("github>test-org/leaf");
  expect(card.textContent).not.toContain("github>test-org/umbrella");
});

it("opens on the pins list, pins a dependency from the Add-a-test form, and checks it against the run", async () => {
  const result = await run();
  const view = render(<Harness result={result} />);

  // The list leads: the summary strip, the empty-state card, and the always-
  // open Add-a-test form — and not the simulator card.
  expect(view.container.querySelector(".summary-strip")?.textContent).toContain("none pinned");
  expect(view.container.querySelector(".pin-empty-card")).not.toBeNull();
  expect(view.container.querySelector(".pin-add-panel")).not.toBeNull();
  expect(view.queryByText("Update simulator")).toBeNull();

  await pinReact(view);

  const card = view.container.querySelector<HTMLElement>(".pin-card");
  if (!card) {
    throw new Error("pinning produced no card");
  }
  expect(card.textContent).toContain("react");
  // The outcome, in the run's own terms: the rule that groups react matched,
  // and the header sentence carries the funnel's counts.
  await waitFor(() => {
    expect(card.textContent).toContain("grouped as “react”");
  });
  expect(card.textContent).toContain("1 matched, 1 skipped");
  // The version move is the header's context line (the design's grammar).
  expect(card.textContent).toContain("17.0.0 → 17.0.1");
  // Amber, and for the honest reason: the reader's second rule lost to a
  // `sourceUrl` this descriptor leaves unset, which is exactly the caveat the
  // verdict card raises (replay-02 R3). Green is for a verdict the tool is
  // confident about, whatever it says.
  expect(card.querySelector(".pin-dot.warn")).not.toBeNull();

  // Expanding opens the funnel: the matched section, the reader's OWN missed
  // rule by name — never bucketed — with its checklist open by default.
  fireEvent.click(within(card).getByRole("button", { expanded: false }));
  expect(within(card).getByText("1 matched")).toBeTruthy();
  expect(within(card).getByText("wrote to this update’s config")).toBeTruthy();
  expect(card.textContent).toContain("packageRules[0]");
  expect(within(card).getByText("1 of your rules")).toBeTruthy();
  expect(card.textContent).toContain("Matcher checklist — first failure stops the rule");
  // The probe is part of the open funnel.
  expect(within(card).getByPlaceholderText(/angular, groupName/)).toBeTruthy();

  // …and removing it leaves the list empty again.
  fireEvent.click(view.getByRole("button", { name: "Remove the pinned test for react" }));
  expect(view.container.querySelector(".pin-card")).toBeNull();
});

it("re-checks the pins against a NEW run without being asked", async () => {
  const first = await run();
  const view = render(<Harness result={first} />);
  await pinReact(view);
  await waitFor(() => expect(view.container.textContent).toContain("grouped as “react”"));

  // The edit a reader would make: the rule now automerges react instead of
  // grouping it. Nothing asks the pin to re-run — the new RESULT is the ask.
  const second = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({ packageRules: [{ matchPackageNames: ["react"], automerge: true }] }),
  });
  view.rerender(<Harness result={second} />);
  await waitFor(() => expect(view.container.textContent).toContain("automerge ✓"));
  expect(view.container.textContent).not.toContain("grouped as “react”");
  expect(view.container.textContent).toContain("1 matched, 0 skipped");
});

it("opens a pin in the full simulator, pre-filled, and comes back", async () => {
  const result = await run();
  const view = render(<Harness result={result} />);
  await pinReact(view);
  const card = view.container.querySelector<HTMLElement>(".pin-card");
  if (!card) {
    throw new Error("pinning produced no card");
  }
  fireEvent.click(within(card).getByRole("button", { expanded: false }));
  fireEvent.click(within(card).getByRole("button", { name: "open in simulator →" }));

  // The simulator, with this pin's descriptor in its form (the same channel a
  // share link's `sim` uses, so there is one pre-fill mechanism, not two).
  await waitFor(() => expect(view.getByText("Update simulator")).toBeTruthy());
  await waitFor(() =>
    expect(view.getByLabelText("packageName", { exact: true })).toHaveProperty("value", "react"),
  );
  fireEvent.click(view.getByRole("button", { name: "← Back to tests" }));
  expect(view.container.querySelector(".pin-card")).not.toBeNull();
});

it("pins the descriptor the detail view is analysing, and stays where it is", async () => {
  const result = await run();
  const view = render(
    <Harness
      result={result}
      simRequest={{
        form: { packageName: "react", currentValue: "17.0.0", newValue: "17.0.1" },
        // No auto-run: this is about the pin action, not the arrival run.
        autoSimulate: false,
        ranResult: result,
        nonce: 1,
      }}
    />,
  );
  await waitFor(() =>
    expect(view.getByLabelText("packageName", { exact: true })).toHaveProperty("value", "react"),
  );

  // Roadmap 080: the same action the Add-a-test panel has, on the same
  // `onAddPin` — and pinning does NOT navigate, so the analysis on screen
  // (the form the reader filled) survives it.
  fireEvent.click(view.getByRole("button", { name: "Pin as a standing test" }));
  expect(view.getByText("Update simulator")).toBeTruthy();
  expect(view.getByLabelText("packageName", { exact: true })).toHaveProperty("value", "react");
  expect(view.container.querySelector(".sim-actions")?.textContent).toContain("Pinned ✓");

  // The pin is in the list behind the back link, with the EFFECTIVE updateType
  // baked in — derived here from the version pair, never left blank.
  fireEvent.click(view.getByRole("button", { name: "← Back to tests" }));
  const card = view.container.querySelector<HTMLElement>(".pin-card");
  if (!card) {
    throw new Error("pinning from the detail view produced no card");
  }
  expect(card.textContent).toContain("react");
  await waitFor(() => expect(card.textContent).toContain("patch"));
});

it("lands on the simulator when the link that opened the app carried a simulation", async () => {
  const result = await run();
  const view = render(
    <Harness
      result={result}
      simRequest={{
        form: { packageName: "react", currentValue: "17.0.0", newValue: "17.0.1" },
        autoSimulate: true,
        ranResult: result,
        nonce: 1,
      }}
    />,
  );
  // No click: a `sim` link names a simulation, and the simulator is where one
  // is read (the auto-run itself is `useShareLinkRequest`'s, unchanged).
  expect(view.getByText("Update simulator")).toBeTruthy();
  expect(view.container.querySelector(".pin-add-panel")).toBeNull();
  await waitFor(() => expect(view.container.querySelector(".sim-verdict-block")).not.toBeNull(), {
    timeout: 30_000,
  });
});

it("points the new-pin tabs at the panel they control, and the panel back at the open tab", async () => {
  const result = await run();
  const view = render(<Harness result={result} />);

  // The half of tablist semantics the strip was MISSING: `aria-selected` said
  // which tab was open, but nothing on either side named the other, so a
  // screen reader had no way from the tab to the region it had just switched.
  // No jsx-a11y rule reports an absent relationship — this test is the guard.
  const panel = view.container.querySelector('[role="tabpanel"]');
  expect(panel).not.toBeNull();

  const manual = view.getByRole("tab", { name: "Manual" });
  expect(manual.getAttribute("aria-controls")).toBe(panel?.id);
  // …and the panel names whichever tab is currently open, so the pairing
  // survives a switch rather than being true only at mount.
  expect(panel?.getAttribute("aria-labelledby")).toBe(manual.id);

  const paste = view.getByRole("tab", { name: "Paste JSON" });
  expect(paste.getAttribute("aria-controls")).toBe(panel?.id);
  fireEvent.click(paste);
  expect(panel?.getAttribute("aria-labelledby")).toBe(paste.id);
  expect(manual.id).not.toBe(paste.id);
});

it("fills the Manual form from a pasted descriptor, and shows the descriptor back (082)", async () => {
  const result = await run();
  const view = render(<Harness result={result} />);

  const paste = view.getByRole("tab", { name: "Paste JSON" });
  // The tab strip carries its selection in ARIA, not only in a CSS class —
  // real tablist semantics since 078 lit the third tab up.
  expect(paste.getAttribute("aria-selected")).toBe("false");
  fireEvent.click(paste);
  expect(paste.getAttribute("aria-selected")).toBe("true");
  const textarea = view.getByLabelText("Dependency descriptor JSON");

  // A half-copied log line says so rather than doing nothing.
  fireEvent.change(textarea, { target: { value: '{"packageName": "react"' } });
  fireEvent.click(view.getByRole("button", { name: "Parse & fill" }));
  expect(view.container.querySelector(".sim-empty-guard")?.textContent).toContain("valid JSON");

  const pasted = JSON.stringify({
    depName: "actions/checkout",
    packageName: "checkout",
    currentValue: "v4",
    newValue: "v5",
    updates: [{ newValue: "v5" }],
  });
  fireEvent.change(textarea, { target: { value: pasted } });
  fireEvent.click(view.getByRole("button", { name: "Parse & fill" }));

  // Back on Manual, with the receipt and the fields the paste carried.
  expect(view.container.querySelector(".pin-import-note")?.textContent).toContain(
    "Imported 4 fields from pasted JSON · 1 unknown key ignored",
  );
  const field = (label: string) =>
    (view.getByLabelText(label, { exact: true }) as HTMLInputElement).value;
  expect(field("packageName")).toBe("checkout");
  expect(field("newValue")).toBe("v5");

  // The compact form's Descriptor JSON block (082) prints what would be SENT —
  // BOTH names, since Renovate matches on both — and says which end of the card
  // is the editable one.
  fireEvent.click(view.getByRole("button", { name: /Descriptor JSON/ }));
  const json = view.container.querySelector(".sim-descriptor-body")?.textContent ?? "";
  expect(json).toContain('"packageName": "checkout"');
  expect(json).toContain('"depName": "actions/checkout"');
  expect(json).toContain('"newValue": "v5"');
  expect(json).toContain("edit them, not this");

  // …and the draft survives the round trip, so a descriptor is never lost to a
  // glance at the form it filled.
  fireEvent.click(view.getByRole("tab", { name: "Paste JSON" }));
  expect((view.getByLabelText("Dependency descriptor JSON") as HTMLTextAreaElement).value).toBe(
    pasted,
  );
});

it("collapses behind the ghost row once a pin exists, and reopens from it (082 revisited)", async () => {
  const result = await run();
  const view = render(<Harness result={result} />);
  // With nothing pinned yet the card starts OPEN — the empty state's CTA
  // points at a form that is actually on screen.
  expect(view.container.querySelector(".pin-add-card")).not.toBeNull();
  await pinReact(view);

  // The × collapses the card to the design's ghost row…
  fireEvent.click(view.getByRole("button", { name: "Close the new-pin card" }));
  expect(view.container.querySelector(".pin-add-card")).toBeNull();
  const ghost = view.container.querySelector<HTMLElement>(".pin-add-ghost");
  if (!ghost) {
    throw new Error("collapsing left no ghost row");
  }
  expect(ghost.textContent).toContain("+ Pin a dependency…");

  // …and the ghost row expands it again, form and all.
  fireEvent.click(ghost);
  expect(view.container.querySelector(".pin-add-card")).not.toBeNull();
  expect(view.getByLabelText("packageName", { exact: true })).toBeTruthy();
});

const REPO_DEPS: RepoDepsView = {
  status: "ready",
  repo: "acme/webapp",
  deps: [
    {
      key: "package.json:0:typescript",
      depName: "typescript",
      value: "^5.8.3",
      meta: "package.json · ^5.8.3",
      manager: "npm",
      packageFile: "package.json",
      fill: {
        manager: "npm",
        packageFile: "package.json",
        depName: "typescript",
        packageName: "typescript",
        currentValue: "^5.8.3",
        datasource: "npm",
        depType: "devDependencies",
      },
    },
    {
      key: "Dockerfile:0:node",
      depName: "node",
      value: "20-alpine",
      meta: "Dockerfile · 20-alpine",
      manager: "dockerfile",
      packageFile: "Dockerfile",
      fill: {
        manager: "dockerfile",
        packageFile: "Dockerfile",
        depName: "node",
        packageName: "node",
        currentValue: "20-alpine",
        datasource: "docker",
      },
    },
  ],
  files: [
    {
      path: "package.json",
      managers: ["npm"],
      extractedBy: "npm",
      depCount: 1,
      outcome: "extracted",
    },
    {
      path: "Dockerfile",
      managers: ["dockerfile"],
      extractedBy: "dockerfile",
      depCount: 1,
      outcome: "extracted",
    },
  ],
  managersConsidered: 100,
  truncated: false,
  error: null,
};

it("offers the loaded repo's dependencies and pins one from the picker (078)", async () => {
  const result = await run();
  const view = render(<Harness result={result} repoDeps={REPO_DEPS} />);

  // The tab is live (a repo was loaded) and shows the extracted rows.
  fireEvent.click(view.getByRole("tab", { name: "From repository" }));
  expect(view.getByLabelText("Search detected dependencies")).toBeTruthy();
  const row = view.getByText("typescript").closest("li");
  if (!row) {
    throw new Error("the typescript row is missing");
  }

  // Quick-pin names the update TYPE; the draft is where the next version goes.
  fireEvent.click(within(row).getByRole("button", { name: "patch" }));
  fireEvent.change(view.getByLabelText("newValue", { exact: true }), {
    target: { value: "5.9.0" },
  });
  fireEvent.click(view.getByRole("button", { name: "Pin ⏎" }));

  // The pin lands in the list above and re-checks against the run…
  await waitFor(() => {
    expect(view.container.querySelector(".pin-card")?.textContent).toContain("typescript");
  });
  // …and the row now wears the standing pin's badge instead of quick-pins.
  expect(view.container.textContent).toContain("pinned · patch");
  expect(within(row).queryByRole("button", { name: "patch" })).toBeNull();

  // The search row narrows by file too (scoped to the list — the pin card
  // above it now names typescript as well).
  fireEvent.change(view.getByLabelText("Search detected dependencies"), {
    target: { value: "Dockerfile" },
  });
  const rows = view.container.querySelectorAll(".pin-repo-row");
  expect(rows).toHaveLength(1);
  expect(rows[0]?.textContent).toContain("node");
});

function repoDep(packageFile: string, depName: string, currentValue: string): RepoDep {
  return {
    key: `${packageFile}:${depName}`,
    depName,
    value: currentValue,
    meta: `${packageFile} · ${currentValue}`,
    manager: "npm",
    packageFile,
    fill: { manager: "npm", packageFile, depName, packageName: depName, currentValue },
  };
}

it("caps the list at five rows, counts the tail, and drafts inline under its row", async () => {
  const deps = [
    repoDep("package.json", "typescript", "^5.8.3"),
    repoDep("package.json", "react", "^19.0.0"),
    repoDep("Dockerfile", "node", "20-alpine"),
    repoDep("package.json", "vite", "^7.0.0"),
    repoDep(".github/workflows/ci.yml", "actions/checkout", "v4"),
    repoDep("package.json", "lodash", "4.17.21"),
    repoDep("Chart.yaml", "redis", "18.0.0"),
  ];
  const result = await run();
  const view = render(<Harness result={result} repoDeps={{ ...REPO_DEPS, deps }} />);
  fireEvent.click(view.getByRole("tab", { name: "From repository" }));

  // Five rows, then the design's tail line naming the hidden rows' files —
  // the list itself never grows past the cap (the column must not scroll for it).
  expect(view.container.querySelectorAll(".pin-repo-row")).toHaveLength(5);
  expect(view.container.textContent).toContain("… 2 more across package.json, Chart.yaml");

  // Quick-pin on a mid-list row: the draft card renders INSIDE the list,
  // immediately beneath the picked row (the design's draftHere).
  const row = view.getByText("node").closest("li");
  if (!row) {
    throw new Error("the node row is missing");
  }
  fireEvent.click(within(row).getByRole("button", { name: "patch" }));
  const holder = row.nextElementSibling;
  expect(holder?.className).toBe("pin-repo-draft-row");
  expect(holder?.querySelector(".pin-repo-draft")).not.toBeNull();

  // Searching the drafted row away must not lose the draft — its card falls
  // back to the list's tail until the row is visible again.
  fireEvent.change(view.getByLabelText("Search detected dependencies"), {
    target: { value: "package.json" },
  });
  expect(view.container.querySelector(".pin-repo-list .pin-repo-draft")).toBeNull();
  expect(view.container.querySelector(".pin-repo-draft")).not.toBeNull();
});

it("opens on From repository when a repo is already loaded — the design's default door", async () => {
  const result = await run();
  const view = render(<Harness result={result} repoDeps={REPO_DEPS} />);

  // No pins yet, so the card is open; with the repo's deps on the table the
  // picker is the selected tab without a click…
  const repoTab = view.getByRole("tab", { name: "From repository" });
  expect(repoTab.getAttribute("aria-selected")).toBe("true");
  expect(view.getByLabelText("Search detected dependencies")).toBeTruthy();

  // …and an explicit choice still sticks.
  fireEvent.click(view.getByRole("tab", { name: "Manual" }));
  expect(view.getByLabelText("packageName", { exact: true })).toBeTruthy();
});

it("offers the connect panel while no repo is loaded — with a link's suggested repo", async () => {
  const result = await run();
  const onConnect = vi.fn();
  const view = render(
    <Harness
      result={result}
      repoConnect={{ suggestion: "acme/webapp", onConnect, onOpenLoad: () => undefined }}
    />,
  );

  // The tab is live (no disabled state left), wears the quiet hint…
  const repoTab = view.getByRole("tab", { name: /From repository/ });
  expect(repoTab).toHaveProperty("disabled", false);
  expect(repoTab.textContent).toContain("not loaded");

  // …and opens on the connect panel: the shared link named the repo, so one
  // click asks for its dependencies.
  fireEvent.click(repoTab);
  expect(view.container.textContent).toContain("The repository isn’t loaded in this session");
  expect(view.container.textContent).toContain("opened from a shared link");
  fireEvent.click(view.getByRole("button", { name: "Reload acme/webapp" }));
  expect(onConnect).toHaveBeenCalledTimes(1);
});

it("offers the load-a-repository door when nothing suggests a repo", async () => {
  const result = await run();
  const onOpenLoad = vi.fn();
  const view = render(
    <Harness
      result={result}
      repoConnect={{ suggestion: null, onConnect: () => undefined, onOpenLoad }}
    />,
  );
  fireEvent.click(view.getByRole("tab", { name: /From repository/ }));
  expect(view.queryByRole("button", { name: /Reload/ })).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "load a repository…" }));
  expect(onOpenLoad).toHaveBeenCalledTimes(1);
});
