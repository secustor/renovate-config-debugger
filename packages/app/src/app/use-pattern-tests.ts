import { useCallback, useRef, useState } from "react";
import {
  newPatternTest,
  patternTestShareFields,
  patternTestsFromShare,
} from "@/features/simulator/pattern-tests";
import { MAX_PATTERN_TESTS } from "@/lib/input-schemas";
import type { SharePatternTest } from "@/lib/input-schemas-zod";
import type { PatternTest } from "@/types/simulator";

/**
 * Roadmap 094 — the pattern tests as one hook, the shape `usePinnedRun` set:
 * the list, the ids minted for it, the edits, and both halves of the share
 * round trip. Owned by the shell for the two reasons pins are: a link carries
 * them, and the Tests tab's badge counts them. What a test MEANS is the
 * feature's (`features/simulator/pattern-tests.ts`); the evaluation is the
 * card's, per render, since it is a handful of matcher calls.
 */
export interface PatternTestsState {
  patternTests: PatternTest[];
  /** Appends an empty test (no-op at the cap) and returns its id, so the
   *  card that opens for it can be the one the reader just asked for. */
  addPatternTest: () => string | null;
  updatePatternTest: (id: string, update: (test: PatternTest) => PatternTest) => void;
  removePatternTest: (id: string) => void;
  /** The decode side: the link's tests, with ids minted here. Called with
   *  `[]` when the link carries none — a link installs the screen it
   *  describes. */
  setPatternTestsFromShare: (shared: SharePatternTest[]) => void;
  /** The encode side — a function, so nothing is serialized until a link is
   *  built. */
  patternTestsAsShare: () => SharePatternTest[];
}

export function usePatternTests(): PatternTestsState {
  const [patternTests, setPatternTests] = useState<PatternTest[]>([]);
  const seqRef = useRef(0);
  const nextId = useCallback(() => `pattern-${++seqRef.current}`, []);

  const addPatternTest = useCallback((): string | null => {
    if (patternTests.length >= MAX_PATTERN_TESTS) {
      return null;
    }
    const id = nextId();
    setPatternTests((prev) =>
      prev.length >= MAX_PATTERN_TESTS ? prev : [...prev, newPatternTest(id)],
    );
    return id;
  }, [nextId, patternTests.length]);

  const updatePatternTest = useCallback(
    (id: string, update: (test: PatternTest) => PatternTest) => {
      setPatternTests((prev) => prev.map((test) => (test.id === id ? update(test) : test)));
    },
    [],
  );

  const removePatternTest = useCallback((id: string) => {
    setPatternTests((prev) => prev.filter((test) => test.id !== id));
  }, []);

  const setPatternTestsFromShare = useCallback(
    (shared: SharePatternTest[]) => {
      setPatternTests(patternTestsFromShare(shared, nextId));
    },
    [nextId],
  );

  const patternTestsAsShare = useCallback(
    () => patternTests.map(patternTestShareFields),
    [patternTests],
  );

  return {
    patternTests,
    addPatternTest,
    updatePatternTest,
    removePatternTest,
    setPatternTestsFromShare,
    patternTestsAsShare,
  };
}
