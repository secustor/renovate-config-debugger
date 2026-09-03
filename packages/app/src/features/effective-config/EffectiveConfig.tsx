import { memo, useEffect, useMemo, useState } from "react";
import { groupByDecider, presetDeciderName, topLevelPresetNames } from "./decider-groups";
import type { ResolvedConfigMode, TraceResult } from "@renovate-config-debugger/engine";
import { type EffectiveTally, effectiveTally } from "@/lib/effective-tally";
import { ConfigJson } from "@/components/ConfigJson";
import { isNullOrUndefined } from "@renovate-config-debugger/engine/is";
import { DataTable } from "@/components/DataTable";
import {
  DECIDED_BY,
  EFFECTIVE_COLUMNS,
  EFFECTIVE_GROUPINGS,
  EFFECTIVE_NOUN,
  EFFECTIVE_VIEWS,
  type EffectiveView,
  effectiveTableRows,
  isEffectiveView,
} from "./effective-rows";
import { nf } from "@/lib/format";
import { ResolvedJsonView } from "./ResolvedJsonView";
import { useProvenance, useResolvedConfig } from "./use-effective-derivations";
import { useRuleProvenance } from "@/hooks/rule-provenance";
import { useDescriptionProvenance } from "@/hooks/description-provenance";
import { buildDescriptionCards } from "@/lib/description-attribution";
import { buildDescriptionLedger, DESCRIPTION_KEY } from "./description-ledger";
import { resolvedConfigText } from "./resolved-json";
import { useSyncedReset } from "@/hooks/use-synced-reset";

/**
 * Roadmap 005: the effective config as a provenance view. Every top-level key
 * expands to the full override chain — who set it, who overrode it, and the
 * losing values. Provenance is computed post-hoc from the trace via the
 * engine's `computeProvenance`, loaded through the same dynamic import that
 * keeps the renovate chunk out of the initial bundle.
 *
 * Roadmap 092: the whole tab is ONE standard data table
 * (`components/DataTable`) plus a footer line. The bespoke toolbar row and the
 * decided-by bands are gone — the filter, the "only overridden" gate, the
 * By-key/As-JSON switch and the copy button are the table's own toolbar and
 * gear, and the bands are its grouping. The three pieces of state this view
 * still owns are the three the table cannot: a run resets them, and the
 * description digest's link lands on one particular row.
 */

