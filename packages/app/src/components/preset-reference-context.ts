import { createContext, useContext } from "react";
import type { PresetNode } from "@renovate-config-debugger/engine";

/**
 * Roadmap 081: what a `PresetName` needs to explain itself — the run's
 * resolution tree, and the app's one "select this preset's node" navigation.
 *
 * By CONTEXT rather than props, deliberately. A preset token appears in nine
 * places across three feature slices, most of them several components deep
 * inside a card that was handed a summary model rather than the tree (the
 * ledger's option rows know a setter's node id and nothing else). Threading a
 * `PresetNode` root through all of them to feed a hover card would put the
 * whole tree in the prop signature of every intermediate component, and the
 * first one that forgot to forward it would silently lose the card instead of
 * failing the build. The tokens keep taking their CLICK handler as a prop —
 * that differs per site (the ledger strip scrolls to a card, the option row
 * jumps to the tree) — and only the two things that are the same everywhere
 * travel this way.
 *
 * A separate module from the component for the reason `hover-card-hooks.ts`
 * is: a component module that also exports a hook or a context breaks Fast
 * Refresh (`react/only-export-components`).
 *
 * The default is empty, so a token rendered outside a run (a test, a Storybook
 * of one) is simply an inert purple name with no card — never a crash.
 */

export interface PresetReferenceValue {
  /** The current run's resolution tree, or null when there is no run. */
  root: PresetNode | null;
  /** App's `selectPresetNode` — switches to the Presets tab, landed on the node. */
  onSelectPreset?: (nodeId: string) => void;
}

const PresetReferenceContext = createContext<PresetReferenceValue>({ root: null });

export const PresetReferenceProvider = PresetReferenceContext.Provider;

export function usePresetReference(): PresetReferenceValue {
  return useContext(PresetReferenceContext);
}
