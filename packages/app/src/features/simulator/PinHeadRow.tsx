import { dotTitle, dotTone, type PinCheck } from "./pin-outcome";

/**
 * The header row of the pin grammar: the dot, the dependency's name, the
 * version move, and the one-line outcome sentence — worn by a pinned card and
 * by the Add-a-test panel's one-off result alike.
 *
 * A fragment rather than the `.pin-head` element itself, because the two homes
 * differ in what wraps these four: a pinned card wraps them in the button that
 * expands it, and a one-off — which has nothing to expand — puts them straight
 * into the row. That difference is why the one-off hand-copied the markup, and
 * the dot half of that copy is exactly what `PinCheck` was introduced to fix
 * (a one-off with a caveat wore a green dot).
 */
export function PinHeadRow({
  check,
  name,
  context,
  summary,
  pending,
  starter = false,
}: {
  check: PinCheck;
  name: string;
  /** The version move and what it rides on — `pinContext`. */
  context: string;
  /** The outcome sentence, or null when there is no outcome yet. */
  summary: string | null;
  /** What stands in for the sentence while `summary` is null. */
  pending?: string;
  /** Roadmap 091: this descriptor was derived from the reader's own rules, not
   *  written by them — said on the row, since it is the row's own claim. */
  starter?: boolean;
}) {
  return (
    <>
      <span className={`pin-dot ${dotTone(check)}`} title={dotTitle(check)} />
      <span className="pin-name">{name}</span>
      {starter ? (
        <span
          className="pill pill-count pin-starter"
          title="Derived from your packageRules — swap in a real one"
        >
          starter
        </span>
      ) : null}
      <span className="pin-meta">{context}</span>
      {summary === null ? (
        <span className="pin-pending">{pending}</span>
      ) : (
        <span className="pin-summary">{summary}</span>
      )}
    </>
  );
}
