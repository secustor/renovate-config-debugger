import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { SimulationResult, TraceResult } from "@renovate-config-debugger/engine";
import { runSimulation } from "./run-simulation";
import { DEFAULT_RULE_FILTERS, type RuleFilters } from "@/lib/rule-filters";
import { useSyncedReset } from "@/hooks/use-synced-reset";
import { errorMessage } from "@/lib/errors";
import type { FormState } from "@/types/simulator";

export type Simulate = (nextForm: FormState, touched: boolean, keepStep?: boolean) => Promise<void>;

export interface SimulationRun {
  sim: SimulationResult | null;
  /** Roadmap 021: the form (all fields) that produced `sim`, kept alongside it
   *  so the card can name exactly what was simulated — never the live `form`,
   *  which may have been edited further without a re-run (that drift is what
   *  the "stale" banner covers). */
  simForm: FormState | null;
  /** The serialized form `sim` was run against, for the staleness check. */
  ranKey: string | null;
  running: boolean;
  error: string | null;
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
  guard,
  clearGuard,
}: {
  result: TraceResult;
  onMergeStepChange: (index: number) => void;
  /** Roadmap 015's empty-form guard, owned by `useSimulatorForm` — a run and a
   *  pin trip the same one, so there is one flag and one notice, not two. Both
   *  are identity-stable, hence usable as effect deps. */
  guard: (form: FormState) => boolean;
  clearGuard: () => void;
}): SimulationRun {
  const [sim, setSim] = useState<SimulationResult | null>(null);
  const [simForm, setSimForm] = useState<FormState | null>(null);
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

  // A new run invalidates any previous simulation (the rules may differ). This
  // hook's OWN half of that invalidation happens during render — React's
  // "adjust state when a prop changes" idiom, the same one `StepThrough` uses:
  // `result` is the trigger and the reset reads nothing out of it, so as an
  // effect the new run was a dependency the body never touched. Done here the
  // stale verdict is also gone BEFORE the paint, where an effect left one
  // committed frame showing the previous run's rules under the new run's config.
  useSyncedReset(result, () => {
    setSim(null);
    setSimForm(null);
    setRanKey(null);
    setError(null);
    setRuleFilters(DEFAULT_RULE_FILTERS);
    setFocusHint(null);
  });

  // The empty-form guard is the half that cannot: it belongs to
  // `useSimulatorForm`, and a cross-hook call during render is the side effect
  // React is free to replay.
  useEffect(() => {
    clearGuard();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `result` is this effect's TRIGGER, not an input: the guard belongs to the run that just ENDED, so the body reads nothing out of the new one — it only has to be cleared once per run.
  }, [result, clearGuard]);

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
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- both entries are TRIGGERS naming the layout this restore must run against: the position is read from a ref, and what the list says is "after `sim` and the verdict facet have changed TOGETHER". Dropping either would restore against an intermediate DOM — the jump this exists to prevent.
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
    if (!guard(nextForm)) {
      return;
    }
    setRunning(true);
    setError(null);
    try {
      // Roadmap 075 (iteration 6): the engine call itself lives in
      // `run-simulation.ts` — the pinned tests re-run the same one, and a
      // pin's verdict has to be the verdict this panel would show for the
      // same descriptor.
      const { sim: simResult } = await runSimulation(finalConfig, nextForm, touched);
      // Captured right before the state updates that can shrink the results
      // list (see the layout effect above) — not at the top of `simulate`,
      // so an in-flight fetch doesn't capture a scroll position the user has
      // since abandoned.
      scrollYBeforeSimulate.current = window.scrollY;
      setSim(simResult);
      setSimForm(nextForm);
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
        onMergeStepChange(0);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  }
  // The ref always holds the closure that sees this render's config — the
  // share-link effect's own guard (`!result.finalConfig`) keeps it from running
  // one against a config that doesn't exist yet. The write is `useLatestRef`'s,
  // inlined because the ref is declared (and documented) above with the state
  // it belongs to: an insertion effect, so it lands before every effect and
  // handler of this commit — the only places it is read — without being a
  // render-time ref write (`react/refs`).
  useInsertionEffect(() => {
    simulateRef.current = simulate;
  });

  return {
    sim,
    simForm,
    ranKey,
    running,
    error,
    ruleFilters,
    setRuleFilters,
    focusHint,
    setFocusHint,
    simulate,
    simulateRef,
  };
}
