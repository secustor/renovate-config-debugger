import type { ReactNode, RefObject } from "react";
import type { StageId } from "@renovate-config-debugger/engine";
import type { StoredUser } from "@/platform/oauth";
import type { ConfigEditorHandle } from "@/features/editor/ConfigEditor";
import { ConfigEditorCard } from "@/features/editor/ConfigEditorCard";
import { ConfigToolbar } from "@/features/editor/ConfigToolbar";
import { type AuthState, GithubAuthHint } from "@/components/GithubAuthHint";
import { LandingIntro, LandingLaunch, LandingSteps } from "@/features/editor/Landing";
import { NoticeBar } from "@/features/editor/NoticeBar";
import { RepoLoadOverlay } from "@/features/editor/RepoLoadOverlay";
import type { RepoPickerView } from "@/features/editor/RepoPicker";
import { StageRailPreview } from "@/components/StageRail";
import type { PresetHoverContext } from "@/lib/preset-hover";

/** Roadmap 075: what Run refuses while the repo-load overlay is up — the
 *  design's disabled-primary rule, spelled once for both Run buttons. */
const RUN_BLOCKED_BY_REPO_FORM = "Finish or cancel Load from repo first";

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
  /** Roadmap 085: the signed-in repo picker inside the overlay (null while
   *  signed out), and whose repositories it lists. */
  repoPicker: RepoPickerView | null;
  authUser: StoredUser | null;
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
  /** Roadmap 076 review: fired by the landing rail when its stage-walk
   *  narration has shown every frame — App holds the FIRST result commit for
   *  it, so the transition always plays whole (see StageRailPreview). */
  onLandingWalkEnd: () => void;
  /** The stages the requested run will skip (absent 008 layers) — the walk
   *  shows them hollow instead of claiming they ran (see StageRailPreview). */
  previewSkippedStages: readonly StageId[];
  // AdvancedZone is built by App.tsx and handed down as an already-constructed
  // element: the zone's props are App's state, and passing the built element
  // keeps them there rather than threading a dozen of them through this
  // column, which only decides WHERE the zone sits.
  advancedZone: ReactNode;
  // Fatal error / GitHub-auth hint / notice, in render order
  fatal: string | null;
  repoAuthHint: { rateLimited: boolean } | null;
  authState: AuthState;
  notice: string | null;
  onDismissNotice: () => void;
}

