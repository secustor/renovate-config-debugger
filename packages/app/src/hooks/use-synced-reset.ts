import { useState } from "react";

/**
 * "When this identity changes, throw the state derived from it away" — during
 * RENDER, not in an effect.
 *
 * Eighteen sites had hand-rolled it, each as the same five lines
 * (`const [owner, setOwner] = useState(x); if (owner !== x) { setOwner(x); …
 * reset … }`) and each carrying its own paragraph re-arguing the during-render
 * part. This repo has twice answered that recurrence the same way —
 * `use-toggle-set.ts` ("Six components had written the same…") and
 * `use-transient-flag.ts` ("Four sites hand-rolled…").
 *
 * WHY DURING RENDER, once, instead of eighteen times:
 *
 * An effect runs after the commit. Anything the user does in the window
 * between that commit and the passive flush — a click landing on the freshly
 * painted row — is enqueued first and then wiped by the reset that arrives
 * afterwards. The user's action is silently undone. `EffectiveConfig`'s
 * comments record CI catching exactly that as "the expanded description row
 * rendered no ledger", and `PresetsPanel`'s record the sibling case, where an
 * effect put the tree one commit behind the selection App was already polling
 * the DOM for.
 *
 * React supports this deliberately: a component may set its own state while
 * rendering, and React re-runs the component immediately with the new state
 * before touching the DOM. No extra commit, no paint in between.
 *
 * The reset callback therefore runs DURING RENDER and must be pure in the React
 * sense — `setState` calls on this same component only, no DOM reads, no
 * subscriptions, nothing async. Every call site here does exactly that.
 *
 * Two calls in one component stay two calls, in source order, because the
 * order is sometimes load-bearing: `EffectiveConfig` resets on a new run and
 * then applies a landing nonce, and the nonce must win.
 */
export function useSyncedReset<T>(
  value: T,
  onChange: () => void,
  /**
   * The owner's starting value, when it must differ from `value`.
   *
   * Passed as a thunk so it is unambiguous: `undefined` is a legitimate owner
   * value (`EffectiveConfig`'s nonce owner starts there ON PURPOSE, so that a
   * nonce already set when the view mounts — the cross-link that switched to
   * this tab — is honoured on the very first render, instead of being adopted
   * silently as "already seen"). An optional plain value could not tell "start
   * at undefined" apart from "not given".
   */
  initialOwner?: () => T,
): void {
  const [owner, setOwner] = useState<T>(initialOwner ?? (() => value));
  if (!Object.is(owner, value)) {
    setOwner(value);
    onChange();
  }
}
