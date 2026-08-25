import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { DeciderId } from "./decider-groups";
import { groupByDecider, presetDeciderName, topLevelPresetNames } from "./decider-groups";
import type { ResolvedConfigMode, TraceResult } from "@renovate-config-debugger/engine";
import { type EffectiveTally, effectiveTally, isOverridden } from "@/lib/effective-tally";
import { type BandRowContext, EffectiveBands } from "./Bands";
import { ConfigJson } from "@/components/ConfigJson";
import { type EffectiveView, EffectiveToolbar } from "./EffectiveToolbar";
import { ResolvedJsonView } from "./ResolvedJsonView";
import { useProvenance, useResolvedConfig } from "./use-effective-derivations";
import { useToggleSet } from "@/hooks/use-toggle-set";
import { useRuleProvenance } from "@/hooks/rule-provenance";
import { useDescriptionProvenance } from "@/hooks/description-provenance";
import { buildDescriptionCards } from "@/lib/description-attribution";
import { buildDescriptionLedger, DESCRIPTION_KEY } from "./description-ledger";
// Roadmap 069 hoisted this out of here: the description digest prints the same
// one-line matcher summary, and one spelling of it is enough.
import { resolvedConfigText } from "./resolved-json";
import { useSyncedReset } from "@/hooks/use-synced-reset";

/**
 * Roadmap 005: the effective config as a provenance view. Every top-level key
 * carries a colour-coded badge for its winning source layer (default / a
 * preset / the repo config) and expands to the full override chain — who set
 * it, who overrode it, and the losing values. Provenance is computed post-hoc
 * from the trace via the engine's `computeProvenance`, loaded through the same
 * dynamic import that keeps the renovate chunk out of the initial bundle.
 */

/**
 * Roadmap 075 (iteration 5): the decided-by sections that start closed. Only
 * the defaults group does — it is the "nothing in your run touched them" pile,
 * routinely the largest, and the one a reader opens deliberately. Frozen at
 * module scope so every reset assigns the same set rather than minting one.
 */
const DEFAULT_COLLAPSED: ReadonlySet<DeciderId> = new Set<DeciderId>(["defaults"]);