// Roadmap 051: the card's two renderings — provenance rows / a standalone JSON
// document. A MODE, not a filter: the JSON view is a different document (and a
// different computation), which is why the table treats it as an alternate VIEW
// and lets the row filters go inert while it is up. `EffectiveView` is the
// strip's own id union, imported from where the strip is declared.
const FILTERS_INERT_TITLE =
  "Key filters narrow the By key rows — the JSON document is always the whole config";

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
   *  show. Called only once provenance has settled AND is available: a run
   *  whose preset resolution never completed reports nothing, so the badge
   *  stays absent rather than claiming this config has zero options. */
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
  const [query, setQuery] = useState("");
  const [onlyOverridden, setOnlyOverridden] = useState(false);
  // Roadmap 051: the As-JSON rendering and its output options
  const [view, setView] = useState<EffectiveView>("keys");
  const [expand, setExpand] = useState<ResolvedConfigMode>("keep-internal");
  const [includeDefaults, setIncludeDefaults] = useState(false);
  // The rows the table should open — always a fresh set, because its IDENTITY
  // is what the table applies (a run that assigned the same frozen empty set
  // twice would leave the last run's rows open).
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(() => new Set());
  // Roadmap 069 (PR 5): the same walk again, read the other way round — one
  // card per string for the As-JSON document, where the sentences are already
  // on screen and the attribution has nowhere else to live. Gated on the view
  // — unlike `resolvedOutput` below, these cards are only ever read in As-JSON.
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
    setOpenKeys(new Set());
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
  // link promised, and the reader would land on "Nothing matches".
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
        setOpenKeys(new Set([DESCRIPTION_KEY]));
      }
    },
    // Starts at `undefined` rather than at the current nonce, so a nonce that
    // is ALREADY set when this view mounts — the cross-link that switched to
    // this tab — is honoured on the first render instead of adopted as seen.
    () => undefined,
  );

  const entries = useMemo(() => (provenance ? [...provenance.values()] : []), [provenance]);

  /**
   * Roadmap 075 (iteration 5): the rows, cut by WHO DECIDED each key's final
   * value (`features/effective-config/decider-groups.ts` reads that off the
   * chain the engine already built — nothing is recomputed here).
   *
   * Roadmap 082: the default-only rows are in here now. They used to be
   * filtered out of the view entirely until a checkbox asked for them, which
   * meant the tab's headline count and the config Renovate actually runs were
   * two different documents.
   *
   * Roadmap 092: grouped BEFORE filtering, because the table does the filtering
   * now — this is only the order the rows arrive in.
   */
  const sections = useMemo(() => groupByDecider(entries), [entries]);

  /** Roadmap 082 (GAP-3): the group is named after the reader's own `extends`. */
  const presetName = useMemo(
    () => presetDeciderName(topLevelPresetNames(result.presetTree)),
    [result.presetTree],
  );

  const rows = useMemo(
    () => effectiveTableRows(sections, { ruleAttribution, ledger, presetName, onSelectPreset }),
    [sections, ruleAttribution, ledger, presetName, onSelectPreset],
  );

  // Roadmap 032: the view's headline numbers — decided keys, default-only
  // rows, really-overridden rows — in ONE pass over the entries.
  const tallies = useMemo(() => effectiveTally(entries), [entries]);

  // Replay-02 N3: `entries` is empty for BOTH non-values, and `effectiveTally`
  // of nothing is an honest-looking zero. Loading (`undefined`) is a zero that
  // is not known yet; unavailable (`null`) is one that will never become true —
  // reporting either paints "0 effective options" over a panel printing a full
  // config. Stay silent for both: the tab badge and the header digest render
  // nothing without a number, and `run-digest` keeps its "still being counted…"
  // clause — which for an unavailable run never resolves, still open.
  const reportable = !isNullOrUndefined(provenance);
  useEffect(() => {
    if (reportable) {
      onStats?.(tallies);
    }
  }, [reportable, tallies, onStats]);

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

  if (provenance === undefined) {
    return <p className="empty-note">Computing provenance…</p>;
  }

  const jsonView = (
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
  );

  return (
    // No card and no title: the tab strip already says "Effective config", and
    // the table frames itself.
    <>
      <DataTable
        rows={rows}
        columns={EFFECTIVE_COLUMNS}
        groupings={EFFECTIVE_GROUPINGS}
        defaultGroupingId={DECIDED_BY}
        leadLabel="Option"
        rowNoun={EFFECTIVE_NOUN}
        filterPlaceholder="Filter keys…"
        copy={
          resolvedOutput
            ? {
                getText: () => resolvedConfigText(resolvedOutput),
                label: "Copy effective config as JSON",
              }
            : null
        }
        views={EFFECTIVE_VIEWS}
        view={view}
        onViewChange={(id) => {
          if (isEffectiveView(id)) {
            setView(id);
          }
        }}
        altView={jsonView}
        filtersInertTitle={FILTERS_INERT_TITLE}
        quickFilterLabel="only overridden"
        quickFilterOn={onlyOverridden}
        onQuickFilter={setOnlyOverridden}
        query={query}
        onQuery={setQuery}
        openKeys={openKeys}
      />
      {view === "keys" ? (
        <p className="data-table-note">
          {nf.format(entries.length)} options in the config Renovate runs · hover any key for
          Renovate’s docs · defaults have no cascade — only the default ever touched them
        </p>
      ) : null}
    </>
  );
});
