import type { ReactNode, RefObject } from "react";
import { ConfigEditor, type ConfigEditorHandle } from "./ConfigEditor";
import type { PresetHoverContext } from "@/lib/preset-hover";

/**
 * Roadmap 039/040 — the editor card with its own chrome. 075 (v2, iteration 2)
 * simplified it to exactly that: the card's title bar IS the config toolbar
 * (file name, Load from repo…, Format/Revert, Run), and the repo-load form it
 * used to open as a chrome row is now an overlay over the editor — a panel that
 * covers the document it is about to replace, rather than pushing it down.
 *
 * What is left here is the seam between App's editor state and CodeMirror,
 * which is why it stays a component of its own rather than folding back into
 * the config column: the column is at the depth ratchet's limit.
 */

interface Props {
  /** Roadmap 016: bumped to remount CodeMirror — see App.tsx's `editorKey`. */
  editorKey: number;
  editorRef: RefObject<ConfigEditorHandle | null>;
  fileName: string;
  value: string;
  onChange: (value: string) => void;
  /** Roadmap 068: ⌘⏎ from inside the editor runs the pipeline. */
  onRun: () => void;
  presetHover: PresetHoverContext | null;
  /** Roadmap 075: the card's title bar — `ConfigToolbar`, built by the column. */
  toolbar: ReactNode;
  /** Roadmap 075: the repo-load overlay while it is open, else null. */
  overlay: ReactNode;
}

export function ConfigEditorCard({
  editorKey,
  editorRef,
  fileName,
  value,
  onChange,
  onRun,
  presetHover,
  toolbar,
  overlay,
}: Props) {
  return (
    <ConfigEditor
      key={editorKey}
      ref={editorRef}
      fileName={fileName}
      value={value}
      onChange={onChange}
      onRun={onRun}
      presetHover={presetHover}
      titleBar={toolbar}
      overlay={overlay}
    />
  );
}
