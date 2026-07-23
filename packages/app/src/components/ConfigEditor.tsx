import CodeMirror, { EditorView, type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { jsonSchema } from "codemirror-json-schema";
import { json5Schema } from "codemirror-json-schema/json5";
import { renovateSchema } from "@renovate-config-visualizer/engine/schema";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";

interface Props {
  fileName: string;
  value: string;
  onChange: (value: string) => void;
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
  { fileName, value, onChange },
  ref,
) {
  const extensions = useMemo(
    () => [fileName.endsWith(".json5") ? json5Schema(renovateSchema) : jsonSchema(renovateSchema)],
    [fileName],
  );
  const cmRef = useRef<ReactCodeMirrorRef>(null);

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

  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  return (
    <div className="card">
      <div className="card-title">{fileName}</div>
      <CodeMirror
        ref={cmRef}
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme={dark ? "dark" : "light"}
        minHeight="14rem"
        maxHeight="28rem"
      />
    </div>
  );
});
