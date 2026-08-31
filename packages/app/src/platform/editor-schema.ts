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
import { jsonLanguage } from "@codemirror/lang-json";
import { jsonCompletion, jsonSchema, jsonSchemaHover } from "codemirror-json-schema";
import type { RefObject } from "react";
import { renovateSchema } from "@renovate-config-debugger/engine/schema";
import type { PresetNodeState } from "@renovate-config-debugger/engine";
import type { PresetHoverContext, PresetHoverInfo } from "@/lib/preset-hover";
import { pluralWord } from "@/lib/format";

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
  card.className = "option-card";

  const head = document.createElement("div");
  head.className = "option-card-head";
  const name = document.createElement("code");
  // Roadmap 081: this card is vanilla DOM on a lazily-imported chunk, so it
  // cannot render `PresetName` — but it can wear the same CLASS, and the design
  // rule ("purple = preset, everywhere") is about the token, not the React
  // tree. The heading variant, so the name reads as this card's title exactly
  // as it does on the preset detail panel.
  name.className = "preset-token preset-token-heading";
  name.textContent = info.name;
  head.append(name);
  const badge = document.createElement("span");
  badge.className = "badge type";
  badge.textContent = "Renovate preset";
  head.append(badge);
  card.append(head);

  const desc = document.createElement("p");
  const contribs: string[] = [];
  if (info.optionCount > 0) {
    contribs.push(`${info.optionCount} ${pluralWord(info.optionCount, "option")}`);
  }
  if (info.ruleCount > 0) {
    contribs.push(`${info.ruleCount} ${pluralWord(info.ruleCount, "packageRule")}`);
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
  jump.className = "btn-quiet";
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

/** How long a NON-explicit completion query waits before doing any work. A
 *  keystroke inside this window supersedes the query (ctx.aborted), so a
 *  typing burst runs the expensive source once, after the pause. */
const COMPLETION_DEBOUNCE_MS = 250;

/**
 * The schema completion source, debounced (2026-07-30). The library returns
 * `filter: false` (it filters manually), which makes CodeMirror re-invoke
 * the source on EVERY typed character — and one invocation walks Renovate's
 * 373 kB schema through json-schema-library: measured 70–300 ms of
 * main-thread stall per keystroke, the editor's typing lag (its own schema
 * cache is also broken — `originalSchema` is compared but never written —
 * but the walk, not the schema prep, dominates). Async + debounce moves the
 * one real walk to ~250 ms after typing pauses and lets every mid-burst
 * query resolve to null for free; an explicit request (Ctrl-Space) still
 * runs immediately. Re-check on codemirror-json-schema bumps.
 */
function debouncedCompletionSource<C extends CompletionContextLike>(
  base: (ctx: C) => unknown,
): (ctx: C) => Promise<unknown> {
  return async (ctx) => {
    if (!ctx.explicit) {
      await new Promise((resolve) => setTimeout(resolve, COMPLETION_DEBOUNCE_MS));
      if (ctx.aborted) {
        return null;
      }
    }
    return base(ctx);
  };
}

/** The slice of @codemirror/autocomplete's CompletionContext this module
 *  reads — typed structurally so the transitive package stays undeclared. */
interface CompletionContextLike {
  explicit: boolean;
  aborted: boolean;
}

/** The bundled arrays are `[lang, linter, linter, autocomplete, hover, state]`
 *  (see codemirror-json-schema's `bundled.js`, pinned — the same layout
 *  `withPresetHover` indexes into), so the completion registration is element 3. */
const COMPLETION_INDEX = 3;

/** The warm-up steps for the flavor currently installed, set by
 *  `buildSchemaExtensions` and drained by `warmSchemaCaches`. */
let warmupSteps: ((view: EditorView) => void)[] = [];

/** Where to aim a warm-up query: inside the first string literal, if there is
 *  one — a position the schema actually has to resolve, rather than whitespace
 *  it can answer for free. Null when the document is too short to have one. */
function warmPos(view: EditorView): number | null {
  const doc = view.state.doc.toString();
  const quote = doc.indexOf('"');
  const pos = quote === -1 ? Math.min(1, doc.length) : quote + 2;
  return pos > doc.length ? null : pos;
}

/** Warming is an optimization: if a source rejects, the first real query simply
 *  pays what it would have paid anyway. */
function settle(result: unknown): void {
  void Promise.resolve(result).catch(() => undefined);
}

/**
 * The warm-up steps for one flavor's sources: one throwaway hover, then one
 * throwaway completion, so the FIRST real one isn't the one that pays for them.
 *
 * json-schema-library resolves Renovate's `$ref` graph lazily and memoizes it
 * on the schema object, so the first consumer to walk it eats the whole cost —
 * measured 1118 ms for a cold completion against ~3 ms once warm. Whoever goes
 * first pays, which is why the editor felt fine if you happened to hover before
 * typing (the hover absorbed ~300 ms of it) and awful if you clicked and typed
 * straight away.
 *
 * Two steps rather than one call because each is an unbreakable chunk of main
 * thread (~290 ms and ~690 ms measured): run separately, a keystroke that
 * arrives mid-warm-up waits for one of them, not for both.
 *
 * The completion source is called directly rather than through CodeMirror: it
 * reads only `state`, `pos`, `explicit` and `matchBefore` off the context, so a
 * literal stands in for the real CompletionContext (hence the one cast).
 * `explicit` skips the debounce; both results are discarded.
 */
function buildWarmupSteps<Ctx>(
  hover: HoverSource,
  completion: (ctx: Ctx) => unknown,
): ((view: EditorView) => void)[] {
  return [
    (view) => {
      const pos = warmPos(view);
      if (pos !== null) {
        settle(hover(view, pos, 1));
      }
    },
    (view) => {
      const pos = warmPos(view);
      if (pos !== null) {
        settle(
          completion({
            state: view.state,
            pos,
            explicit: true,
            aborted: false,
            matchBefore: () => null,
          } as unknown as Ctx),
        );
      }
    },
  ];
}

/**
 * Warms the schema caches off the typing path — see `buildWarmupSteps`. Call
 * once per editor, AFTER the extensions are installed: both sources read the
 * schema out of the editor state field that `stateExtensions` adds.
 */
export function warmSchemaCaches(view: EditorView): void {
  const steps = warmupSteps;
  const schedule =
    typeof requestIdleCallback === "function"
      ? // Idle, but not indefinitely: the window this closes is "user clicked
        // into the editor and typed straight away", so a step still queued when
        // that happens has bought nothing. By here the lazy schema chunk has
        // already loaded, so there is no first-paint work left to yield to.
        (fn: () => void) => requestIdleCallback(fn, { timeout: 1000 })
      : (fn: () => void) => setTimeout(fn, 0);
  for (const step of steps) {
    schedule(() => {
      try {
        step(view);
      } catch {
        // See `buildWarmupSteps` — best-effort.
      }
    });
  }
}

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
    const { json5Completion, json5Schema, json5SchemaHover } =
      await import("codemirror-json-schema/json5");
    const { json5Language } = await import("codemirror-json5");
    const base = json5Schema(renovateSchema);
    const completion = json5Completion();
    const hover = json5SchemaHover();
    warmupSteps = buildWarmupSteps(hover, completion);
    base[COMPLETION_INDEX] = json5Language.data.of({
      autocomplete: debouncedCompletionSource(completion),
    });
    return withPresetHover(base, hover, ctxRef);
  }
  const base = jsonSchema(renovateSchema);
  const completion = jsonCompletion();
  const hover = jsonSchemaHover();
  warmupSteps = buildWarmupSteps(hover, completion);
  base[COMPLETION_INDEX] = jsonLanguage.data.of({
    autocomplete: debouncedCompletionSource(completion),
  });
  return withPresetHover(base, hover, ctxRef);
}
