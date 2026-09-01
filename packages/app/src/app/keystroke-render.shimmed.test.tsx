/**
 * Roadmap 032: keystroke render-count measurement. Mounts the REAL App under
 * jsdom — real engine (the shimmed renovate module graph, i.e. the same one
 * the browser bundle runs — see vitest.config.ts), real panels, real state
 * wiring — runs the default `config:recommended` config, then types into the
 * editor and counts which of the heavy result panels re-render per keystroke.
 * Typing must reconcile NONE of them: the panels render run RESULTS, which
 * change only on a run.
 *
 * Only the CodeMirror editor is stubbed (a plain textarea with the same
 * value/onChange contract): CodeMirror needs layout APIs jsdom lacks, and the
 * measurement targets App's render path, which begins at `onChange` either
 * way. Each panel module is wrapped so the counter increments exactly when
 * the panel's render function runs — a `memo` bailout does not count, because
 * the wrapper unwraps `memo()` and counts inside it.
 */
import {
  type ChangeEvent,
  type ComponentType,
  createElement,
  forwardRef,
  memo,
  Profiler,
  useImperativeHandle,
} from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { stubMatchMedia, stubResizeObserver, stubScrollApis } from "@tools/test/jsdom-stubs";
import type { ConfigEditorHandle } from "@/features/editor/ConfigEditor";
import type * as PresetsPanelModule from "@/features/presets/PresetsPanel";
import type * as EffectiveConfigModule from "@/features/effective-config/EffectiveConfig";
import type * as TestsPanelModule from "@/features/simulator/TestsPanel";
import type * as MessagesPanelModule from "@/components/MessagesPanel";
import type * as OverviewPanelModule from "@/features/overview/OverviewPanel";

/** Render-function invocations per wrapped panel (memo bailouts excluded). */
const renderCounts: Record<string, number> = {};
/** Commits of the whole App tree — proof the keystrokes really re-rendered App. */
let appCommits = 0;

interface MemoLike<P> {
  $$typeof: symbol;
  type: ComponentType<P>;
  compare?: ((a: P, b: P) => boolean) | null;
}

/**
 * Wraps a component (memoized or not) so `renderCounts[name]` increments each
 * time its render function actually runs. A `memo()` export is unwrapped and
 * re-wrapped with the SAME compare semantics, so bailout behavior is
 * preserved exactly — the count then distinguishes "reconciled but bailed
 * out" (no increment) from "really rendered" (increment).
 */
function wrapCounting<P extends object>(
  name: string,
  Component: ComponentType<P>,
): ComponentType<P> {
  const memoLike = Component as unknown as MemoLike<P>;
  const isMemo = typeof Component === "object" && memoLike.$$typeof === Symbol.for("react.memo");
  const Inner = isMemo ? memoLike.type : Component;
  function Counting(props: P) {
    renderCounts[name] = (renderCounts[name] ?? 0) + 1;
    return createElement(Inner, props);
  }
  Counting.displayName = `Counting(${name})`;
  return isMemo ? memo(Counting, memoLike.compare ?? undefined) : Counting;
}

vi.mock("../features/editor/ConfigEditor", () => {
  const ConfigEditor = forwardRef<
    ConfigEditorHandle,
    { fileName: string; value: string; onChange: (value: string) => void }
  >(function ConfigEditorStub({ value, onChange }, ref) {
    // Roadmap 068 added `focus()` to the handle (the config skip link's
    // landing); this stub has no CodeMirror view to focus, so it is a no-op.
    useImperativeHandle(
      ref,
      () => ({ highlightOffset: () => undefined, focus: () => undefined }),
      [],
    );
    return (
      <textarea
        data-testid="editor-stub"
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
      />
    );
  });
  return { ConfigEditor };
});

// No preset-hover mock needed since roadmap 031: the schema/hover extensions
// (codemirror-json-schema, which doesn't resolve under node ESM) moved to
// editor-schema.ts, reached only by the real ConfigEditor's post-mount
// `import()` — and that editor is stubbed above. preset-hover.ts itself is
// now just the pure lookup App builds per run.

