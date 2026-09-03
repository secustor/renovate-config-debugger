import { useCallback, useMemo, useState } from "react";
import { jsonFile } from "@renovate-config-debugger/engine/json";
import { DEFAULT_CONFIG } from "@/data/starter-configs";
import { findPackageRuleOffsets } from "@/lib/rule-locate";

/**
 * The document the app is about: its text, where that text came from, and the
 * two ways it can be replaced wholesale.
 *
 * These were five `useState` calls at the top of `App` and two function
 * declarations 350 lines below them, and every one of the five exists only to
 * serve those two functions — the revert baseline is what `loadConfigText`
 * moves, the remount key is what both bump, the filename is what `formatConfig`
 * reads to decide whether reformatting would be lossy. Named together, the
 * cluster is small; scattered, each piece looked arbitrary.
 *
 * What stayed in `App`: `lastRunContent` and `lastRunLayerKey`. They look like
 * they belong here — they are strings compared against `content` — but they
 * describe the RUN, not the document: they answer "is what is on screen still
 * what this text produces", which is the staleness question, and they are
 * written by the run path.
 */

export type ConfigFileName = "renovate.json" | "renovate.json5";

export interface ConfigDocumentHost {
  /** The dismissable notice bar — `formatConfig` explains a refusal there. */
  setNotice: (notice: string | null) => void;
  /** The transient toast — "Already formatted" is not a notice worth keeping. */
  showToast: (message: string) => void;
}

export interface ConfigDocument {
  content: string;
  /** The editor's own onChange. A plain edit moves nothing else. */
  setContent: (text: string) => void;
  fileName: ConfigFileName;
  setFileName: (name: ConfigFileName) => void;
  /**
   * Roadmap 016: bumped to force the CodeMirror instance to remount. The
   * editor's own prop→doc sync defers to a ~200ms "typing latch" that can be
   * starved by browser timer throttling (backgrounded tabs) long enough that a
   * load right after a fast edit never visibly applies, even though `content`
   * state (and everything downstream of it, like Run) is correct — a fresh
   * mount always initializes from `value` directly, sidestepping that debounce.
   */
  editorKey: number;
  /** Roadmap 013: byte offsets of each `packageRules` entry, rescanned per
   *  edit, for the validation-message → editor-line jump. */
  packageRuleOffsets: number[] | null;
  /** Roadmap 016: the one path every authoritative content load goes through —
   *  sets the text, moves the revert baseline to match, and remounts. */
  loadConfigText: (text: string) => void;
  /** Re-indents in place. See the implementation for why it is NOT a load. */
  formatConfig: () => void;
  /** Whether the user has typed since the last authoritative load. */
  canRevert: boolean;
  /** Back to that load. */
  revert: () => void;
}

export function useConfigDocument(host: ConfigDocumentHost): ConfigDocument {
  const { setNotice, showToast } = host;
  const [content, setContent] = useState(DEFAULT_CONFIG);
  /** Roadmap 016: the text last loaded from an authoritative source (the
   *  default, an example, a share link, a repo fetch, or an applied error fix)
   *  — as opposed to whatever the user has typed since. Never changes on a
   *  plain edit. */
  const [loadedContent, setLoadedContent] = useState(DEFAULT_CONFIG);
  const [editorKey, setEditorKey] = useState(0);
  const [fileName, setFileName] = useState<ConfigFileName>("renovate.json");

  const packageRuleOffsets = useMemo(() => findPackageRuleOffsets(content), [content]);

  const loadConfigText = useCallback((text: string) => {
    setContent(text);
    setLoadedContent(text);
    setEditorKey((k) => k + 1);
  }, []);

  /**
   * Design review: a pasted config arrives as one long line and the app had no
   * way to make it readable. Two-space indentation, in place.
   *
   * The parse happens HERE, on the click — never per keystroke, which roadmap
   * 032 measures and this must not make more expensive. Deliberately NOT
   * `loadConfigText`: formatting is an edit, not a load, and moving the revert
   * baseline would quietly retire "Revert to loaded config". Strict JSON only —
   * a `.json5` document that is also valid JSON reformats, and one using
   * JSON5's own syntax says so rather than being silently rewritten into JSON
   * with its comments discarded.
   */
  const formatConfig = useCallback(() => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      setNotice(
        fileName.endsWith(".json5")
          ? "Can't format: this reformats strict JSON, and this document is either invalid or uses JSON5 syntax (comments, unquoted keys, trailing commas) that reformatting would discard."
          : "Can't format: fix the JSON syntax first — the editor's markers show where.",
      );
      return;
    }
    const formatted = jsonFile(parsed);
    if (formatted === content) {
      showToast("Already formatted");
      return;
    }
    setNotice(null);
    setContent(formatted);
    setEditorKey((k) => k + 1);
  }, [content, fileName, setNotice, showToast]);

  const revert = useCallback(() => {
    loadConfigText(loadedContent);
  }, [loadConfigText, loadedContent]);

  return {
    content,
    setContent,
    fileName,
    setFileName,
    editorKey,
    packageRuleOffsets,
    loadConfigText,
    formatConfig,
    canRevert: content !== loadedContent,
    revert,
  };
}
