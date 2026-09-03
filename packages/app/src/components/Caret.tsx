/**
 * The disclosure triangle every collapsible head in the app draws. It was
 * eleven hand-rolled spans against eight near-identical CSS rules before this
 * existed — one of them (the Effective config's band headers) with no rule at
 * all, and all but one missing `aria-hidden`.
 *
 * The glyph is decoration: the control it sits in already carries
 * `aria-expanded`, so a screen reader reading a triangle out as text says the
 * same thing twice, badly. Hence `aria-hidden` here rather than per site.
 *
 * NOT the preset tree's row caret — that one is a `<button aria-label>` inside
 * a `treeitem`, a control rather than an ornament, and it stays as it is.
 */
export function Caret({ open }: { open?: boolean }) {
  return (
    <span className="caret" aria-hidden="true">
      {open ? "▾" : "▸"}
    </span>
  );
}
