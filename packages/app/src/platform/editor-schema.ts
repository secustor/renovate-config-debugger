/**
 * Roadmap 031 — the editor's schema layer, loaded lazily. Everything heavy
 * about the editor lives behind this module: codemirror-json-schema (and its
 * markdown/yaml hover-and-completion stack), Renovate's own 373 kB schema
 * JSON, and — only when a `.json5` file is active — the json5 variant with
 * its parser. ConfigEditor mounts with plain `@codemirror/lang-json` inside
 * a Compartment and `import()`s this module after mount, so first paint
 * never waits on any of it; schema lint/hover simply appears a beat later.
 *
 * The preset-string hover card (roadmap 023) lives here too, NOT in
 * preset-hover.ts: it decorates the schema hover, so it belongs to the same
 * lazy chunk — a static import from preset-hover.ts (which App.tsx loads at
 * boot for the lookup side) would drag the whole stack back into the entry.
 */
import { type EditorView, type Extension, hoverTooltip, type Tooltip } from "@uiw/react-codemirror";
import type { CompletionContext } from "@codemirror/autocomplete";
import { jsonLanguage } from "@codemirror/lang-json";
import { jsonCompletion, jsonSchema, jsonSchemaHover } from "codemirror-json-schema";
import type { RefObject } from "react";
import { renovateSchema } from "@renovate-config-visualizer/engine/schema";
import type { PresetNodeState } from "@renovate-config-visualizer/engine";
import type { PresetHoverContext, PresetHoverInfo } from "@/lib/preset-hover";

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

type HoverSource = (
  view: EditorView,
  pos: number,
  side: -1 | 1,
) => Tooltip | Promise<Tooltip | null> | null;

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
function withPresetHover(
  base: Extension[],
  fallback: HoverSource,
  ctxRef: RefObject<PresetHoverContext | null>,
): Extension[] {
  const hoverIndex = base.length - 2;

  const source: HoverSource = (view, pos, side) => {
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

/**
 * Completion only when ASKED (Ctrl+Space), never while typing. The schema
 * completion source rebuilds its candidate set by walking Renovate's 373 kB
 * schema on every invocation, and with `activateOnTyping` (the basic-setup
 * default) that invocation happens per keystroke: measured 70–100 ms of
 * main-thread stall PER TYPED CHARACTER (2026-07-30) — typing lagged and
 * clipboard interactions dropped mid-stall. `null` from the wrapped source
 * costs nothing; an explicit request still gets the full schema completion,
 * and hover and the (debounced) linters are untouched.
 */
function explicitOnly<R>(
  source: (ctx: CompletionContext) => R,
): (ctx: CompletionContext) => R | null {
  return (ctx) => (ctx.explicit ? source(ctx) : null);
}

/** The bundled arrays are `[lang, linter, linter, autocomplete, hover, state]`
 *  (see codemirror-json-schema's `bundled.js`, pinned — the same layout
 *  `withPresetHover` indexes into), so the completion registration is element 3. */
const COMPLETION_INDEX = 3;

/**
 * Builds the full schema-aware extension set for the given file flavor. The
 * json5 variant (codemirror-json5 + the json5 parser, ~10 kB gz) rides its
 * own chunk behind a further `import()`, loaded only when a `.json5` file is
 * actually active.
 */
export async function buildSchemaExtensions(
  isJson5: boolean,
  ctxRef: RefObject<PresetHoverContext | null>,
): Promise<Extension[]> {
  if (isJson5) {
    const { json5Schema, json5SchemaHover, json5Completion } =
      await import("codemirror-json-schema/json5");
    const { json5Language } = await import("codemirror-json5");
    const base = json5Schema(renovateSchema);
    base[COMPLETION_INDEX] = json5Language.data.of({
      autocomplete: explicitOnly(json5Completion()),
    });
    return withPresetHover(base, json5SchemaHover(), ctxRef);
  }
  const base = jsonSchema(renovateSchema);
  base[COMPLETION_INDEX] = jsonLanguage.data.of({ autocomplete: explicitOnly(jsonCompletion()) });
  return withPresetHover(base, jsonSchemaHover(), ctxRef);
}
