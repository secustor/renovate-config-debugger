/**
 * markdown-it 14 ships no type declarations and lives in
 * codemirror-json-schema's nested node_modules (pnpm), so it is not resolvable
 * by name from this package — the Vite plugin resolves the specifier at build
 * time (vite.config.ts). This ambient declaration covers the sliver of the API
 * the markdown shim uses.
 */
declare module "markdown-it" {
  interface MarkdownItOptions {
    linkify?: boolean;
    typographer?: boolean;
  }

  interface MarkdownIt {
    render(src: string): string;
    renderInline(src: string): string;
  }

  const markdownIt: (options?: MarkdownItOptions) => MarkdownIt;
  export default markdownIt;
}