/**
 * Everything a run is asked FOR: the editor and its toolbar, whatever failure
 * or notice the last gesture produced, and the advanced zone.
 *
 * Roadmap 075 (v2, iteration 2) gave it two shapes rather than one column with
 * a welcome panel on top:
 *
 * - **Landing** (no result yet) — a centered reading column: the page's
 *   question, the editor, the two example shortcuts, one large Run, and a
 *   preview of the stages the run walks (which narrates itself while the run
 *   is in flight). Everything a first-time reader does not need is simply
 *   absent here (the headless note, and — since the 076 review — the advanced
 *   zone), so the screen has one question and one answer to it.
 * - **Shell** (a result exists) — the left pane of the two-pane frame: the
 *   editor filling the pane, the advanced zone, and a footer restating the one
 *   promise the landing's subtitle made, for a reader who never saw it.
 *
 * The parts that do not change between them — the editor card, its toolbar, the
 * repo-load overlay, the banners — are rendered once, by this component, in
 * both.
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
  repoPicker,
  authUser,
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
  onLandingWalkEnd,
  previewSkippedStages,
  advancedZone,
  fatal,
  repoAuthHint,
  authState,
  notice,
  onDismissNotice,
}: ConfigColumnProps) {
  // Roadmap 075: the repo-load overlay covers the document Run acts on, so Run
  // says why it is refusing rather than acting on a config the user is halfway
  // through replacing.
  const runBlockedReason = repoFormOpen ? RUN_BLOCKED_BY_REPO_FORM : null;
  const toolbar = (
    <ConfigToolbar
      fileName={fileName}
      onFileNameChange={onFileNameChange}
      repoFormOpen={repoFormOpen}
      repoToggleRef={repoToggleRef}
      onToggleRepoForm={onToggleRepoForm}
      canRevert={canRevert}
      onRevert={onRevert}
      onFormat={onFormat}
      untrustedHost={untrustedHost}
      onTrustUntrustedHost={onTrustUntrustedHost}
      // Roadmap 077: the document's own copy — lazy, so typing never
      // serializes anything.
      getConfigText={() => value}
      // The landing's title bar carries the DOCUMENT only; Format and Run
      // arrive with the result (the landing has its own, larger Run — one
      // primary action per screen; Share lives in the header since 077).
      inShell={hasResult}
      running={running}
      onRun={onRun}
      onRunIntent={onRunIntent}
      blockedReason={runBlockedReason}
    />
  );
  const repoOverlay = repoFormOpen ? (
    <RepoLoadOverlay
      repo={repo}
      onRepoChange={onRepoChange}
      gitRef={gitRef}
      onRefChange={onRefChange}
      loading={repoLoading}
      onSubmit={onLoadRepo}
      onClose={onCloseRepoForm}
      inheritAuto={inheritAuto}
      onInheritAutoChange={onInheritAutoChange}
      inheritRepo={inheritRepo}
      onInheritRepoChange={onInheritRepoChange}
      inheritFile={inheritFile}
      onInheritFileChange={onInheritFileChange}
      picker={repoPicker}
      pickerUser={authUser}
    />
  ) : null;
  const editor = (
    <div className="editor-shell">
      <ConfigEditorCard
        editorKey={editorKey}
        editorRef={editorRef}
        fileName={fileName}
        value={value}
        onChange={onChange}
        onRun={onRun}
        presetHover={presetHover}
        toolbar={toolbar}
        overlay={repoOverlay}
      />
    </div>
  );

  return (
    // Roadmap 068: the skip link's target. `tabIndex={-1}` because a fragment
    // jump to a non-focusable container moves the scroll but not the focus,
    // which is the half that matters to a keyboard user.
    <div
      className={`config-col${hasResult ? "" : " landing"}`}
      id="config-column"
      tabIndex={-1}
      ref={columnRef}
    >
      {hasResult ? null : <LandingIntro />}

      {editor}

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
      <div role="alert">{fatal ? <p className="fatal-error">{fatal}</p> : null}</div>
      {repoAuthHint ? (
        <GithubAuthHint
          authState={authState}
          rateLimited={repoAuthHint.rateLimited}
          onSignIn={onSignIn}
        />
      ) : null}
      {notice ? <NoticeBar message={notice} onDismiss={onDismissNotice} /> : null}

      {/* The landing trio, under ONE guard: they appear and disappear together
          (that IS the landing), so three copies of the same condition only
          invited them to drift apart. */}
      {hasResult ? null : (
        <>
          <LandingLaunch
            onTryExample={onTryExample}
            onAnalyzeThisProject={onAnalyzeThisProject}
            running={running}
            onRun={onRun}
            onRunIntent={onRunIntent}
            blockedReason={runBlockedReason}
          />
          {/* Roadmap 075 (the landing transition): the preview walks its own
              stage list while the run it is previewing is in flight — see
              StageRail. */}
          <StageRailPreview
            running={running}
            onWalkEnd={onLandingWalkEnd}
            skippedStages={previewSkippedStages}
          />
          <LandingSteps />
        </>
      )}

      {/* Roadmap 076/077: the advanced zone is shell-only, and Proposal F puts
          it at the foot of the pane — a one-line bar whose panel opens upward,
          so the bar itself never moves. The landing kept a muted copy through
          075 so host tokens could be set before the first run; with the drawer
          narrowed to hosts & credentials that pre-run case is served the same
          way everything else is — run first, and the failed fetch's own banner
          (auth hint, preset-tree failure) points at the drawer that is now on
          screen. */}
      {hasResult ? advancedZone : null}

      {hasResult ? (
        // Roadmap 075 (iteration 6): the second half is a true statement about
        // what an edit DOES — the Tests tab re-checks every pinned descriptor
        // against each run — rather than only where it happens.
        <p className="pane-foot">
          Everything runs in your browser · edits re-check your pinned tests on Run.
        </p>
      ) : null}
    </div>
  );
}
