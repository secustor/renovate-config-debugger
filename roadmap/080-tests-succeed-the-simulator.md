# 080 — Tests succeed the simulator

Milestone: M20 · Status: done (feat/v2)

## The ruling

The Tests grammar is the successor of the standalone simulator. A pinned
descriptor — re-checked against every run, carried in the share link, its
verdict read in one funnel row — is what the simulator's "describe an update,
see what the rules do" was for; the simulator survives as the Tests tab's
**per-dependency detail view**, not as a peer feature. 075 iteration 6 made
that true structurally (the simulator became the Tests tab's second view, one
quiet link behind the pins); this doc makes it true behaviorally, and resolves
the product question 079's ledger left open ("two different pins in one
view").

The test of the ruling, applied below: **every door into the detail view
carries a subject** — a descriptor (a pin, a one-off, a share link's `sim`) or
a rule (a validation message's cross-link). A door that opens the view with
nothing selected is the old peer-feature entrance, and it goes.

## What changes

- **The A/B comparison retires.** "Pin result for comparison" (044) solved two
  problems the successor surfaces now solve better: _keeping a descriptor
  around across config edits_ is what a pinned test is (many of them,
  re-checked automatically on Run, in the share link), and _diffing one
  dependency's final config between two configs_ is `rcd compare`'s job (058),
  where both sides are named files instead of one side being whatever the
  editor held when the reader pinned. Removed: `use-ab-comparison.ts`,
  `ComparisonPanel.tsx`, the verdict block's pin/unpin control, the
  `.sim-compare-*` CSS block, and the two e2e cases that drive them. Nothing
  rode in share links (the A/B pin was ephemeral by design), so there is no
  decode compat to keep.

  Honest loss recorded: the browser loses the side-by-side before/after panel
  for one dependency across an edit. The successor workflow is: pin the
  dependency, edit, Run — the stale banner names the moment, the funnel row
  states the new outcome, and the deep diff remains available headlessly
  (`rcd compare before.json after.json --dep …`). The headless note at the
  page's foot is the pointer.

- **"Pin as a standing test" arrives in the detail view.** 079 declined it
  because "Pin" already meant the A/B pin there; that reason retires with the
  feature. The detail view's actions become the design's pair — primary
  `Simulate ⏎`, quiet "Pin as a standing test" — the same two the Add-a-test
  panel has, going through the same `onAddPin` with the same rules (the
  EFFECTIVE updateType is baked in; the 015 empty-form guard gates it; the
  MAX_PINS limit hides the quiet action, as in the panel). Pinning stays in
  place with the pin list one "← Back to tests" away — navigating on pin
  would be the tab-yanking 068 removed. The one-off result card's inline
  "Pin" link (079) is the same action and stays.

- **The descriptor-less door closes.** The pins summary strip's
  "open the simulator →" opened the detail view with an empty form — a
  duplicate of the Add-a-test Manual form one screen below it, reachable
  without a subject. It goes. The surviving doors, each with a subject:
  a pin card's and a one-off's "open in simulator →" (descriptor), a share
  link's `sim` (descriptor), a validation message naming `packageRules[N]`
  (rule). `TestsView` switching, the negative-nonce pin channel, and the
  share-link auto-run are untouched.

- **Quick-fill chips fill; Simulate runs.** The detail view's chips still
  carried 047's fill-and-run behavior; the Add-a-test form's chips (079) fill
  only. One form, one behavior: chips fill (and reset the updateType override,
  as everywhere), and the run stays Simulate's job — which is also what the
  design's chip does. The auto-run on _arrival_ (a pin's "open in simulator",
  a share link with `autoSimulate`) is not a chip and keeps running: the
  reader was promised the verdict of a specific descriptor, not a form.

## What deliberately does not change

- **The detail view's own share link** (`onCopySimLink`, 018) stays: a link to
  a specific analysis is evidence export, the same shape as a link to a preset
  node. Links carrying `sim` keep opening the detail view and auto-running.
- **The `simulator` tab id** stays a decode-only legacy alias for `tests`
  (062/075) — links carrying it are already out there.
- **`rcd compare` / `compare_simulations`** are untouched; they are the
  successor for config-vs-config diffing, not part of the removal.
- **The rule cross-link door** (Problems → `packageRules[N]`) stays: its
  subject is a rule, and the detail view is where a rule's clauses are
  explained.
- **`mergeStepIndex` / `view.simStep`** share plumbing is untouched.

## Consequences worth stating

- 079's ledger entry "No 'Pin as a standing test' in the standalone
  simulator" is superseded by this doc (the entry stays in 079 with a pointer
  here — ledgers record what was true when written).
- The A/B block was also the simulator's last per-keystroke derivation with no
  render gate (`currentDescriptor` recomputed off the live form even with
  nothing pinned); it disappears with the hook rather than being fixed.
- The TestsPanel doc comment's inventory of the detail view ("verdict threads,
  A/B comparison, the merge replay, the full rule list") loses its second
  item; copy touched accordingly.
