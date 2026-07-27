import type { ReactNode, RefObject } from "react";
import type { ConfigEditorHandle } from "@/features/editor/ConfigEditor";
import { ConfigEditorCard } from "@/features/editor/ConfigEditorCard";
import { ConfigToolbar } from "@/features/editor/ConfigToolbar";
import { type AuthState, GithubAuthHint } from "@/components/GithubAuthHint";
import { NoticeBar } from "@/features/editor/NoticeBar";
import { WelcomePanel } from "@/features/editor/WelcomePanel";
import type { PresetHoverContext } from "@/lib/preset-hover";
import type { StoredUser } from "@/platform/oauth";

interface ConfigColumnProps {
  hasResult: boolean;
  onTryExample: () => void;
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
  oauthConfigured: boolean;
  signedIn: boolean;
  authUser: StoredUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
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
  hasResult,
  onTryExample,
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
  oauthConfigured,
  signedIn,
  authUser,
  onSignIn,
  onSignOut,
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
    <div className="config-col">
      {hasResult ? null : <WelcomePanel onTryExample={onTryExample} />}

      <ConfigEditorCard
        editorKey={editorKey}
        editorRef={editorRef}
        fileName={fileName}
        value={value}
        onChange={onChange}
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
        oauthConfigured={oauthConfigured}
        signedIn={signedIn}
        authUser={authUser}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        untrustedHost={untrustedHost}
        onTrustUntrustedHost={onTrustUntrustedHost}
        running={running}
        onRun={onRun}
        onRunIntent={onRunIntent}
        onCopyLink={onCopyLink}
      />

      {advancedZone}

      {fatal ? <p style={{ color: "var(--error)" }}>{fatal}</p> : null}
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
