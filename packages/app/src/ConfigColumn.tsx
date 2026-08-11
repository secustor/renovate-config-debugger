import type { ReactNode, RefObject } from "react";
import type { ConfigEditorHandle } from "@/features/editor/ConfigEditor";
import { ConfigEditorCard } from "@/features/editor/ConfigEditorCard";
import { ConfigToolbar } from "@/features/editor/ConfigToolbar";
import { type AuthState, GithubAuthHint } from "@/components/GithubAuthHint";
import { NoticeBar } from "@/features/editor/NoticeBar";
import { WelcomePanel } from "@/features/editor/WelcomePanel";
import type { PresetHoverContext } from "@/lib/preset-hover";

interface ConfigColumnProps {
  /** Roadmap 068: the column element itself. App asks it one question — was the
   *  gesture that requested a run made in here? — which decides whether the run
   *  resets the results tab (`gestureWantsResultsLanding`). */
  columnRef: RefObject<HTMLDivElement | null>;
  hasResult: boolean;
  onTryExample: () => void;
  onAnalyzeThisProject: () => void;
  // ConfigEditorCard
  editorKey: number;
  editorRef: RefObject<ConfigEditorHandle | null>;
  fileName: "renovate.json" | "renovate.json5";
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
  inheritAuto: boolean;
  onInheritAutoChange: (value: boolean) => void;
  inheritRepo: string;
  onInheritRepoChange: (value: string) => void;
  inheritFile: string;
  onInheritFileChange: (value: string) => void;
  // ConfigToolbar
  onFileNameChange: (value: string) => void;
  canRevert: boolean;
  onRevert: () => void;
  /** Re-indents the editor's text in place — see ConfigToolbar's prop doc. */
  onFormat: () => void;
  /** Roadmap 066: the session itself moved to the header — what is left here
   *  is the auth hint's call to action, which belongs beside the failure. */
  onSignIn: () => void;
  untrustedHost: string | null;
  onTrustUntrustedHost: () => void;
  running: boolean;
  onRun: () => void;
  onRunIntent: () => void;
  onCopyLink: () => Promise<void>;
  // AdvancedZone is built by App.tsx and handed down as an already-constructed
  // element — its import and JSX call stay in App.tsx untouched (that file is
  // owned by a concurrent pass this one must not disturb).
  advancedZone: ReactNode;
  // Fatal error / GitHub-auth hint / notice, in render order
  fatal: string | null;
  repoAuthHint: { rateLimited: boolean } | null;
  authState: AuthState;
  installUrl: string;
  notice: string | null;
  onDismissNotice: () => void;
}

/**
 * The config half of the split: the pre-run welcome panel, the editor card,
 * its action toolbar, the Advanced options zone, and whatever fatal error,
 * GitHub-auth hint or notice follows a run — everything the config column
 * renders, top to bottom.
 */
export function ConfigColumn({
  columnRef,
  hasResult,
  onTryExample,
  onAnalyzeThisProject,
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
  inheritAuto,
  onInheritAutoChange,
  inheritRepo,
  onInheritRepoChange,
  inheritFile,
  onInheritFileChange,
  onFileNameChange,
  canRevert,
  onRevert,
  onFormat,
  onSignIn,
  untrustedHost,
  onTrustUntrustedHost,
  running,
  onRun,
  onRunIntent,
  onCopyLink,
  advancedZone,
  fatal,
  repoAuthHint,
  authState,
  installUrl,
  notice,
  onDismissNotice,
}: ConfigColumnProps) {
  return (
    // Roadmap 068: the skip link's target. `tabIndex={-1}` because a fragment
    // jump to a non-focusable container moves the scroll but not the focus,
    // which is the half that matters to a keyboard user.
    <div className="config-col" id="config-column" tabIndex={-1} ref={columnRef}>
      {hasResult ? null : (
        <WelcomePanel onTryExample={onTryExample} onAnalyzeThisProject={onAnalyzeThisProject} />
      )}

      <ConfigEditorCard
        editorKey={editorKey}
        editorRef={editorRef}
        fileName={fileName}
        value={value}
        onChange={onChange}
        onRun={onRun}
        presetHover={presetHover}
        repoFormOpen={repoFormOpen}
        repoToggleRef={repoToggleRef}
        onToggleRepoForm={onToggleRepoForm}
        repo={repo}
        onRepoChange={onRepoChange}
        gitRef={gitRef}
        onRefChange={onRefChange}
        repoLoading={repoLoading}
        onLoadRepo={onLoadRepo}
        onCloseRepoForm={onCloseRepoForm}
        inheritAuto={inheritAuto}
        onInheritAutoChange={onInheritAutoChange}
        inheritRepo={inheritRepo}
        onInheritRepoChange={onInheritRepoChange}
        inheritFile={inheritFile}
        onInheritFileChange={onInheritFileChange}
      />

      <ConfigToolbar
        fileName={fileName}
        onFileNameChange={onFileNameChange}
        canRevert={canRevert}
        onRevert={onRevert}
        onFormat={onFormat}
        untrustedHost={untrustedHost}
        onTrustUntrustedHost={onTrustUntrustedHost}
        running={running}
        onRun={onRun}
        onRunIntent={onRunIntent}
        onCopyLink={onCopyLink}
      />

      {advancedZone}

      {/* Roadmap 068: the one place a run that threw — or a run that was
          refused before it started — says so, and ⌘⏎ deliberately leaves focus
          in the editor, so a colour alone told a screen-reader user nothing at
          all about the shortcut they had just pressed. The wrapper is always
          mounted for the reason the run's live region is: a region announces a
          CHANGE to something the reader is already watching. Empty, it renders
          nothing and takes no space; the paragraph and its margins still come
          and go with the message.

          The other half of "a CHANGE" is the sender's: raising the identical
          message twice — a repo load that fails the same way twice — is one
          fact to this region and would be silent, so `App.applyFatal` makes
          every raise a mutation. Nothing here can do that on its own; it never
          learns the message was re-sent. */}
      <div role="alert">{fatal ? <p style={{ color: "var(--error)" }}>{fatal}</p> : null}</div>
      {repoAuthHint ? (
        <GithubAuthHint
          authState={authState}
          rateLimited={repoAuthHint.rateLimited}
          onSignIn={onSignIn}
          installUrl={installUrl}
        />
      ) : null}
      {notice ? <NoticeBar message={notice} onDismiss={onDismissNotice} /> : null}
    </div>
  );
}
