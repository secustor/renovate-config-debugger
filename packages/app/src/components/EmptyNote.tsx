import type { ReactNode } from "react";

/**
 * "There is nothing here, and here is why" — the one-line note a results tab
 * shows in place of a panel it has no input for ("no presets — this config has
 * no `extends` entries").
 *
 * It lived inside `ResultsColumn` while the shell was the only thing that
 * needed it. The pipeline slice needs the same note for its no-rewrites case,
 * which makes this a second consumer and moves it here by the promotion rule —
 * rather than the slice growing a near-identical copy, which is how the two
 * `formatSnippet`s happened.
 */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="empty-note">{children}</p>;
}
