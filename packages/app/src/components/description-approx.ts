/**
 * Roadmap 069: the wording behind the engine's *approximate* attribution.
 *
 * Split from the components that render it ({@link DescriptionApprox.tsx}) for
 * the reason `provenance-layer.ts` is split from `ProvenanceChip.tsx`: a module
 * that exports both a component and a plain function breaks Fast Refresh
 * (react/only-export-components), and this text is wanted by callers that
 * render no component of their own — a title attribute on someone else's label,
 * a CLI line.
 */

/**
 * The hover text behind every `≈`. `name` is the enclosing subtree the engine
 * fell back to; omitted where naming it would not help the reader — the repo's
 * own root node, which the preset tree has no row for, and the
 * defaults/global/inherited layers, which have no preset tree at all.
 */
export function approximateTitle(name?: string): string {
  return name
    ? `Contributed somewhere inside ${name} — the exact preset could not be determined`
    : "The exact preset that wrote this sentence could not be determined";
}
