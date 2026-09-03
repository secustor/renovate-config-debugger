import { useMemo } from "react";
import { Caret } from "@/components/Caret";
import {
  evaluatePatternTest,
  type PatternMatcher,
  type PatternTestEvaluation,
  type PatternTestTone,
} from "./pattern-tests";
import { PatternTestBody } from "./PatternTestBody";
import type { PatternTest } from "@/types/simulator";

/**
 * Roadmap 094: one pattern test as a card in the pin grammar — a head row
 * that answers at a glance (caret, dot, the option, the patterns while
 * collapsed, the `N of M expected` sentence) and the two-column body when
 * open. The option is a native `<select>` beside the toggle rather than the
 * design's searchable popover: eleven names, and a real select is the more
 * accessible control for a list that short.
 */

const DOT_TITLE: Record<PatternTestTone, string> = {
  ok: "every input behaves as expected",
  error: "an input does not behave as expected",
  pending: "no inputs to check yet",
};

function OptionPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly string[];
  onChange: (option: string) => void;
}) {
  // An option a newer app's link named, which this Renovate lacks, is still
  // shown — the reader must see what the test is about to fix it.
  const known = value === "" || options.includes(value) ? options : [value, ...options];
  return (
    <select
      className={value === "" ? "pattern-option pattern-option-unset" : "pattern-option"}
      aria-label="Option this test is for"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">pick option…</option>
      {known.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function PatternTestHead({
  test,
  evaluation,
  options,
  open,
  onToggle,
  onOption,
  onRemove,
}: {
  test: PatternTest;
  evaluation: PatternTestEvaluation | null;
  options: readonly string[];
  open: boolean;
  onToggle: () => void;
  onOption: (option: string) => void;
  onRemove: () => void;
}) {
  const tone = evaluation?.tone ?? "pending";
  const name = test.option === "" ? "an unnamed option" : test.option;
  return (
    <div className="pin-head">
      <button
        type="button"
        className="pin-head-toggle pattern-head-toggle"
        aria-expanded={open}
        aria-label={`${open ? "Collapse" : "Expand"} the pattern test for ${name}`}
        onClick={onToggle}
      >
        <Caret open={open} />
        <span className={`pin-dot ${tone}`} title={DOT_TITLE[tone]} />
      </button>
      <OptionPicker value={test.option} options={options} onChange={onOption} />
      {/* The rest of the row is a pointer-only mirror of the toggle above — one
          control for assistive tech, the whole row as a target for a mouse. */}
      <span className="pattern-head-rest" aria-hidden="true" onClick={onToggle}>
        {open
          ? null
          : test.patterns.map((pattern, i) => (
              // oxlint-disable-next-line react/no-array-index-key -- a duplicate pattern is legal; position is the identity
              <code key={i} className="pattern-head-pattern">
                {pattern}
              </code>
            ))}
        <span
          className={
            evaluation?.tone === "error" ? "pin-summary pattern-summary-fail" : "pin-summary"
          }
        >
          {evaluation === null ? "checking…" : evaluation.summary}
        </span>
      </span>
      <button
        type="button"
        className="pin-remove"
        onClick={onRemove}
        title="Remove this test"
        aria-label={`Remove the pattern test for ${name}`}
      >
        ×
      </button>
    </div>
  );
}

export function PatternTestCard({
  test,
  matcher,
  seeds,
  open,
  onToggle,
  onUpdate,
  onRemove,
}: {
  test: PatternTest;
  matcher: PatternMatcher | null;
  /** Values the last run offers as inputs for this test's option. */
  seeds: readonly string[];
  open: boolean;
  onToggle: () => void;
  onUpdate: (update: (test: PatternTest) => PatternTest) => void;
  onRemove: () => void;
}) {
  const evaluation = useMemo(
    () => (matcher ? evaluatePatternTest(matcher, test) : null),
    [matcher, test],
  );
  return (
    <div className="card pattern-card">
      <PatternTestHead
        test={test}
        evaluation={evaluation}
        options={matcher?.options ?? []}
        open={open}
        onToggle={onToggle}
        onOption={(option) => onUpdate((t) => ({ ...t, option }))}
        onRemove={onRemove}
      />
      {open && matcher && evaluation ? (
        <PatternTestBody
          test={test}
          evaluation={evaluation}
          matcher={matcher}
          seeds={seeds}
          onUpdate={onUpdate}
        />
      ) : null}
    </div>
  );
}
