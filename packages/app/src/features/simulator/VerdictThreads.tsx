import type { ProvenanceLayer } from "@renovate-config-visualizer/engine";
import { OptionKey } from "@/components/option-docs";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import { previewValue } from "./rule-format";
import { ThreadBody, type ThreadActions } from "./ThreadBody";
import { threadHeadId } from "./use-thread-nav";
import type { ThreadModel } from "./verdict-threads";

/**
 * Roadmap 054 (variant A): the verdict card's ledger IS the trace. Collapsed,
 * it reads as the 046 ledger did — the settings the rules changed, their final
 * values, where each came from — but every row expands into that key's own
 * causal thread (`ThreadBody`), so the three grains the 047 layout re-stated
 * (ledger, per-rule applied list, step diff) collapse into one place per fact.
 *
 * Rows share the list's columns via `subgrid`, so values start on one common
 * edge instead of wherever the key happens to end.
 */

/** The key cell: the disclosure caret plus the option name, with its docs
 *  hover card intact (`OptionKey` is a plain span, safe inside the button). */
function ThreadHeadKey({ name, open }: { name: string; open: boolean }) {
  return (
    <span className="sim-thread-key">
      <span className="sim-thread-caret">{open ? "▾" : "▸"}</span>{" "}
      <code>
        <OptionKey name={name} flagUnknown />
      </code>
    </span>
  );
}

/** The value cell: what the config ends up with, and — the case the 046 ledger
 *  made invisible — a badge when more than one stop wrote this key. */
function ThreadHeadValue({ thread }: { thread: ThreadModel }) {
  return (
    <span className="sim-thread-value">
      {thread.present ? (
        <span className="sim-thread-final">{previewValue(thread.finalValue, 80)}</span>
      ) : (
        <span className="sim-thread-final removed">removed</span>
      )}
      {thread.writerCount > 1 ? (
        <span className="badge count sim-thread-writers">{thread.writerCount} writers</span>
      ) : null}
    </span>
  );
}

/** The origin cell — kept as a cell even when empty so the column holds.
 *  Roadmap 054 layer 3: a DOT here, not the full chip. Collapsed, the column
 *  is read as "same origin or not?" down the ledger, which is exactly what a
 *  hue answers; the label stays one hover (or one expansion, where the writer
 *  line wears the full chip) away. */
function ThreadHeadOrigin({
  layer,
  onSelectPreset,
}: {
  layer?: ProvenanceLayer;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <span className="sim-thread-origin">
      {layer ? (
        <ProvenanceChip layer={layer} onSelectPreset={onSelectPreset} variant="dot" />
      ) : null}
    </span>
  );
}

/**
 * Roadmap 054 layer 4: expansion moved OUT of the row. Two things outside a
 * row now open one — a share link's `simThread` and the return pill — and the
 * copy-link affordance has to know which thread is open to encode it, so the
 * state belongs to the simulator (see `use-thread-nav`). A re-simulation still
 * collapses everything, which is the honest state for a new run's evidence.
 */
export interface ThreadNavigation {
  open: ReadonlySet<string>;
  onToggle: (key: string, open: boolean) => void;
  /** A jump out of a thread — recorded so the pill can point back at it. */
  onJumpFrom: (key: string) => void;
}

/** Every jump a thread offers records that thread as the return target first.
 *  Wrapped once per row, so the pill's origin can never disagree with the row
 *  the reader actually left — the alternative is each jump site remembering to
 *  say where it is, which is the kind of thing that stays right for one
 *  release. */
function withJumpOrigin(
  key: string,
  actions: ThreadActions,
  onJumpFrom: (key: string) => void,
): ThreadActions {
  const wrapped: ThreadActions = { ...actions };
  const { onJumpToStep, onOpenRule } = actions;
  if (onJumpToStep) {
    wrapped.onJumpToStep = (stopIndex) => {
      onJumpFrom(key);
      onJumpToStep(stopIndex);
    };
  }
  if (onOpenRule) {
    wrapped.onOpenRule = (ruleIndex) => {
      onJumpFrom(key);
      onOpenRule(ruleIndex);
    };
  }
  return wrapped;
}

/** One thread: the collapsed head button, and the body it discloses. */
function ThreadRow({
  thread,
  actions,
  nav,
}: {
  thread: ThreadModel;
  actions: ThreadActions;
  nav: ThreadNavigation;
}) {
  const open = nav.open.has(thread.key);
  return (
    <li className={`sim-thread${open ? " open" : ""}`}>
      <button
        type="button"
        id={threadHeadId(thread.key)}
        className="kv-row sim-thread-head"
        aria-expanded={open}
        onClick={() => nav.onToggle(thread.key, !open)}
      >
        <ThreadHeadKey name={thread.key} open={open} />
        <ThreadHeadValue thread={thread} />
        <ThreadHeadOrigin layer={thread.winner?.layer} onSelectPreset={actions.onSelectPreset} />
      </button>
      {open ? (
        <ThreadBody thread={thread} actions={withJumpOrigin(thread.key, actions, nav.onJumpFrom)} />
      ) : null}
    </li>
  );
}

export function VerdictThreads({
  threads,
  actions,
  nav,
}: {
  threads: ThreadModel[];
  actions: ThreadActions;
  nav: ThreadNavigation;
}) {
  return (
    <ul className="kv sim-thread-list">
      {threads.map((thread) => (
        <ThreadRow key={thread.key} thread={thread} actions={actions} nav={nav} />
      ))}
    </ul>
  );
}
