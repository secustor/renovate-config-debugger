import type { ReactNode } from "react";

/** One segment. `label` is a node so a segment can carry an icon beside its
 *  word (the theme switch does); `ariaLabel` is then the plain-text name that
 *  icon would otherwise garble. */
export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
  ariaLabel?: string;
  /** Roadmap 090: a segment that names a state this app cannot enter — the
   *  pipeline's Lookup and Update phases, which need the datasource network
   *  calls the engine deliberately severs. Rendered, because the picker is
   *  what teaches the sequence, and disabled because nothing is behind it. */
  disabled?: boolean;
}

/**
 * Roadmap 036's ONE segmented-control chrome, as a component rather than a CSS
 * class four call sites re-implemented around. It labels a STATE, not an action
 * — which is the whole reason the app has one — so the active rendering is
 * always legible.
 *
 * The markup is a radio group: `role="radiogroup"` with an accessible name, and
 * `aria-checked` on every segment. Three of the four sites had built that by
 * hand; the preset tree's tree/table switch had not (`role="group"` and plain
 * buttons), so which rendering was current reached assistive tech through a CSS
 * class and nothing else. Sharing the primitive closes that hole.
 *
 * `.seg` and `.active` are load-bearing names — the CSS and two e2e specs
 * select on them.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  /** The group's accessible name. */
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Extra classes on the wrapper, for the sites that position it. */
  className?: string;
}) {
  return (
    <span className={className ? `seg ${className}` : "seg"} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- `<input type="radio">` is a REPLACED element: it renders the platform's own dot-and-ring, which is exactly the rendering a segmented control exists to replace, and the usual escape (visually hide it, style a sibling `<label>`) trades one native affordance for a second element and a `for`/`id` pair per option. A `<button role="radio">` inside the `role="radiogroup"` above carries the same semantics — checked state, group membership, group label — with the button's own focus and activation behaviour intact.
          role="radio"
          aria-checked={option.value === value}
          aria-label={option.ariaLabel}
          title={option.title}
          className={option.value === value ? "active" : undefined}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}
