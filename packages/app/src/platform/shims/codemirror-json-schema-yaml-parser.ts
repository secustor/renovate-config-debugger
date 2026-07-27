/**
 * Build-time replacement for
 * `codemirror-json-schema/dist/parsers/yaml-parser.js`. Installed by the
 * `codemirror-json-schema-shims` plugin in vite.config.ts — see the comment
 * there for why.
 *
 * The real module has exactly one export, `parseYAMLDocumentState(state)`, and
 * its only reachable caller is `getDefaultParser(MODES.YAML)` from the
 * library's `parsers/index.js` barrel — a barrel that the JSON and JSON5
 * feature modules import unconditionally, which is what drags the `yaml`
 * package into the schema chunk graph. This app only ever selects the JSON
 * ("json4") and JSON5 modes, so the throw below is unreachable; it exists so a
 * future YAML mode fails loudly instead of silently mis-parsing.
 */
export function parseYAMLDocumentState(_state: unknown): never {
  throw new Error(
    "codemirror-json-schema's YAML parser is stubbed out in this bundle " +
      "(see packages/app/vite.config.ts). Drop the shim to enable YAML mode.",
  );
}