// Roadmap 032: memoized — this view renders ~100 provenance rows and reads
// nothing that changes while the user types in the editor, so a keystroke
// must not re-render it. All props are identity-stable in App (the callbacks
// via useCallback/latest-ref, the rest primitives or per-run objects).
export const EffectiveConfig = memo(function EffectiveConfig({
  result,
  onSelectPreset,
  onStats,
  focusDescriptionNonce,
}: {
  result: TraceResult;
  onSelectPreset?: (nodeId: string) => void;
  /** Roadmap 028/029: reports this view's own numbers (`EffectiveTally`,
   *  derived in `lib/effective-tally.ts` so the CLI's `digest` quotes the same
   *  function) whenever they change, so the shell never has to recompute
   *  provenance itself — the tab badge and the digest quote what these rows
   *  show. */
  onStats?: (stats: EffectiveTally) => void;
  /** Roadmap 069: bumped by the description digest card's "show raw order"
   *  link (and by the preset tree's position markers, which are the same jump
   *  from the other end) — landing on the `description` row: filter prefilled,
   *  row expanded, ledger on screen. */
  focusDescriptionNonce?: number;
}) {
  const provenance = useProvenance(result);
  const ruleAttribution = useRuleProvenance(result);
  // Roadmap 069: the per-string `description` attribution. Cached per result by
  // the hook, so this tab's digest card and this row share one walk.
  const descriptionProvenance = useDescriptionProvenance(result);
  const ledger = useMemo(
    () => (descriptionProvenance ? buildDescriptionLedger(descriptionProvenance) : null),
    [descriptionProvenance],
  );
  const filterInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [onlyOverridden, setOnlyOverridden] = useState(false);
  const expandedRows = useToggleSet();
  // Roadmap 075 (iteration 5): which decided-by sections are folded shut.
  const collapsedSections = useToggleSet<DeciderId>(DEFAULT_COLLAPSED);
  // Roadmap 082 (GAP-7): the bands whose row cap the reader has lifted.
  const shownAllBands = useToggleSet<DeciderId>();
  // Destructured so `exhaustive-deps` can see what the effects below depend on:
  // the hook's callbacks are identity-stable, but the rule reads the object.
  const { reset: resetExpandedRows } = expandedRows;
  const { reset: resetCollapsedSections } = collapsedSections;
  // Roadmap 051: the As-JSON rendering and its output options
  const [view, setView] = useState<EffectiveView>("keys");
  const [expand, setExpand] = useState<ResolvedConfigMode>("keep-internal");
  const [includeDefaults, setIncludeDefaults] = useState(false);
  // Roadmap 069 (PR 5): the same walk again, read the other way round — one
  // card per string for the As-JSON document, where the sentences are already
  // on screen and the attribution has nowhere else to live. Gated on the view
  // like `resolvedOutput` below: derived only once the reader opens As-JSON.
  const descriptionCards = useMemo(
    () =>
      descriptionProvenance && view === "json"
        ? buildDescriptionCards(descriptionProvenance, result.presetTree)
        : null,
    [descriptionProvenance, result.presetTree, view],
  );
  // Roadmap 082: derived for BOTH views, not only As-JSON. The toolbar's copy
  // button is on screen in the By-key view too and must hand over the same
  // document — and `navigator.clipboard.writeText` has to be called in the
  // click's own task (Safari drops a write issued after an await), so the
  // document cannot be computed on demand. The cost is one extra
  // `computeResolvedConfig` per RUN — a handful of `mergeChildConfig` calls,
  // off the critical path in an effect, and not per keystroke: `expand` and
  // `includeDefaults` can only be changed from the JSON view.
  const resolvedOutput = useResolvedConfig(
    result,
    provenance !== undefined,
    expand,
    expand === "full" && includeDefaults,
  );

  // node ids and keys are per-run, so drop any stale expansion/filter state.
  // DURING RENDER, not in an effect (the `useDescriptionProvenance` idiom):
  // effects flush after the commit, so a click landing in the gap between the
  // commit that delivered this provenance and its passive flush would enqueue
  // its expansion first and then be wiped by the reset — a user's first click
  // silently undone, and the flake CI caught as "the expanded description row
  // rendered no ledger".
  useSyncedReset(provenance, () => {
    resetExpandedRows();
    resetCollapsedSections(DEFAULT_COLLAPSED);
    shownAllBands.reset();
    setQuery("");
    setOnlyOverridden(false);
    setView("keys");
    setExpand("keep-internal");
    setIncludeDefaults(false);
  });

  // Roadmap 069: the description card's "show raw order" link lands on the blame
  // ledger — the row is one of ~90, so arriving at the tab is not arriving at
  // the answer. Filter, expand, no focus steal: the reader is here to read.
  // …which means clearing the OTHER filter too, not just setting the query:
  // "only overridden" left over from earlier reading would hide the very row the
  // link promised, and the reader would land on "No keys match".
  // …and, since 075, re-opening the decided-by bands for the same reason: a
  // reader who folded the presets band shut earlier would otherwise land on a
  // collapsed band instead of the ledger the link promised. The defaults band
  // stays shut — `description` has no Renovate default, so it can never be the
  // band this row is in.
  //
  // DURING RENDER for the same reason as the reset above, and BELOW it so that a
  // commit carrying both a new provenance and a new nonce still lands: the run's
  // reset clears the query, and the link's landing sets it afterwards. The owner
  // starts at `undefined`, so a nonce that is already set when this view mounts
  // (the link that switched to this tab) is honoured on the first render.
  useSyncedReset(
    focusDescriptionNonce,
    () => {
      if (focusDescriptionNonce) {
        setView("keys");
        setQuery(DESCRIPTION_KEY);
        setOnlyOverridden(false);
        resetExpandedRows(new Set([DESCRIPTION_KEY]));
        resetCollapsedSections(DEFAULT_COLLAPSED);
      }
    },
    // Starts at `undefined` rather than at the current nonce, so a nonce that
    // is ALREADY set when this view mounts — the cross-link that switched to
    // this tab — is honoured on the first render instead of adopted as seen.
    () => undefined,
  );

  const entries = useMemo(() => (provenance ? [...provenance.values()] : []), [provenance]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (q && !entry.key.toLowerCase().includes(q)) {
        return false;
      }
      if (onlyOverridden && !isOverridden(entry)) {
        return false;
      }
      return true;
    });
  }, [entries, query, onlyOverridden]);

  /**
   * Roadmap 075 (iteration 5): the rows, cut by WHO DECIDED each key's final
   * value (`features/effective-config/decider-groups.ts` reads that off the
   * chain the engine already built — nothing is recomputed here).
   *
   * Roadmap 082: the default-only rows are in here now. They used to be
   * filtered out of the view entirely until a checkbox asked for them, which
   * meant the tab's headline count and the config Renovate actually runs were
   * two different documents; they are the defaults band, folded shut.
   */
  const sections = useMemo(() => groupByDecider(filtered), [filtered]);

  /** Roadmap 082 (GAP-3): the band is named after the reader's own `extends`. */
  const presetName = useMemo(
    () => presetDeciderName(topLevelPresetNames(result.presetTree)),
    [result.presetTree],
  );

  // Roadmap 032: the view's headline numbers — decided keys, default-only
  // rows (the folded defaults band), really-overridden rows — in ONE pass
  // over the entries (they were
  // three separate filter passes: the stats effect made two and the render
  // counted the defaults again). `filtered` above stays its own memo since it
  // additionally depends on the interactive filters.
  const tallies = useMemo(() => effectiveTally(entries), [entries]);

  useEffect(() => {
    // Replay-02 N3: while provenance is still loading (`undefined`), `entries`
    // is empty and the tallies are an honest-looking zero — reporting them
    // overwrote App's pending `null` and painted "0 effective options" next
    // to a green verdict on first paint. Stay silent until real numbers
    // exist; the digest keeps its "still being counted…" clause meanwhile.
    if (provenance === undefined) {
      return;
    }
    onStats?.(tallies);
  }, [tallies, onStats, provenance]);

  if (!result.finalConfig) {
    return null;
  }

  // Fallback: provenance needs a completed preset resolution. When it is
  // unavailable, still show the effective config as plain JSON.
  if (provenance === null) {
    return (
      <>
        <p className="empty-note">
          Per-key provenance is unavailable because preset resolution did not complete. Showing the
          effective config Renovate produced from the defaults.
        </p>
        <pre className="config-view">
          <ConfigJson value={result.finalConfig} />
        </pre>
      </>
    );
  }

  const rowContext: BandRowContext = {
    expanded: expandedRows.set,
    onToggleRow: expandedRows.toggle,
    onSelectPreset,
    ruleAttribution,
    ledger,
  };

  return (
    // No card and no title: the tab strip already says "Effective config",
    // and the toolbar row plus the bordered band boxes frame themselves.
    <>
      {provenance === undefined ? <p className="empty-note">Computing provenance…</p> : null}
      {provenance !== undefined ? (
        <EffectiveToolbar
          filterInputRef={filterInputRef}
          query={query}
          onQueryChange={setQuery}
          onlyOverridden={onlyOverridden}
          onOnlyOverriddenChange={setOnlyOverridden}
          filtersApply={view === "keys"}
          view={view}
          onViewChange={setView}
          getText={resolvedOutput ? () => resolvedConfigText(resolvedOutput) : null}
        />
      ) : null}
      {provenance !== undefined && view === "json" ? (
        <ResolvedJsonView
          output={resolvedOutput}
          expand={expand}
          onExpandChange={setExpand}
          includeDefaults={includeDefaults}
          onIncludeDefaultsChange={setIncludeDefaults}
          defaultsCount={tallies.hiddenDefaults}
          descriptions={descriptionCards}
          onSelectPreset={onSelectPreset}
        />
      ) : null}
      {provenance !== undefined && view === "keys" ? (
        <EffectiveBands
          sections={sections}
          presetName={presetName}
          collapsed={collapsedSections.set}
          onToggleSection={collapsedSections.toggle}
          shownAll={shownAllBands.set}
          onShowAll={shownAllBands.add}
          rows={rowContext}
        />
      ) : null}
    </>
  );
});
