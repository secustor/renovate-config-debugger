/**
 * Build-time replacement for `codemirror-json-schema/dist/utils/markdown.js`.
 * Installed by the `codemirror-json-schema-shims` plugin in vite.config.ts —
 * see the comment there for why.
 *
 * Export surface is copied from the real module (which declares exactly one
 * export, `renderMarkdown(markdown, inline = true): string`, imported by
 * features/hover.js, features/completion.js and features/validation.js). Same
 * markdown-it instance options, same sync signature; the only thing dropped is
 * the shiki highlighter the original attaches from a top-level async IIFE, so
 * fenced code blocks in tooltips render as plain `<pre><code>` instead of
 * syntax-coloured spans.
 */
import md from "markdown-it";

const renderer = md({
  linkify: true,
  typographer: true,
});

export function renderMarkdown(markdown: string, inline = true): string {
  if (!inline) {
    return renderer.render(markdown);
  }
  return renderer.renderInline(markdown);
}
