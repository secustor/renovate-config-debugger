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
 * `empty` is the inert variant (roadmap 082's defaults rows): the slot with no
 * triangle in it, kept so option names still start on the same edge as every
 * other band's.
 *
 * NOT the preset tree's row caret — that one is a `<button aria-label>` inside
 * a `treeitem`, a control rather than an ornament, and it stays as it is.
 */
export function Caret({ open, empty }: { open?: boolean; empty?: boolean }) {
  return (
    <span className={`caret${empty ? " caret-empty" : ""}`} aria-hidden="true">
      {empty ? "" : open ? "▾" : "▸"}
    </span>
  );
}
