import { type EditorView, hoverTooltip, type Tooltip } from "@uiw/react-codemirror";
import { jsonSchema, jsonSchemaHover } from "codemirror-json-schema";
import { json5Schema, json5SchemaHover } from "codemirror-json-schema/json5";
import type { RefObject } from "react";
import type { PresetNode, PresetNodeState } from "@renovate-config-visualizer/engine";

/**
 * Roadmap 023: preset-string hovers in the config editor. Hovering a preset
 * like `:automergeMinor` inside an `extends` array used to show only the
 * json-schema type ("string"); this surfaces a card identifying it as a
 * Renovate preset, a short description drawn from the resolved tree, and a
 * jump link to that preset's node in the resolution tree.
 *
 * The card content lives outside React (a CodeMirror tooltip is plain DOM), so
 * the current lookup + jump callback are read from a ref at hover time — the
 * editor extension is built once but a fresh run swaps in new tree data.
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

const STRING_RE = /"(?:[^"\\]|\\.)*"/g;

/** The quoted string literal covering `pos` on its own line, if any. */
function stringLiteralAt(
  view: EditorView,
  pos: number,
): { value: string; from: number; to: number } | null {
  const line = view.state.doc.lineAt(pos);
  const col = pos - line.from;
  for (const match of line.text.matchAll(STRING_RE)) {
    const start = match.index;
    const end = start + match[0].length;
    if (col >= start && col <= end) {
      try {
        const value = JSON.parse(match[0]) as unknown;
        return typeof value === "string"
          ? { value, from: line.from + start, to: line.from + end }
          : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

const STATE_LABEL: Record<PresetNodeState, string> = {
  resolved: "resolved",
  error: "failed to resolve",
  aborted: "not resolved (run aborted)",
  ignored: "ignored (in ignorePresets)",
  "already-seen": "already resolved above",
};

function presetCard(info: PresetHoverInfo, onSelectPreset: (nodeId: string) => void): HTMLElement {
  const card = document.createElement("div");
  card.className = "option-card preset-hover-card";

  const head = document.createElement("div");
  head.className = "option-card-head";
  const name = document.createElement("code");
  name.className = "option-card-name";
  name.textContent = info.name;
  head.append(name);
  const badge = document.createElement("span");
  badge.className = "badge type";
  badge.textContent = "Renovate preset";
  head.append(badge);
  card.append(head);

  const desc = document.createElement("p");
  desc.className = "option-card-desc";
  const contribs: string[] = [];
  if (info.optionCount > 0) {
    contribs.push(`${info.optionCount} option${info.optionCount === 1 ? "" : "s"}`);
  }
  if (info.ruleCount > 0) {
    contribs.push(`${info.ruleCount} packageRule${info.ruleCount === 1 ? "" : "s"}`);
  }
  const summary =
    info.state === "resolved" && contribs.length > 0
      ? ` It resolves to ${contribs.join(" and ")}, merged under your own settings.`
      : "";
  desc.textContent = `A ${info.sourceKind} preset pulled in via extends (${STATE_LABEL[info.state]}).${summary}`;
  card.append(desc);

  const row = document.createElement("p");
  row.className = "option-card-row";
  const jump = document.createElement("button");
  jump.type = "button";
  jump.className = "preset-hover-jump";
  jump.textContent = "Show in resolution tree →";
  jump.addEventListener("mousedown", (e) => {
    // mousedown, not click: the tooltip is torn down as the pointer moves, and
    // mousedown fires before that teardown can steal the interaction.
    e.preventDefault();
    onSelectPreset(info.nodeId);
  });
  row.append(jump);
  card.append(row);

  const docsRow = document.createElement("p");
  docsRow.className = "option-card-row";
  const docs = document.createElement("a");
  docs.href = "https://docs.renovatebot.com/config-presets/";
  docs.target = "_blank";
  docs.rel = "noreferrer";
  docs.textContent = "docs.renovatebot.com ↗";
  docsRow.append(docs);
  card.append(docsRow);

  return card;
}

/**
 * The renovate-schema editor extensions with the default json-schema hover
 * replaced by one that shows the preset card for known preset strings and
 * otherwise falls back to the schema hover verbatim. The bundled `jsonSchema`
 * array is `[lang, linter, linter, autocomplete, hover, stateExtensions]` (see
 * codemirror-json-schema's `bundled.js`, pinned); swapping the second-to-last
 * element keeps schema linting, completion and the schema-state field intact
 * while overriding only the hover — a single hover source rather than a second
 * one stacked on top of the default.
 */
export function buildEditorExtensions(
  isJson5: boolean,
  schema: Parameters<typeof jsonSchema>[0],
  ctxRef: RefObject<PresetHoverContext | null>,
) {
  const base = isJson5 ? json5Schema(schema) : jsonSchema(schema);
  const fallback = isJson5 ? json5SchemaHover() : jsonSchemaHover();
  const hoverIndex = base.length - 2;

  const source = (
    view: EditorView,
    pos: number,
    side: -1 | 1,
  ): Tooltip | Promise<Tooltip | null> | null => {
    const ctx = ctxRef.current;
    const literal = ctx ? stringLiteralAt(view, pos) : null;
    const info = literal && ctx ? ctx.lookup(literal.value) : null;
    if (info && literal && ctx) {
      const onSelectPreset = ctx.onSelectPreset;
      return {
        pos: literal.from,
        end: literal.to,
        above: true,
        create: () => ({ dom: presetCard(info, onSelectPreset) }),
      };
    }
    return fallback(view, pos, side);
  };

  base[hoverIndex] = hoverTooltip(source);
  return base;
}