// Roadmap 075 (iteration 5b): the Presets tab's panel is the ledger/tree
// switch, and it is what the tab mounts — counting the tree alone would stop
// measuring anything the moment the tab opens on the ledger.
vi.mock("../features/presets/PresetsPanel", async (importOriginal) => {
  const mod = await importOriginal<typeof PresetsPanelModule>();
  return { ...mod, PresetsPanel: wrapCounting("PresetsPanel", mod.PresetsPanel) };
});
vi.mock("../features/effective-config/EffectiveConfig", async (importOriginal) => {
  const mod = await importOriginal<typeof EffectiveConfigModule>();
  return { ...mod, EffectiveConfig: wrapCounting("EffectiveConfig", mod.EffectiveConfig) };
});
// Roadmap 075 (iteration 6): the Tests tab's panel is the pins/simulator
// switch, and it is what the tab mounts — counting the simulator alone would
// stop measuring anything the moment the tab opens on the pins list (the same
// reason the Presets tab counts its panel rather than its tree).
vi.mock("../features/simulator/TestsPanel", async (importOriginal) => {
  const mod = await importOriginal<typeof TestsPanelModule>();
  return { ...mod, TestsPanel: wrapCounting("TestsPanel", mod.TestsPanel) };
});
vi.mock("../components/MessagesPanel", async (importOriginal) => {
  const mod = await importOriginal<typeof MessagesPanelModule>();
  return { ...mod, MessagesPanel: wrapCounting("MessagesPanel", mod.MessagesPanel) };
});
// Roadmap 083: the description digest is the Overview tab's panel again, and
// it is the heaviest thing a keystroke must not reconcile — it re-derives the
// per-string provenance and re-runs the topic classifier over every sentence.
vi.mock("../features/overview/OverviewPanel", async (importOriginal) => {
  const mod = await importOriginal<typeof OverviewPanelModule>();
  return { ...mod, OverviewPanel: wrapCounting("OverviewPanel", mod.OverviewPanel) };
});

const PANELS = [
  "OverviewPanel",
  "PresetsPanel",
  "EffectiveConfig",
  "TestsPanel",
  "MessagesPanel",
] as const;
const KEYSTROKES = 20;

beforeAll(() => {
  // jsdom lacks these; the app only needs them to answer "no" / do nothing.
  stubMatchMedia();
  stubResizeObserver();
  stubScrollApis();
});

/** Waits until no commit has changed any counter for a settle window — the
 *  post-run async work (option index, error lib, provenance) has landed. */
async function waitForQuiescence(): Promise<void> {
  const snapshot = () => JSON.stringify({ renderCounts, appCommits });
  let last = snapshot();
  let stableSince = Date.now();
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    const now = snapshot();
    if (now !== last) {
      last = now;
      stableSince = Date.now();
    } else if (Date.now() - stableSince > 700) {
      return;
    }
  }
  throw new Error("App never went quiescent after the run");
}

describe("keystroke render performance (roadmap 032)", () => {
  it("typing after a config:recommended run re-renders no result panel", async () => {
    // Imported dynamically so the module mocks above see this module's
    // helpers fully initialized when their factories run.
    const { App } = await import("./App");
    const view = render(
      createElement(Profiler, { id: "App", onRender: () => void appCommits++ }, createElement(App)),
    );

    // Run the default config (config:recommended) through the real engine.
    // Roadmap 075: before the first run the Run button is the landing's own
    // ("Run the pipeline"); the toolbar's "Run" appears with the shell.
    fireEvent.click(view.getByRole("button", { name: "Run the pipeline" }));

    // The run is done when the tab strip exists AND the Effective badge has
    // its (async, provenance-derived) count.
    await waitFor(
      () => {
        expect(document.querySelector("#tab-effective .tab-count")).not.toBeNull();
      },
      { timeout: 200_000, interval: 500 },
    );
    await waitForQuiescence();

    // Anti-vacuity: the run really rendered EVERY panel this test counts, so a
    // delta of 0 below means "did not re-render", not "never rendered".
    for (const name of PANELS) {
      expect(renderCounts[name] ?? 0, `${name} should have rendered after the run`).toBeGreaterThan(
        0,
      );
    }

    const before: Record<string, number> = { ...renderCounts };
    const commitsBefore = appCommits;

    const editor = view.getByTestId("editor-stub") as HTMLTextAreaElement;
    const base = editor.value;
    for (let i = 1; i <= KEYSTROKES; i++) {
      fireEvent.change(editor, { target: { value: base + " ".repeat(i) } });
    }

    const deltas = Object.fromEntries(
      PANELS.map((name) => [name, (renderCounts[name] ?? 0) - (before[name] ?? 0)]),
    );
    // The measurement record for roadmap/032-keystroke-render-performance.md.
    console.log(
      `[032] app commits during ${KEYSTROKES} keystrokes: ${appCommits - commitsBefore}; ` +
        `panel re-renders: ${JSON.stringify(deltas)}`,
    );

    // Every keystroke re-renders App itself (content state lives there)…
    expect(appCommits - commitsBefore).toBeGreaterThanOrEqual(KEYSTROKES);
    // …but reconciles none of the result panels.
    for (const name of PANELS) {
      expect(deltas[name], `${name} re-rendered while typing`).toBe(0);
    }
  });
});
