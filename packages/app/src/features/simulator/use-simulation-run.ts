import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { SimulationResult, TraceResult } from "@renovate-config-debugger/engine";
import { type FormState, hasMeaningfulInput, toDescriptor } from "./form";
import { DEFAULT_RULE_FILTERS, type RuleFilters } from "@/lib/rule-filters";

export type Simulate = (nextForm: FormState, touched: boolean, keepStep?: boolean) => Promise<void>;

export interface SimulationRun {
  sim: SimulationResult | null;
  /** Roadmap 021: the form (all fields) + effective updateType that produced
   *  `sim`, kept alongside it so the comparison panel can show/diff exactly
   *  what was simulated — never the live `form`, which may have been edited
   *  further without a re-run (that drift is what the "stale" banner covers). */
  simForm: FormState | null;
  simEffectiveUpdateType: string;
  /** The serialized form `sim` was run against, for the staleness check. */
  ranKey: string | null;
  running: boolean;
  error: string | null;
  emptyGuardTriggered: boolean;
  /** Roadmap 023/047: the rules drawer's two filter facets (verdict, provenance). */
  ruleFilters: RuleFilters;
  setRuleFilters: Dispatch<SetStateAction<RuleFilters>>;
  focusHint: number | null;
  setFocusHint: Dispatch<SetStateAction<number | null>>;
  simulate: Simulate;
  /** Roadmap 034: the latest `simulate` closure, for effects that must not
   *  re-run when it is redeclared (see `useShareLinkRequest`). */
  simulateRef: RefObject<Simulate | null>;
}

/**
 * Roadmap 006/015/016: running the simulation and the result state it
 * produces — the engine call itself, the empty-form guard, the staleness key,
 * the rule-list filters a fresh run resets, and the scroll restoration that
 * keeps the page from jumping when the results list shrinks under it.
 */
