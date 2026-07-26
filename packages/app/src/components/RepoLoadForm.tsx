import { useEffect, useRef } from "react";

/**
 * Roadmap 039 — the repo-load disclosure's open state: one chrome row (036
 * grammar) inside the config editor card, between its title bar and the
 * editor whose content a load replaces.
 *
 * It replaced an always-visible form that cost ~64 px of standing height for
 * an action a session performs zero or one times. The row exists only while
 * the disclosure is open, so nothing is left behind when it closes (035).
 *
 * Focus (023): mounting IS opening, so the effect below lands the caret in the
 * repo field; Escape (or Cancel) closes, and the caller returns focus to the
 * button that opened it.
 */

interface Props {
  repo: string;
  onRepoChange: (value: string) => void;
  gitRef: string;
  onRefChange: (value: string) => void;
  loading: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

export function RepoLoadForm({
  repo,
  onRepoChange,
  gitRef,
  onRefChange,
  loading,
  onSubmit,
  onClose,
}: Props) {
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  return (
    <form
      className="repo-panel"
      aria-label="Load from repository"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          // Stops the key from also reaching anything outside the panel (a
          // `<details>` ancestor, the page's own handlers).
          e.stopPropagation();
          onClose();
        }
      }}
    >
      {/* Roadmap 035: both inputs shrink and the two buttons never do, so the
          row stays one row — the submit button can never be orphaned onto a
          line of its own however narrow the config column gets. */}
      <input
        ref={firstFieldRef}
        type="text"
        className="ctl repo-panel-repo"
        aria-label="Repository"
        placeholder="owner/repo, github.com/owner/repo, or a full repository URL"
        value={repo}
        onChange={(e) => onRepoChange(e.target.value)}
      />
      <input
        type="text"
        className="ctl repo-panel-ref"
        aria-label="Branch or tag"
        placeholder="branch or tag (optional)"
        value={gitRef}
        onChange={(e) => onRefChange(e.target.value)}
      />
      <button type="submit" className="btn primary" disabled={loading || repo.trim() === ""}>
        {loading ? "Loading…" : "Load"}
      </button>
      <button type="button" className="btn quiet" onClick={onClose}>
        Cancel
      </button>
    </form>
  );
}
