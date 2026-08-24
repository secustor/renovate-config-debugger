import { MAX_PINS } from "./pins";

/**
 * The two notes both descriptor forms wear — the simulator's own and the Tests
 * tab's "Add a test" box. They were spelled out twice, word for word, in two
 * files; one copy is one copy, and the caller still decides whether the note is
 * on screen.
 */

/** Roadmap 015's empty-form guard — it replaces a would-be "0 of N rules
 *  matched" wall of no-matches with a plain nudge. */
export function EmptyFormGuard() {
  return (
    <p className="sim-empty-guard">
      Pick an example above, or fill in a package name (or another identifying field) — an empty
      form can’t match anything.
    </p>
  );
}

/** Why the "pin" action is gone: the list is full. */
export function PinLimitNote() {
  return (
    <p className="pin-limit-note">
      {MAX_PINS} pinned tests is the maximum — remove one to pin another.
    </p>
  );
}
