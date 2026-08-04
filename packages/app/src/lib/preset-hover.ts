import type { PresetNode, PresetNodeState } from "@renovate-config-debugger/engine";

/**
 * Roadmap 023: preset-string hovers in the config editor. Hovering a preset
 * like `:automergeMinor` inside an `extends` array used to show only the
 * json-schema type ("string"); this surfaces a card identifying it as a
 * Renovate preset, a short description drawn from the resolved tree, and a
 * jump link to that preset's node in the resolution tree.
 *
 * Roadmap 031: this module holds only the lookup side (built by App.tsx from
 * a run's tree — engine TYPES only, nothing heavy). The editor-extension
 * side — the hover card DOM and the codemirror-json-schema wiring it rides
 * on — lives in editor-schema.ts, which ConfigEditor `import()`s after
 * mount: a static import from here would drag the ~160 kB gz schema stack
 * straight back into the entry chunk through App.tsx.
 */

export interface PresetHoverInfo {
  nodeId: string;
  name: string;
  state: PresetNodeState;
  /** e.g. `internal`, `github`, `npm` — the presetSource, defaulting to internal. */
  sourceKind: string;
  /** Top-level options this preset resolves to (excluding packageRules). */
  optionCount: number;
  /** packageRules entries this preset resolves to. */
  ruleCount: number;
}

export interface PresetHoverContext {
  lookup: (name: string) => PresetHoverInfo | null;
  onSelectPreset: (nodeId: string) => void;
}

/** Builds a `name → info` lookup from a run's resolution tree — the first
 *  occurrence of each preset name wins (they resolve to the same content). */
export function buildPresetLookup(root: PresetNode | undefined): Map<string, PresetHoverInfo> {
  const map = new Map<string, PresetHoverInfo>();
  if (!root) {
    return map;
  }
  const visit = (node: PresetNode): void => {
    for (const child of node.children) {
      if (!map.has(child.name)) {
        const resolved =
          typeof child.resolved === "object" &&
          child.resolved !== null &&
          !Array.isArray(child.resolved)
            ? (child.resolved as Record<string, unknown>)
            : undefined;
        const ruleCount = Array.isArray(resolved?.packageRules) ? resolved.packageRules.length : 0;
        const optionCount = resolved
          ? Object.keys(resolved).filter((k) => k !== "packageRules").length
          : 0;
        map.set(child.name, {
          nodeId: child.id,
          name: child.name,
          state: child.state,
          sourceKind: child.source?.presetSource ?? "internal",
          optionCount,
          ruleCount,
        });
      }
      visit(child);
    }
  };
  visit(root);
  return map;
}
