import type { ReactNode } from "react";

/**
 * The descriptor form's actions row, on both of the form's homes (the detail
 * view and the Tests tab's Add-a-test panel): the design's pair — Simulate,
 * and the quiet "Pin as a standing test" that goes away at `MAX_PINS`.
 *
 * One component because the two rows were the same two buttons written twice,
 * for the same reason the form itself is never a simplified copy: one form,
 * one grammar. Roadmap 079's key print rides on the primary here, so "Enter
 * does this" is stated identically in both places.
 *
 * The primary is a `type="submit"` associated with the form across the DOM by
 * `form=` (068) — so Enter in a field and a click here are the same action,
 * and the row can sit outside the `<form>` element it drives.
 *
 * What actually differs between the two homes is what this takes: the row's
 * own class, which form it submits, what the primary says, whether it is
 * disabled, and the trailing status spans only the detail view has.
 */
export function DescriptorActions({
  className,
  formId,
  submitLabel,
  submitDisabled,
  atLimit,
  onPin,
  children,
}: {
  className: string;
  formId: string;
  /** The primary's text — the `<kbd>⏎</kbd>` after it is this row's, always. */
  submitLabel: string;
  submitDisabled?: boolean;
  atLimit: boolean;
  onPin: () => void;
  children?: ReactNode;
}) {
  return (
    <div className={className}>
      <button type="submit" form={formId} className="btn-primary" disabled={submitDisabled}>
        {submitLabel} <kbd>⏎</kbd>
      </button>
      {atLimit ? null : (
        <button type="button" className="btn-quiet" onClick={onPin}>
          Pin as a standing test
        </button>
      )}
      {children}
    </div>
  );
}
