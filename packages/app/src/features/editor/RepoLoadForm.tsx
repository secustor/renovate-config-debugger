import { useEffect, useRef } from "react";
import { Term } from "@/components/glossary";
import type { StoredUser } from "@/platform/oauth";
import { RepoPicker } from "./RepoPicker";
import type { RepoPickerView } from "@/types/repo";

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
 *
 * Roadmap 045 adds a SECOND row under the inputs (approved mockup variant 1B):
 * an "also load the org's inherited config" checkbox (off by default, corrected
 * 2026-07-26 — see App's `inheritAutoEdit`) plus the exact repo and file the
 * probe will read, as editable prefills. The first row's one-unwrappable-row
 * invariant (035) is untouched — the sub-row is a separate flex row that may
 * wrap — and both rows disappear with the disclosure.
 */

/** The form's whole prop contract. Exported because `RepoLoadOverlay` is the
 *  only way this form is mounted and passes every one of these straight
 *  through — the contract is stated once, here. */
export interface Props {
  repo: string;
  onRepoChange: (value: string) => void;
  gitRef: string;
  onRefChange: (value: string) => void;
  loading: boolean;
  onSubmit: () => void;
  onClose: () => void;
  /** 045: whether a successful load also probes for the inherited config. */
  inheritAuto: boolean;
  onInheritAutoChange: (value: boolean) => void;
  /** The probe target as shown: tracked prefill, or the user's own value. */
  inheritRepo: string;
  onInheritRepoChange: (value: string) => void;
  inheritFile: string;
  onInheritFileChange: (value: string) => void;
  /** Roadmap 085: the signed-in repo picker, or null while signed out — the
   *  form then is exactly the paste-a-reference bar it always was. */
  picker: RepoPickerView | null;
  /** Whose repositories the picker lists — the label's identity glyph. */
  pickerUser: StoredUser | null;
}

export function RepoLoadForm({
  repo,
  onRepoChange,
  gitRef,
  onRefChange,
  loading,
  onSubmit,
  onClose,
  inheritAuto,
  onInheritAutoChange,
  inheritRepo,
  onInheritRepoChange,
  inheritFile,
  onInheritFileChange,
  picker,
  pickerUser,
}: Props) {
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  return (
    // The keydown below listens for a key BUBBLING from the inputs inside,
    // which is what a panel-level Escape has to do; the form itself is never the
    // focus target. The rule's remedy — move the handler to an interactive
    // element — would mean one Escape handler per field.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
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
      {/* `no-border`: the sub-row below carries the chrome row's bottom border,
          so the two read as one block (mockup 045, variant 1B). */}
      <div className="repo-panel no-border">
        <input
          ref={firstFieldRef}
          type="text"
          className="ctl repo-panel-repo"
          aria-label="Repository"
          placeholder={
            picker
              ? "owner/repo, a repository or file URL, or search your repos…"
              : "owner/repo, github.com/owner/repo, or a repository or file URL"
          }
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
        <button type="submit" className="btn-primary" disabled={loading || repo.trim() === ""}>
          {loading ? "Loading…" : "Load"}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
      {/* Roadmap 085: the signed-in picker sits between the reference row and
          the inherit row (the design's "combined" variant) — picking only
          fills the reference field, so everything below applies unchanged. */}
      {picker ? <RepoPicker picker={picker} user={pickerUser} /> : null}
      {/* Roadmap 045, corrected 2026-07-26: the sub-row. Off by default —
          `inheritConfig` itself defaults to false, and the Mend-hosted app
          currently disables it too — auto-checked only when a pasted global
          config sets `inheritConfig: true`. Either way, a network fetch owes
          the user both the term that explains it and the exact target it will
          read. */}
      <div className="repo-panel-row2">
        <label className="repo-panel-inherit">
          <input
            type="checkbox"
            checked={inheritAuto}
            onChange={(e) => onInheritAutoChange(e.target.checked)}
          />
          Also load the org&apos;s <Term id="inheritedConfig">inherited config</Term> from
        </label>
        <input
          type="text"
          className="ctl"
          aria-label="Inherited config repository"
          placeholder="owner/renovate-config"
          value={inheritRepo}
          onChange={(e) => onInheritRepoChange(e.target.value)}
        />
        <input
          type="text"
          className="ctl"
          aria-label="Inherited config file name"
          placeholder="org-inherited-config.json"
          value={inheritFile}
          onChange={(e) => onInheritFileChange(e.target.value)}
        />
      </div>
    </form>
  );
}
