import { type DragEvent, useEffect, useRef, useState } from "react";
import { countNoun, type DataTableNoun } from "@/components/data-table";
import { SAMPLE_LOG, SAMPLE_LOG_NAME } from "@/data/sample-renovate-log";
import { errorMessage } from "@/lib/errors";
import { nf, plural } from "@/lib/format";
import type { LogDraft, LogPreview, RepoDepFile, RepoDepsView } from "@/types/repo";

/**
 * Roadmap 095 — the load overlay's "Renovate log" tab: paste, upload or drop a
 * JSON debug log; it is parsed as it arrives and previewed per package file
 * before "Load N dependencies" makes it the dependency source.
 */

export interface LogLoadPanelProps {
  draft: LogDraft;
  onDraftChange: (draft: LogDraft) => void;
  /** null while the draft is empty. */
  preview: LogPreview | null;
  alsoLoadConfig: boolean;
  onAlsoLoadConfigChange: (value: boolean) => void;
  loading: boolean;
  onLoad: () => void;
  onClose: () => void;
}

const LOG_FILE_TYPES = ".log,.json,.ndjson,.jsonl,.txt";
const PLACEHOLDER =
  'Paste a Renovate log (one JSON object per line) or just its "packageFiles with updates" entry…\n\n' +
  "Renovate writes packageFiles with updates at debug level — run with LOG_LEVEL=debug and LOG_FORMAT=json, or use Mend’s Download log.";
const DEP_NOUN: DataTableNoun = { one: "dependency", many: "dependencies" };

/** Octicon `upload`, inlined — single-use. */
function UploadIcon() {
  return (
    <svg className="log-upload-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z" />
      <path d="M11.78 4.72a.749.749 0 1 1-1.06 1.06L8.75 3.811V9.5a.75.75 0 0 1-1.5 0V3.811L5.28 5.78a.749.749 0 1 1-1.06-1.06l3.25-3.25a.749.749 0 0 1 1.06 0l3.25 3.25Z" />
    </svg>
  );
}

function LogPickRow({ onFile, onSample }: { onFile: (file: File) => void; onSample: () => void }) {
  return (
    <div className="log-pick-row">
      <label className="btn-secondary log-upload">
        <UploadIcon />
        Upload log file…
        <input
          type="file"
          hidden
          accept={LOG_FILE_TYPES}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file !== undefined) {
              onFile(file);
            }
          }}
        />
      </label>
      <span className="log-pick-hint">or drop one here · .log, .json, .ndjson</span>
      <button type="button" className="digest-link log-sample" onClick={onSample}>
        use a sample log
      </button>
    </div>
  );
}

