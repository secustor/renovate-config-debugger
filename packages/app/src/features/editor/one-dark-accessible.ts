import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { oneDarkTheme } from "@uiw/react-codemirror";

/**
 * PageSpeed a11y — `@codemirror/theme-one-dark`, which the `theme="dark"` prop
 * resolves to, paints JSON property names in coral `#e06c75`: 4.38:1 on the
 * `#282c34` editor background, under WCAG AA's 4.5:1. Every other one-dark
 * color passes, so this is the stock theme with ONE ink swapped.
 *
 * A full copy of `oneDarkHighlightStyle` (v6.1.3) rather than a second
 * highlighter layered on top: when two highlight styles match the same node,
 * both emit a class and the winner falls to injected-stylesheet order, which
 * nothing guarantees. Replacing the style keeps exactly one rule per tag.
 */
const chalky = "#e5c07b",
  coral = "#e57c84", // was #e06c75 — lightened to 5.0:1, hue kept
  cyan = "#56b6c2",
  invalid = "#ffffff",
  ivory = "#abb2bf",
  stone = "#7d8799",
  malibu = "#61afef",
  sage = "#98c379",
  whiskey = "#d19a66",
  violet = "#c678dd";

const highlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: violet },
  { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: coral },
  { tag: [t.function(t.variableName), t.labelName], color: malibu },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: whiskey },
  { tag: [t.definition(t.name), t.separator], color: ivory },
  {
    tag: [
      t.typeName,
      t.className,
      t.number,
      t.changed,
      t.annotation,
      t.modifier,
      t.self,
      t.namespace,
    ],
    color: chalky,
  },
  {
    tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)],
    color: cyan,
  },
  { tag: [t.meta, t.comment], color: stone },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: stone, textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold", color: coral },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: whiskey },
  { tag: [t.processingInstruction, t.string, t.inserted], color: sage },
  { tag: t.invalid, color: invalid },
]);

/** Drop-in for `theme="dark"`: the one-dark chrome, AA-contrast syntax inks. */
export const oneDarkAccessible = [oneDarkTheme, syntaxHighlighting(highlightStyle)];
