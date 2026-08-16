import type {
  ConfigKeyDelta,
  DependencyDescriptor,
  RuleRef,
  SimulationComparison,
} from "@renovate-config-debugger/engine";
import { toDescriptor } from "./form";
import { previewValue, writeMark } from "./rule-format";
import { descriptorDiffKeys, type PinnedRun } from "./use-ab-comparison";
import { WriteRow, type WriteValue } from "./WriteRow";

/** Roadmap 021: one column ("A (pinned)" / "B (current)") of the A/B input
 *  descriptor comparison — every field the simulator actually sent the
 *  engine, with the fields that differ from the other column called out. */
function DescriptorList({
  title,
  descriptor,
  diffKeys,
}: {
  title: string;
  descriptor: DependencyDescriptor;
  diffKeys: Set<string>;
}) {
  const entries = Object.entries(descriptor).filter(([, v]) => v !== undefined);
  return (
    <div className="sim-compare-col">
      <div className="sim-compare-col-title">{title}</div>
      {entries.length === 0 ? (
        <p className="empty-note">no fields set</p>
      ) : (
        <ul>
          {entries.map(([key, value]) => (
            <li key={key} className={diffKeys.has(key) ? "sim-input-diff" : undefined}>
              <code>{key}</code>: {previewValue(value, 60)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Roadmap 018: one of the three matched-rule columns in the A/B comparison. */
function RuleDeltaList({
  title,
  refs,
  kind,
}: {
  title: string;
  refs: RuleRef[];
  kind: "only-a" | "only-b" | "both";
}) {
  return (
    <div className={`sim-compare-col ${kind}`}>
      <div className="sim-compare-col-title">
        {title} <span className="count">{refs.length}</span>
      </div>
      {refs.length === 0 ? (
        <p className="empty-note">none</p>
      ) : (
        <ul>
          {refs.map((r) => (
            <li key={`${r.index}-${r.signature}`}>
              <span className="sim-rule-index">packageRules[{r.index}]</span> <code>{r.label}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Roadmap 018: the final-config key delta — the settings A and B actually
 *  disagree on, or an explicit "only the matched-rule set differs". Each row is
 *  the shared write row (054 layer 7); a key that exists on only one side keeps
 *  this panel's own sentinels, since `(unset)` and `(removed)` are words, not
 *  values the config carries. */
/** Replay-02 N8: one side of a delta row. An inherited value — present in the
 *  run's final config but written by NO merge step — is a Renovate default,
 *  not something the config set; rendering it as a bare value asserted an
 *  explicit `automerge: false` that A's own field list (correctly) never
 *  showed. Words, not JSON, so it can't be read as a value the config carries. */
function deltaSide(
  value: unknown,
  present: boolean,
  inherited: boolean | undefined,
  absent: string,
  run: "A" | "B",
): WriteValue {
  if (!present) {
    return { text: absent };
  }
  if (inherited) {
    return { text: `${previewValue(value, 60)} (default — not set in ${run})` };
  }
  return { json: value };
}

function ConfigDeltaSection({ configDelta }: { configDelta: ConfigKeyDelta[] }) {
  return (
    <div className="sim-compare-config">
      <div className="sim-merged-title">Final per-dependency config changes</div>
      {configDelta.length > 0 ? (
        <div className="kv sim-writes">
          {configDelta.map((d) => (
            <WriteRow
              key={d.key}
              name={d.key}
              mark={writeMark(d.inA, d.inB)}
              before={deltaSide(d.a, d.inA, d.aInherited, "(unset)", "A")}
              after={deltaSide(d.b, d.inB, d.bInherited, "(removed)", "B")}
              // Prose Renovate accumulates from every matched rule: it moves
              // whenever the matched-rule set does, and on its own it is not a
              // behavioral difference.
              note={d.kind === "documentation" ? "documentation text" : undefined}
            />
          ))}
        </div>
      ) : (
        <p className="empty-note">
          Final per-dependency config is identical — only the matched-rule set differs.
        </p>
      )}
    </div>
  );
}

/**
 * The verdict, in the comparison's OWN words (`netEffect`) rather than a
 * sentence this panel invents — the app used to assert "a rule's pattern text
 * changed" for every behavior-preserving edit, including ones that added a
 * clause. Three states: identical, documentation-only (prose moved, behavior
 * did not — the delta is still shown, so the reader can see what), and differs.
 */
function ComparisonBody({ comparison }: { comparison: SimulationComparison }) {
  if (comparison.verdict === "identical") {
    return <p className="sim-compare-nochange">No behavioral change — {comparison.netEffect}.</p>;
  }
  if (comparison.verdict === "documentation-only") {
    return (
      <>
        <p className="sim-compare-nochange">No behavioral change — {comparison.netEffect}.</p>
        <ConfigDeltaSection configDelta={comparison.configDelta} />
      </>
    );
  }
  return (
    <>
      <div className="sim-compare-rules">
        <RuleDeltaList
          title="Only in A (stopped matching)"
          refs={comparison.stoppedMatching}
          kind="only-a"
        />
        <RuleDeltaList
          title="Only in B (now matching)"
          refs={comparison.startedMatching}
          kind="only-b"
        />
        <RuleDeltaList title="Matched in both" refs={comparison.matchedInBoth} kind="both" />
      </div>
      <ConfigDeltaSection configDelta={comparison.configDelta} />
    </>
  );
}

/**
 * Roadmap 018: the A/B comparison panel. `comparison` is null while a result is
 * pinned but no NEW simulation has replaced it yet (a "waiting" hint shows);
 * once a fresh run produces B, it renders the matched-rule set delta, the
 * final-config key delta, and an explicit "no behavioral change" verdict when
 * both are identical.
 *
 * Roadmap 021: A and B can come from simulating two entirely different
 * hypothetical dependencies (pin a lodash run, then quick-fill a Docker
 * image and re-simulate) — the delta above would render as if it were a
 * config edit, with no hint that the INPUTS changed too. `currentDescriptor`
 * is always what actually produced `sim` (or, before any run since the pin,
 * the live form) so the two input sets can be shown and diffed regardless of
 * whether `comparison` exists yet.
 */
export function ComparisonPanel({
  pinned,
  comparison,
  currentDescriptor,
  awaitingSimulate,
  onUnpin,
}: {
  pinned: PinnedRun;
  comparison: SimulationComparison | null;
  currentDescriptor: DependencyDescriptor;
  /** A new pipeline run cleared the simulation this panel used to sit under —
   *  A is kept, and the hint names the one step left (Simulate). */
  awaitingSimulate?: boolean;
  /** The panel's own Unpin — needed while `awaitingSimulate`, when the verdict
   *  card (the usual home of the pin controls) is not rendered at all. */
  onUnpin?: () => void;
}) {
  const pinnedDescriptor = toDescriptor(pinned.form, pinned.effectiveUpdateType);
  const diffKeys = new Set(descriptorDiffKeys(pinnedDescriptor, currentDescriptor));
  return (
    <div className="sim-compare">
      <div className="sim-compare-title">
        A/B comparison — pinned (A) vs current (B)
        {onUnpin ? (
          <button type="button" className="sim-verdict-action" onClick={onUnpin}>
            Unpin comparison
          </button>
        ) : null}
      </div>
      {diffKeys.size > 0 ? (
        <p className="sim-compare-mismatch">
          ⚠ Inputs differ between A and B — this compares two different simulated dependencies, not
          just a config edit. Differing fields:{" "}
          {[...diffKeys].map((k, i) => (
            <span key={k}>
              {i > 0 ? ", " : null}
              <code>{k}</code>
            </span>
          ))}
        </p>
      ) : null}
      {!comparison && awaitingSimulate ? (
        <p className="empty-note">
          Result <strong>A</strong> is still pinned — the pipeline ran with the edited config.
          Simulate to produce <strong>B</strong> and see the comparison.
        </p>
      ) : !comparison ? (
        <p className="empty-note">
          Pinned this result as <strong>A</strong>. Edit the config and run the pipeline again, then
          simulate to compare it against <strong>B</strong>.
        </p>
      ) : (
        <ComparisonBody comparison={comparison} />
      )}
      <details className="sim-compare-inputs" open={diffKeys.size > 0}>
        <summary>Inputs compared</summary>
        <div className="sim-compare-rules">
          <DescriptorList title="A (pinned)" descriptor={pinnedDescriptor} diffKeys={diffKeys} />
          <DescriptorList title="B (current)" descriptor={currentDescriptor} diffKeys={diffKeys} />
        </div>
      </details>
    </div>
  );
}
