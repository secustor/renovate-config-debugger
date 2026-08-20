import { memo, useMemo, useState } from "react";
import type { PresetNode } from "@renovate-config-debugger/engine";
import { motionScrollOptions } from "@/lib/motion";
import {
  computePresetLedger,
  ledgerCardId,
  type LedgerSource,
  type PresetLedgerModel,
} from "./ledger";
import { LedgerCard } from "./LedgerCard";
import { nf } from "@/lib/format";
import { collectGithubAuthFailures, pluralWord } from "./tree-shared";

/**
 * Roadmap 075 (iteration 5b): the Presets tab's DEFAULT view — the ledger.
 *
 * The tab used to open on the full resolution tree, which at
 * `config:recommended` scale is an inventory of 1,100 rows and not an answer.
 * The ledger answers the question the tab is actually asked: what did my
 * `extends` bring in? One card per top-level source, each stating what it
 * contributed — the options it set, the rule families it is mostly made of —
 * with the tree itself kept, unchanged, one click away.
 *
 * Every number here comes from the same per-run walk the tree renders from
 * (`computeTreeStats` via `computePresetLedger`), so the strip, the tab badge
 * and the header digest cannot disagree.
 */

function defaultOpenIds(model: PresetLedgerModel): ReadonlySet<string> {
  return new Set(model.sources.filter((s) => s.defaultOpen).map((s) => s.nodeId));
}

function LedgerSummary({
  sources,
  presets,
  errors,
  onOpenTree,
  onFocusSource,
}: {
  sources: LedgerSource[];
  presets: number;
  errors: number;
  onOpenTree: () => void;
  onFocusSource: (nodeId: string) => void;
}) {
  return (
    <div className="summary-strip">
      <span>
        <code>extends</code> resolved <strong>{nf.format(sources.length)}</strong>{" "}
        {pluralWord(sources.length, "source")}:
      </span>
      {sources.map((source) => (
        <button
          key={source.nodeId}
          type="button"
          className="preset-token"
          onClick={() => onFocusSource(source.nodeId)}
        >
          {source.name}
        </button>
      ))}
      <span>
        · <strong>{nf.format(presets)}</strong> {pluralWord(presets, "preset")} ·{" "}
        <strong>{nf.format(errors)}</strong> {pluralWord(errors, "error")}
      </span>
      <button type="button" className="btn-quiet" onClick={onOpenTree}>
        open the full tree →
      </button>
    </div>
  );
}

/**
 * The ledger's closing line. A clean expansion says so — "nothing failed,
 * nothing redundant" is the fact a reader came for and would otherwise have to
 * infer from the absence of red. When something DID fail, the strip says what
 * and sends the reader to the tree, which is where a failed node's detail
 * panel (and its sign-in affordance) lives; the run-level auth banner above
 * the tabs states the fixable half of it once, for the whole run.
 */
function LedgerHealth({
  root,
  errors,
  duplicates,
  onOpenTree,
}: {
  root: PresetNode;
  errors: number;
  duplicates: number;
  onOpenTree: () => void;
}) {
  const auth = useMemo(() => collectGithubAuthFailures(root), [root]);
  if (errors === 0) {
    return (
      <div className="summary-strip ledger-health">
        <span>
          ✓ Nothing failed, nothing redundant — <strong>0</strong> errors ·{" "}
          <strong>{nf.format(duplicates)}</strong> repeat {pluralWord(duplicates, "occurrence")}{" "}
          served from cache
        </span>
      </div>
    );
  }
  return (
    <div className="summary-strip ledger-health failed">
      <span>
        <strong>{nf.format(errors)}</strong> {pluralWord(errors, "preset")} could not be resolved
        {auth.failures.length > 0
          ? auth.rateLimited
            ? " — the unauthenticated rate limit was reached; signing in raises it"
            : " — signing in would reach the private ones"
          : ""}
        .
      </span>
      <button type="button" className="btn-quiet" onClick={onOpenTree}>
        open the full tree →
      </button>
    </div>
  );
}

export const PresetLedger = memo(function PresetLedger({
  root,
  onOpenTree,
  onOpenNode,
}: {
  root: PresetNode;
  /** Switches the tab to the full resolution tree. */
  onOpenTree: () => void;
  /** Selects a preset's node — which lands on it in the tree. */
  onOpenNode: (nodeId: string) => void;
}) {
  // Roadmap 032: derived once per RESULT (the model is cached on the tree
  // object itself), so typing in the editor never pays for it.
  const model = useMemo(() => computePresetLedger(root), [root]);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => defaultOpenIds(model));
  // A new run brings a new model — and with it new node ids, so the open set
  // has to start over. During render, not in an effect: the same reason
  // `EffectiveConfig` resets that way (a click landing between the commit and
  // the passive flush would otherwise be wiped).
  const [owner, setOwner] = useState(model);
  if (owner !== model) {
    setOwner(model);
    setOpenIds(defaultOpenIds(model));
  }

  function toggle(nodeId: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  /** The strip's tokens: open that source's card and put it on screen. */
  function focusSource(nodeId: string) {
    setOpenIds((prev) => (prev.has(nodeId) ? prev : new Set(prev).add(nodeId)));
    // The card exists whether or not it is open, so nothing has to wait for a
    // commit here.
    document.getElementById(ledgerCardId(nodeId))?.scrollIntoView(motionScrollOptions("start"));
  }

  return (
    <div className="preset-ledger">
      <LedgerSummary
        sources={model.sources}
        presets={model.summary.resolved}
        errors={model.summary.errors}
        onOpenTree={onOpenTree}
        onFocusSource={focusSource}
      />
      {model.sources.map((source) => (
        <LedgerCard
          key={source.nodeId}
          source={source}
          open={openIds.has(source.nodeId)}
          onToggle={() => toggle(source.nodeId)}
          onOpenNode={onOpenNode}
        />
      ))}
      <LedgerHealth
        root={root}
        errors={model.summary.errors}
        duplicates={model.summary.duplicates}
        onOpenTree={onOpenTree}
      />
    </div>
  );
});
