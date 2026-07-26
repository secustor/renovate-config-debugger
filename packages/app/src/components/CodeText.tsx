import { Fragment } from "react";

/**
 * Roadmap 029: clause prose marks option/preset names with backticks (the
 * generator stays plain text, so it can be unit-tested and snapshotted); the
 * renderer turns those into `<code>` spans, matching the mockup's mono names.
 * Roadmap 042: shared, because the engine's migration explanations are written
 * in the same convention (see MigrationSteps).
 */
export function CodeText({ text }: { text: string }) {
  // Roadmap 041 — index keys, deliberately: this array is ONE string split on
  // backticks, so slot i is always the same span of the same string and the
  // odd/even parity is what decides `<code>` vs plain text. Parts repeat, and
  // insertion/reorder cannot happen; there is no other identity to key on.
  const parts = text.split(/`([^`]+)`/);
  return (
    <>
      {parts.map((part, i) =>
        // oxlint-disable-next-line react/no-array-index-key -- see above
        i % 2 === 1 ? <code key={i}>{part}</code> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}
