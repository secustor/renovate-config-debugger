import CodeMirror, {
  Compartment,
  EditorView,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { PresetHoverContext } from "@/lib/preset-hover";
import { useEffectiveScheme } from "@/hooks/use-effective-scheme";
import { oneDarkAccessible } from "./one-dark-accessible";

interface Props {
  fileName: string;
  value: string;
  onChange: (value: string) => void;
  /** Roadmap 023: current run's preset-string hover data + jump callback, read
   *  from a ref at hover time so a fresh run's tree updates without a remount. */
  presetHover?: PresetHoverContext | null;
  /** Roadmap 039: controls that belong to the card rather than to the page —
   *  today the "Load from repo…" disclosure, pushed to the end of the title
   *  bar where the loaded file name already lands. */
  titleAction?: ReactNode;
  /** Roadmap 039: an optional chrome row (036 grammar) between the title bar
   *  and the editor — the repo-load form while it is open. Absent when null,
   *  so a closed disclosure leaves no orphan row behind (035). */
  chromeRow?: ReactNode;
}

/**
 * Roadmap 013: imperative cross-link target. A validation error naming a
 * repo-config `packageRules[i]` index resolves to a character offset (via
 * `rule-locate.ts`) and calls `highlightOffset` to jump the editor there.
 */
export interface ConfigEditorHandle {
  /** Scrolls the line at `offset` into view, selects it, and flashes it briefly. */
  highlightOffset(offset: number): void;
}

export const ConfigEditor = forwardRef<ConfigEditorHandle, Props>(function ConfigEditor(
  { fileName, value, onChange, presetHover, titleAction, chromeRow },
  ref,
) {
  // Kept current every render so the once-built hover extension reads fresh
  // tree data (a Run updates it without remounting the editor).
  const presetHoverRef = useRef<PresetHoverContext | null>(presetHover ?? null);
  presetHoverRef.current = presetHover ?? null;
  // Roadmap 031: the editor mounts with plain JSON language support only —
  // the ~160 kB gz schema layer (codemirror-json-schema + Renovate's own
  // schema JSON + its markdown/yaml stack) is `import()`ed after mount and
  // swapped in through this compartment, so first paint and typing never
  // wait on it; schema lint/hover appears a beat later.
  const compartment = useMemo(() => new Compartment(), []);
  const extensions = useMemo(
    () => [
      compartment.of(json()),
      // PageSpeed a11y: CodeMirror's contenteditable is a role="textbox" with
      // no accessible name of its own.
      EditorView.contentAttributes.of({ "aria-label": "Renovate config" }),
    ],
    [compartment],
  );
  const cmRef = useRef<ReactCodeMirrorRef>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { buildSchemaExtensions } = await import("@/platform/editor-schema");
        const schemaExtensions = await buildSchemaExtensions(
          fileName.endsWith(".json5"),
          presetHoverRef,
        );
        if (cancelled) {
          return;
        }
        // The view exists by now: CodeMirror (a child) creates it in its own
        // mount effect, and child effects flush before this one — and the
        // awaits above put this a macrotask later regardless.
        cmRef.current?.view?.dispatch({ effects: compartment.reconfigure(schemaExtensions) });
      } catch {
        // Schema layer failed to load (e.g. offline after first paint) — the
        // plain JSON editor keeps working; lint/hover just never appears.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileName, compartment]);

  useImperativeHandle(
    ref,
    () => ({
      highlightOffset(offset: number) {
        const view = cmRef.current?.view;
        if (!view) {
          return;
        }
        const pos = Math.max(0, Math.min(offset, view.state.doc.length));
        const line = view.state.doc.lineAt(pos);
        view.dispatch({
          selection: { anchor: line.from, head: line.to },
          effects: EditorView.scrollIntoView(line.from, { y: "center" }),
        });
        view.focus();
        const dom = view.domAtPos(line.from).node;
        const lineEl = (
          dom.nodeType === Node.TEXT_NODE ? dom.parentElement : (dom as Element)
        )?.closest(".cm-line");
        if (lineEl) {
          lineEl.classList.add("rcv-flash");
          window.setTimeout(() => lineEl.classList.remove("rcv-flash"), 1600);
        }
      },
    }),
    [],
  );

  // Roadmap 039: CodeMirror is the one surface that cannot resolve its colors
  // from `color-scheme` — it needs this as a prop. Subscribed, and reading the
  // app's EFFECTIVE scheme (the 037 override, else the live OS preference), so
  // the editor repaints with the rest of the page instead of staying on
  // whatever the OS said at mount.
  const scheme = useEffectiveScheme();

  return (
    <div className="card">
      <div className="card-title editor-card-title">
        <span>{fileName}</span>
        {titleAction ? <span className="card-title-actions">{titleAction}</span> : null}
      </div>
      {chromeRow}
      <CodeMirror
        ref={cmRef}
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme={scheme === "dark" ? oneDarkAccessible : scheme}
        minHeight="14rem"
        maxHeight="28rem"
      />
    </div>
  );
});
