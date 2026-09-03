import { useState } from "react";
import { nf } from "@/lib/format";
import { MAX_PATTERN_TESTS } from "@/lib/input-schemas";
import { seedValuesFor, type SeedSources } from "./pattern-tests";
import { PatternTestCard } from "./PatternTestCard";
import { usePatternMatcher } from "./use-pattern-matcher";
import type { PatternTest } from "@/types/simulator";

/**
 * Roadmap 094 — the Tests tab's second group, as the design's `Pattern Tests`
 * artboard draws it: a strip, one card per test, the empty note, and the
 * ghost row that starts a new one. A pattern test is re-evaluated on every
 * render against Renovate's own list matcher, which makes "re-tested against
 * your config on every Run" true by construction rather than by a hook.
 *
 * One card is open at a time (the design's accordion): the one the reader
 * just added, or the one they last opened. The shell owns the list; this
 * component owns only which card is open.
 */
export function PatternTests({
  tests,
  seedSources,
  onAdd,
  onUpdate,
  onRemove,
}: {
  tests: readonly PatternTest[];
  seedSources: SeedSources;
  onAdd: () => string | null;
  onUpdate: (id: string, update: (test: PatternTest) => PatternTest) => void;
  onRemove: (id: string) => void;
}) {
  const matcher = usePatternMatcher();
  const [openId, setOpenId] = useState<string | null>(null);
  const atCap = tests.length >= MAX_PATTERN_TESTS;
  function add() {
    const id = onAdd();
    if (id !== null) {
      setOpenId(id);
    }
  }
  return (
    <section className="pattern-tests" aria-labelledby="pattern-tests-title">
      <div className="summary-strip">
        <span id="pattern-tests-title">
          <strong>{nf.format(tests.length)}</strong> pattern {tests.length === 1 ? "test" : "tests"}
        </span>
        <span className="pins-strip-note">re-tested against your config on every Run</span>
      </div>
      {tests.map((test) => (
        <PatternTestCard
          key={test.id}
          test={test}
          matcher={matcher}
          seeds={seedValuesFor(test.option, seedSources)}
          open={openId === test.id}
          onToggle={() => setOpenId((current) => (current === test.id ? null : test.id))}
          onUpdate={(update) => onUpdate(test.id, update)}
          onRemove={() => onRemove(test.id)}
        />
      ))}
      {tests.length === 0 ? (
        <p className="pattern-empty">
          No pattern tests yet — try a <code>match*</code> pattern against the strings it should and
          should not match, before it goes into a rule.
        </p>
      ) : null}
      <button
        type="button"
        className="pattern-add-ghost"
        onClick={add}
        disabled={atCap}
        title={atCap ? `At most ${MAX_PATTERN_TESTS} pattern tests` : undefined}
      >
        + Test a pattern…{" "}
        <span className="pin-add-ghost-hint">
          pick an option, add patterns and the inputs they should (not) match
        </span>
      </button>
    </section>
  );
}
