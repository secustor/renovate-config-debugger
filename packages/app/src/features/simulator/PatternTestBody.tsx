import { PatternAddLine } from "./PatternAddLine";
import { expectationFor, type PatternMatcher, type PatternTestEvaluation } from "./pattern-tests";
import { InputRow, PatternRow } from "./PatternTestRows";
import { MAX_PATTERN_INPUTS, MAX_PATTERNS_PER_TEST } from "@/lib/input-schemas";
import { nf } from "@/lib/format";
import type { PatternTest } from "@/types/simulator";

/**
 * Roadmap 094: the open card — patterns on the left, inputs with their
 * expectations on the right, each column with its add line. Every edit goes
 * through `onUpdate` as a pure transform of the test, so the shell owns the
 * list and this file owns nothing.
 */

type Update = (update: (test: PatternTest) => PatternTest) => void;

function PatternColumn({
  test,
  evaluation,
  onUpdate,
}: {
  test: PatternTest;
  evaluation: PatternTestEvaluation;
  onUpdate: Update;
}) {
  const full = test.patterns.length >= MAX_PATTERNS_PER_TEST;
  return (
    <div className="pattern-col">
      <p className="pin-evidence-title">Patterns</p>
      {evaluation.patterns.map((verdict, i) => (
        <PatternRow
          // Patterns are editable in place, so the value is not an identity —
          // the position is. Rows are only ever appended or removed.
          // oxlint-disable-next-line react/no-array-index-key -- see above
          key={i}
          verdict={verdict}
          index={i}
          onChange={(value) =>
            onUpdate((t) => ({ ...t, patterns: t.patterns.map((p, j) => (j === i ? value : p)) }))
          }
          onRemove={() =>
            onUpdate((t) => ({ ...t, patterns: t.patterns.filter((_, j) => j !== i) }))
          }
        />
      ))}
      {full ? null : (
        <PatternAddLine
          label="Add a pattern"
          placeholder="add pattern ⏎"
          onAdd={(value) => onUpdate((t) => ({ ...t, patterns: [...t.patterns, value] }))}
        />
      )}
      <p className="pattern-rule">
        ≥1 positive must match · no <code>!negative</code> may match
      </p>
    </div>
  );
}

function InputColumn({
  test,
  evaluation,
  matcher,
  seeds,
  onUpdate,
}: {
  test: PatternTest;
  evaluation: PatternTestEvaluation;
  matcher: PatternMatcher;
  seeds: readonly string[];
  onUpdate: Update;
}) {
  const room = MAX_PATTERN_INPUTS - test.inputs.length;
  const fresh = seeds.filter((value) => !test.inputs.some((input) => input.value === value));
  const offered = fresh.slice(0, Math.max(room, 0));
  function add(values: readonly string[]) {
    onUpdate((t) => ({
      ...t,
      inputs: [
        ...t.inputs,
        ...values.map((value) => ({
          value,
          expect: expectationFor(matcher.explain, t.patterns, value),
        })),
      ],
    }));
  }
  return (
    <div className="pattern-col">
      <p className="pin-evidence-title">Inputs · expectation</p>
      {evaluation.inputs.map((verdict, i) => (
        <InputRow
          // oxlint-disable-next-line react/no-array-index-key -- editable in place; position is the identity
          key={i}
          verdict={verdict}
          index={i}
          onChange={(value) =>
            onUpdate((t) => ({
              ...t,
              inputs: t.inputs.map((input, j) => (j === i ? { ...input, value } : input)),
            }))
          }
          onFlip={() =>
            onUpdate((t) => ({
              ...t,
              inputs: t.inputs.map((input, j) =>
                j === i ? { ...input, expect: !input.expect } : input,
              ),
            }))
          }
          onRemove={() => onUpdate((t) => ({ ...t, inputs: t.inputs.filter((_, j) => j !== i) }))}
        />
      ))}
      {room > 0 ? (
        <PatternAddLine
          label="Add an input"
          placeholder="add input ⏎"
          onAdd={(value) => add([value])}
        />
      ) : null}
      {offered.length > 0 ? (
        <button type="button" className="btn-quiet pattern-seed" onClick={() => add(offered)}>
          + add the {nf.format(offered.length)} values from your last run
        </button>
      ) : null}
    </div>
  );
}

export function PatternTestBody({
  test,
  evaluation,
  matcher,
  seeds,
  onUpdate,
}: {
  test: PatternTest;
  evaluation: PatternTestEvaluation;
  matcher: PatternMatcher;
  seeds: readonly string[];
  onUpdate: Update;
}) {
  return (
    <div className="pattern-body">
      <PatternColumn test={test} evaluation={evaluation} onUpdate={onUpdate} />
      <InputColumn
        test={test}
        evaluation={evaluation}
        matcher={matcher}
        seeds={seeds}
        onUpdate={onUpdate}
      />
    </div>
  );
}