export function useSimulationRun({
  result,
  onMergeStepChange,
}: {
  result: TraceResult;
  onMergeStepChange?: (index: number) => void;
}): SimulationRun {
  const [sim, setSim] = useState<SimulationResult | null>(null);
  const [simForm, setSimForm] = useState<FormState | null>(null);
  const [simEffectiveUpdateType, setSimEffectiveUpdateType] = useState("");
  const [ranKey, setRanKey] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Roadmap 023/047: the rules drawer's filters — the verdict facet defaults to
  // the matched-and-unresolved view, the provenance facet to every layer. The
  // user's OWN repo-config rules (their most common "where's my rule?" wish)
  // are `preset: "repo"`, which also pre-expands those rows' clause evidence.
  const [ruleFilters, setRuleFilters] = useState<RuleFilters>(DEFAULT_RULE_FILTERS);
  // Roadmap 023: the merged index a cross-link asked to see before any
  // simulation exists to render its row — kept to show a "run a simulation"
  // hint rather than the click doing nothing (the "looks broken" finding).
  const [focusHint, setFocusHint] = useState<number | null>(null);
  // Roadmap 015: set when Simulate is clicked on a form with no identifying
  // input; cleared reactively the moment the form has ANY meaningful field.
  const [emptyGuardTriggered, setEmptyGuardTriggered] = useState(false);
  // Roadmap 016: re-simulating (e.g. after editing the form and clicking
  // Simulate again) resets the verdict facet to its default, which can
  // unmount rows the user was scrolled past — the browser's scroll-anchoring
  // then repicks a higher anchor and the page visibly jumps. Capture the
  // scroll position right before the state update that causes the unmount,
  // then restore it once the new DOM has painted (clamped automatically by
  // the browser if the new content is shorter than before).
  const scrollYBeforeSimulate = useRef<number | null>(null);
  // Roadmap 034: `simulate` is redeclared every render (it closes over this
  // render's `finalConfig`), so listing it in the share-link effect's deps
  // would re-run that effect on every render instead of once per link. The
  // latest-ref pattern keeps the deps `[simRequest, result]` while the effect
  // still invokes the CURRENT closure — the one that sees the config the run
  // this link triggered just produced.
  const simulateRef = useRef<Simulate | null>(null);

  // A new run invalidates any previous simulation (the rules may differ).
  useEffect(() => {
    setSim(null);
    setSimForm(null);
    setSimEffectiveUpdateType("");
    setRanKey(null);
    setError(null);
    setRuleFilters(DEFAULT_RULE_FILTERS);
    setFocusHint(null);
    setEmptyGuardTriggered(false);
  }, [result]);

  // Roadmap 016: restore the scroll position captured in `simulate` right
  // before the DOM the browser is about to repaint — after `sim` and the
  // verdict facet change together, so this runs once against the settled
  // layout rather than an intermediate one.
  useLayoutEffect(() => {
    const y = scrollYBeforeSimulate.current;
    if (y !== null) {
      scrollYBeforeSimulate.current = null;
      window.scrollTo({ top: y, behavior: "auto" });
    }
  }, [sim, ruleFilters.verdict]);

  /**
   * @param touched Roadmap 015: whether the CALLER's updateType is a manual
   * override (Simulate button click — pass the current `updateTypeTouched`
   * state) or not (a quick-fill's own guess, always re-derivable). Threaded
   * explicitly rather than read from state inside this async function, since
   * `quickFill` also resets the state flag in the same tick — reading it here
   * would race against that update.
   */
  async function simulate(nextForm: FormState, touched: boolean, keepStep = false) {
    const finalConfig = result.finalConfig;
    if (!finalConfig) {
      return;
    }
    // Roadmap 015: empty-form guard — an all-blank descriptor is guaranteed
    // to match nothing, and running it just renders hundreds of "no match"
    // rows with no explanation (the study's "did I break something?" moment).
    if (!hasMeaningfulInput(nextForm)) {
      setEmptyGuardTriggered(true);
      return;
    }
    setEmptyGuardTriggered(false);
    setRunning(true);
    setError(null);
    try {
      const engine = await import("@renovate-config-debugger/engine");
      const derived = engine.deriveUpdateType(
        nextForm.currentValue,
        nextForm.newValue,
        nextForm.versioning,
      );
      const effectiveType = touched || derived === undefined ? nextForm.updateType : derived;
      const simResult = await engine.simulatePackageRules({
        config: finalConfig,
        dep: toDescriptor(nextForm, effectiveType),
      });
      // Captured right before the state updates that can shrink the results
      // list (see the layout effect above) — not at the top of `simulate`,
      // so an in-flight fetch doesn't capture a scroll position the user has
      // since abandoned.
      scrollYBeforeSimulate.current = window.scrollY;
      setSim(simResult);
      setSimForm(nextForm);
      setSimEffectiveUpdateType(effectiveType);
      setRanKey(JSON.stringify(nextForm));
      // The verdict facet goes back to the default view for the new run; the
      // provenance one is left alone — a user filtered to their own rules
      // stays there across a re-run, as the "my rules only" toggle did.
      setRuleFilters((prev) => ({ ...prev, verdict: DEFAULT_RULE_FILTERS.verdict }));
      setFocusHint(null);
      // Roadmap 044: a new simulation is a new merge sequence — start at its
      // first step (the controlled index lives in App, so the reset does too,
      // exactly like the migration stepper's). `keepStep` is the share-link
      // auto-run, whose index the link itself just restored.
      if (!keepStep) {
        onMergeStepChange?.(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }
  // Assigned during render so the ref always holds the closure that sees this
  // render's config — the share-link effect's own guard (`!result.finalConfig`)
  // keeps it from running one against a config that doesn't exist yet.
  simulateRef.current = simulate;

  return {
    sim,
    simForm,
    simEffectiveUpdateType,
    ranKey,
    running,
    error,
    emptyGuardTriggered,
    ruleFilters,
    setRuleFilters,
    focusHint,
    setFocusHint,
    simulate,
    simulateRef,
  };
}
