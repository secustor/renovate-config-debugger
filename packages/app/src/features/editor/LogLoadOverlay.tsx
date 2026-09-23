import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";

/**
 * Roadmap 095 — "Load from log…": a Renovate debug log, picked as a file or
 * pasted, becomes the dependency source. Same overlay shell as the repo load;
 * it never touches the editor's document.
 */

export interface LogLoadFormProps {
  loading: boolean;
  error: string | null;
  onLoad: (text: string) => void;
  onClose: () => void;
}

const LOG_FILE_TYPES = ".json,.log,.ndjson,.txt";

function LogLoadForm({ loading, error, onLoad, onClose }: LogLoadFormProps) {
  const [pasted, setPasted] = useState("");
  const [readError, setReadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shownError = readError ?? error;

  useEffect(() => {
    fileRef.current?.focus();
  }, []);

  return (
    <form
      aria-label="Load from Renovate log"
      onSubmit={(e) => {
        e.preventDefault();
        setReadError(null);
        onLoad(pasted);
      }}
    >
      <div className="repo-panel no-border">
        <input
          ref={fileRef}
          type="file"
          className="ctl repo-panel-repo"
          aria-label="Renovate log file"
          accept={LOG_FILE_TYPES}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file !== undefined) {
              setReadError(null);
              void file
                .text()
                .then(onLoad, (err: unknown) =>
                  setReadError(`Could not read ${file.name}: ${errorMessage(err)}`),
                );
            }
          }}
        />
        <button type="submit" className="btn-primary" disabled={loading || pasted.trim() === ""}>
          {loading ? "Loading…" : "Load pasted log"}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
      <div className="repo-panel-row2">
        <textarea
          className="layer-editor"
          aria-label="Paste a Renovate log"
          placeholder="…or paste the output of a run with LOG_LEVEL=debug LOG_FORMAT=json"
          rows={6}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        {shownError === null ? null : (
          <p className="layer-editor-error" role="alert">
            {shownError}
          </p>
        )}
        <p>Parsed in your browser — nothing is sent anywhere.</p>
      </div>
    </form>
  );
}

export function LogLoadOverlay(props: LogLoadFormProps) {
  return (
    <div className="repo-overlay">
      <button
        type="button"
        className="repo-overlay-scrim"
        aria-label="Cancel loading from a Renovate log"
        onClick={props.onClose}
      />
      <LogLoadForm {...props} />
    </div>
  );
}