function LogEntry({
  text,
  error,
  focusOnMount,
  onText,
  onFile,
  onSample,
}: {
  text: string;
  error: string | null;
  /** Focus the textarea on mount — after Replace, not on the overlay's open. */
  focusOnMount: boolean;
  onText: (text: string) => void;
  onFile: (file: File) => void;
  onSample: () => void;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusOnMount) {
      textRef.current?.focus();
    }
  }, [focusOnMount]);
  return (
    <>
      <textarea
        ref={textRef}
        className="log-load-input"
        aria-label="Paste a Renovate log"
        placeholder={PLACEHOLDER}
        spellCheck={false}
        rows={6}
        value={text}
        onChange={(e) => onText(e.target.value)}
      />
      <LogPickRow onFile={onFile} onSample={onSample} />
      {error === null ? null : (
        <p className="log-load-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function LogFileRow({ file }: { file: RepoDepFile }) {
  const updates = file.updateCount ?? 0;
  return (
    <tr>
      <td className="log-files-path">{file.path}</td>
      <td>{file.managers.join(", ")}</td>
      <td className="log-files-num">{nf.format(file.depCount)}</td>
      <td className={`log-files-num ${updates > 0 ? "log-files-updates" : "log-files-none"}`}>
        {nf.format(updates)}
      </td>
    </tr>
  );
}

function LogFilesTable({ files }: { files: readonly RepoDepFile[] }) {
  return (
    <table className="log-files">
      <thead>
        <tr>
          <th scope="col">Package file</th>
          <th scope="col">Manager</th>
          <th scope="col" className="log-files-num">
            Deps
          </th>
          <th scope="col" className="log-files-num">
            Updates
          </th>
        </tr>
      </thead>
      <tbody>
        {files.map((file) => (
          <LogFileRow key={file.path} file={file} />
        ))}
      </tbody>
    </table>
  );
}

/** `3 package files · 5 deps · 3 updates · base main · Renovate 44.97.5`. */
function previewMeta(view: RepoDepsView): string {
  const updates = view.files.reduce((sum, file) => sum + (file.updateCount ?? 0), 0);
  const parts = [
    plural(view.files.length, "package file"),
    plural(view.deps.length, "dep"),
    plural(updates, "update"),
  ];
  if (view.source.kind === "log") {
    if (view.source.baseBranch !== null) {
      parts.push(`base ${view.source.baseBranch}`);
    }
    if (view.source.renovateVersion !== null) {
      parts.push(`Renovate ${view.source.renovateVersion}`);
    }
  }
  return parts.join(" · ");
}

function LogParsed({
  name,
  view,
  onReplace,
}: {
  name: string;
  view: RepoDepsView;
  onReplace: () => void;
}) {
  return (
    <>
      <div className="log-parsed-head">
        <strong className="log-parsed-name">{name}</strong>
        <span className="log-parsed-meta">{previewMeta(view)}</span>
        <button type="button" className="btn-secondary" onClick={onReplace}>
          Replace
        </button>
      </div>
      <LogFilesTable files={view.files} />
      <p className="log-load-hint">
        Dependencies show up in the <strong>Dependencies</strong> tab; their updates become pinnable
        in <strong>Tests › Pin</strong>. The editor’s config is left as is.
      </p>
    </>
  );
}

function LogFooter({
  slug,
  alsoLoadConfig,
  onAlsoLoadConfigChange,
  count,
  loading,
  onClose,
}: {
  slug: string | null;
  alsoLoadConfig: boolean;
  onAlsoLoadConfigChange: (value: boolean) => void;
  /** Rows the load adds; null until a log is parsed. */
  count: number | null;
  loading: boolean;
  onClose: () => void;
}) {
  let label = count === null ? "Load dependencies" : `Load ${countNoun(count, DEP_NOUN)}`;
  if (loading) {
    label = "Loading…";
  }
  return (
    <div className="log-load-footer">
      {slug === null ? null : (
        <label className="log-also-load">
          <input
            type="checkbox"
            checked={alsoLoadConfig}
            onChange={(e) => onAlsoLoadConfigChange(e.target.checked)}
          />
          also load <code>{slug}</code>’s config into the editor
        </label>
      )}
      <span className="toolbar-spacer" />
      <button type="button" className="btn-secondary" onClick={onClose}>
        Cancel
      </button>
      <button type="submit" className="btn-primary" disabled={count === null || loading}>
        {label}
      </button>
    </div>
  );
}

export function LogLoadPanel({
  draft,
  onDraftChange,
  preview,
  alsoLoadConfig,
  onAlsoLoadConfigChange,
  loading,
  onLoad,
  onClose,
}: LogLoadPanelProps) {
  const [dragging, setDragging] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [replaced, setReplaced] = useState(false);
  const view = preview?.ok === true ? preview.view : null;
  const slug = view?.source.kind === "log" ? view.source.slug : null;
  const error = readError ?? (preview?.ok === false ? preview.error : null);

  async function readFile(file: File) {
    setReadError(null);
    try {
      onDraftChange({ text: await file.text(), name: file.name });
    } catch (err) {
      setReadError(`Couldn’t read ${file.name}: ${errorMessage(err)}`);
    }
  }

  function onDrop(e: DragEvent<HTMLFormElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file !== undefined) {
      void readFile(file);
    }
  }

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- drag-and-drop only: the drop is a shortcut for the upload button and textarea inside, which stay the keyboard path.
    <form
      className={`log-load${dragging ? " dragging" : ""}`}
      aria-label="Load from a Renovate log"
      onSubmit={(e) => {
        e.preventDefault();
        onLoad();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) {
          setDragging(false);
        }
      }}
      onDrop={onDrop}
    >
      {view === null ? (
        <LogEntry
          text={draft.text}
          error={error}
          focusOnMount={replaced}
          onText={(text) => {
            setReadError(null);
            onDraftChange({ text, name: null });
          }}
          onFile={(file) => void readFile(file)}
          onSample={() => onDraftChange({ text: SAMPLE_LOG, name: SAMPLE_LOG_NAME })}
        />
      ) : (
        <LogParsed
          name={draft.name ?? "pasted log"}
          view={view}
          onReplace={() => {
            setReplaced(true);
            onDraftChange({ text: "", name: null });
          }}
        />
      )}
      <LogFooter
        slug={slug}
        alsoLoadConfig={alsoLoadConfig}
        onAlsoLoadConfigChange={onAlsoLoadConfigChange}
        count={view === null ? null : view.deps.length}
        loading={loading}
        onClose={onClose}
      />
    </form>
  );
}
