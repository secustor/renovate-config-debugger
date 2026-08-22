import { memo, useMemo, useState } from "react";
import type { PresetNode } from "@renovate-config-debugger/engine";
import { computePresetLedger, CONFIG_PRESETS_DOCS, type LedgerErrorRow } from "./ledger";
import { LedgerCard } from "./LedgerCard";
import { PresetName } from "@/components/PresetName";
import { nf, plural } from "@/lib/format";
import { pluralWord } from "./tree-shared";

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

/** Every card starts shut — the final design's own state (its source cards
 *  begin closed), and the card HEADER already answers the tab's question: the
 *  source, its counts, its docs. The body is detail the reader asks for. */
const NO_OPEN_CARDS: ReadonlySet<string> = new Set();

/**
 * The strip: three counts and the way into the tree.
 *
 * Roadmap 082 took the source TOKENS out of it. The strip used to list every
 * top-level `extends` entry as a `PresetName` that scrolled to its card — but
 * the cards are directly below, wearing the same names in the same tokens, so
 * the strip was a table of contents for a list one screen long. What it is for
 * is the three numbers: how many entries, what they expanded into, and whether
 * any of it failed.
 */
function LedgerSummary({
  sources,
  presets,
  errors,
  onOpenTree,
}: {
  sources: number;
  presets: number;
  errors: number;
  onOpenTree: () => void;
}) {
  return (
    <div className="summary-strip">
      <span>
        <code>extends</code> resolved <strong>{nf.format(sources)}</strong>{" "}
        {pluralWord(sources, "source")} into <strong>{nf.format(presets)}</strong>{" "}
        {pluralWord(presets, "preset")} ·
      </span>
      {/* Roadmap 082: the error count is a red PILL the moment there is one —
          the strip is otherwise all muted text, and a run that failed to fetch
          a preset must not have to be read to be noticed. Zero stays text: a
          pill saying "0 errors" is an alarm about nothing. */}
      {errors > 0 ? (
        <span className="pill pill-error">{plural(errors, "error")}</span>
      ) : (
        <span>
          <strong>0</strong> errors
        </span>
      )}
      <button type="button" className="btn-quiet" onClick={onOpenTree}>
        open the full tree →
      </button>
    </div>
  );
}

/** The design's two phrasings, plus the one it has no mock data for: the
 *  reader's OWN `extends` entry failing, which is the commonest single-error
 *  run there is (a typo in a preset name). What each one claims is in its
 *  title — the note is three words and the claim behind it is not. */
const VIA_TEXT: Record<LedgerErrorRow["via"], { text: string; title: string }> = {
  config: {
    text: "in your config",
    title: "An entry of your own extends — this name is in the config you ran",
  },
  own: {
    text: "via your preset",
    title: "Pulled in below a top-level entry that is a preset you host",
  },
  extends: {
    text: "via extends",
    title: "Reached through a preset's own extends, not written in your config",
  },
};

/** One failed preset: the reference, what went wrong, and where it came from. */
function LedgerErrorLine({
  row,
  onOpenNode,
}: {
  row: LedgerErrorRow;
  onOpenNode: (nodeId: string) => void;
}) {
  const via = VIA_TEXT[row.via];
  return (
    <div className="ledger-error-row">
      <PresetName name={row.name} nodeId={row.nodeId} onClick={() => onOpenNode(row.nodeId)} />
      <span className="ledger-error-message">{row.message}</span>
      <span className="ledger-error-via" title={via.title}>
        {via.text}
      </span>
    </div>
  );
}

/**
 * The failed box's header: the count, the cache line, the hint that says which
 * failures a sign-in would fix — and, outside the toggle (an anchor inside a
 * button is not a control), the docs link, exactly as the ledger cards do it.
 */
function LedgerHealthHead({
  errors,
  duplicates,
  authHint,
  open,
  onToggle,
}: {
  errors: number;
  duplicates: number;
  authHint: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="ledger-health-head">
      <button
        type="button"
        className="ledger-health-toggle"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="caret">{open ? "▾" : "▸"}</span>
        <span className="ledger-health-count">✗ {plural(errors, "error")}</span>
        <span className="ledger-health-note">
          · {nf.format(duplicates)} repeat {pluralWord(duplicates, "occurrence")} served from cache
          {authHint}
        </span>
      </button>
      <a className="ledger-docs" href={CONFIG_PRESETS_DOCS} target="_blank" rel="noreferrer">
        docs ↗
      </a>
    </div>
  );
}

/**
 * The ledger's closing line. A clean expansion says so — "nothing failed,
 * nothing redundant" is the fact a reader came for and would otherwise have to
 * infer from the absence of red.
 *
 * Roadmap 082: when something DID fail, the line becomes a red box that names
 * the failures instead of only counting them. The previous version reported "N
 * presets could not be resolved" and sent the reader to the tree to find out
 * WHICH — a 1,100-row inventory to answer a question the run already knows the
 * answer to. Every row carries the standard `PresetName`, so the hover card and
 * the jump into the tree come for free; the auth hint (009) stays on the header
 * line, where it is legible with the box still shut, and the run-level banner
 * above the tabs states the same fixable half once for the whole run.
 */
function LedgerHealth({
  errors,
  duplicates,
  onOpenNode,
}: {
  errors: LedgerErrorRow[];
  duplicates: number;
  onOpenNode: (nodeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (errors.length === 0) {
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
  const authFixable = errors.some((row) => row.authFixable);
  const authHint = authFixable
    ? errors.some((row) => row.rateLimited)
      ? " · the unauthenticated rate limit was reached; signing in raises it"
      : " · signing in would reach the private ones"
    : "";
  return (
    <div className="ledger-health failed">
      <LedgerHealthHead
        errors={errors.length}
        duplicates={duplicates}
        authHint={authHint}
        open={open}
        onToggle={() => setOpen((prev) => !prev)}
      />
      {open ? (
        <div className="ledger-error-rows">
          {errors.map((row) => (
            <LedgerErrorLine key={row.nodeId} row={row} onOpenNode={onOpenNode} />
          ))}
        </div>
      ) : null}
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
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(NO_OPEN_CARDS);
  // A new run brings a new model — and with it new node ids, so the open set
  // has to start over. During render, not in an effect: the same reason
  // `EffectiveConfig` resets that way (a click landing between the commit and
  // the passive flush would otherwise be wiped).
  const [owner, setOwner] = useState(model);
  if (owner !== model) {
    setOwner(model);
    setOpenIds(NO_OPEN_CARDS);
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

  return (
    <div className="preset-ledger">
      <LedgerSummary
        sources={model.sources.length}
        presets={model.summary.resolved}
        errors={model.summary.errors}
        onOpenTree={onOpenTree}
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
        errors={model.errors}
        duplicates={model.summary.duplicates}
        onOpenNode={onOpenNode}
      />
    </div>
  );
});
