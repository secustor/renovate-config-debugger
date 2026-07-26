import type { RefObject } from "react";
import { ConfigEditor, type ConfigEditorHandle } from "./ConfigEditor";
import { RepoLoadForm } from "./RepoLoadForm";
import type { PresetHoverContext } from "../preset-hover";

/**
 * Roadmap 039/040 — the editor card with its own chrome: loading a repo config
 * REPLACES this card's content, so the affordance sits on the card it acts on
 * (a quiet button in the title bar, where the fetched file name lands too) and
 * the form it opens is the card's chrome row. Collapsed by default; the form
 * only exists while it is open.
 *
 * Extracted from App.tsx by 040's depth ratchet: the title-action/chrome-row
 * markup is two elements deep inside a prop, which the config column has no
 * room left for.
 */

interface Props {
  /** Roadmap 016: bumped to remount CodeMirror — see App.tsx's `editorKey`. */
  editorKey: number;
  editorRef: RefObject<ConfigEditorHandle | null>;
  fileName: string;
  value: string;
  onChange: (value: string) => void;
  presetHover: PresetHoverContext | null;
  repoFormOpen: boolean;
  repoToggleRef: RefObject<HTMLButtonElement | null>;
  onToggleRepoForm: () => void;
  repo: string;
  onRepoChange: (value: string) => void;
  gitRef: string;
  onRefChange: (value: string) => void;
  repoLoading: boolean;
  onLoadRepo: () => void;
  onCloseRepoForm: () => void;
}

export function ConfigEditorCard({
  editorKey,
  editorRef,
  fileName,
  value,
  onChange,
  presetHover,
  repoFormOpen,
  repoToggleRef,
  onToggleRepoForm,
  repo,
  onRepoChange,
  gitRef,
  onRefChange,
  repoLoading,
  onLoadRepo,
  onCloseRepoForm,
}: Props) {
  return (
    <ConfigEditor
      key={editorKey}
      ref={editorRef}
      fileName={fileName}
      value={value}
      onChange={onChange}
      presetHover={presetHover}
      titleAction={
        <button
          ref={repoToggleRef}
          type="button"
          className="btn quiet repo-toggle"
          aria-expanded={repoFormOpen}
          onClick={onToggleRepoForm}
          title="Fetch a Renovate config from a repository into this editor"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
          </svg>
          Load from repo…
        </button>
      }
      chromeRow={
        repoFormOpen ? (
          <RepoLoadForm
            repo={repo}
            onRepoChange={onRepoChange}
            gitRef={gitRef}
            onRefChange={onRefChange}
            loading={repoLoading}
            onSubmit={onLoadRepo}
            onClose={onCloseRepoForm}
          />
        ) : null
      }
    />
  );
}
