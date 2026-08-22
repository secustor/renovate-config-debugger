import { type Props, RepoLoadForm } from "./RepoLoadForm";

/**
 * Roadmap 075 (v2, iteration 2) — the repo-load form as an overlay over the
 * editor pane.
 *
 * Before v2 it was a chrome row inside the editor card (039), which worked
 * while the card sat on a page that could grow. In the shell the pane is a
 * fixed-height scroller with the editor filling it, so a row pushed the
 * document it is about to REPLACE down and out of the pane. Covering it says
 * the same thing the row said — this panel is about that document — without
 * moving anything.
 *
 * The scrim is a real button, not a decorated div: click-to-dismiss must be
 * reachable by every pointer and announce itself, and the two ways out the form
 * already had (Cancel, Escape) are unchanged. While it is up, Run is disabled
 * (the design's disabled-primary rule): the run would act on a document the
 * user is in the middle of replacing.
 */

export function RepoLoadOverlay({
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
  return (
    <div className="repo-overlay">
      <button
        type="button"
        className="repo-overlay-scrim"
        aria-label="Cancel loading from a repository"
        onClick={onClose}
      />
      <RepoLoadForm
        repo={repo}
        onRepoChange={onRepoChange}
        gitRef={gitRef}
        onRefChange={onRefChange}
        loading={loading}
        onSubmit={onSubmit}
        onClose={onClose}
        inheritAuto={inheritAuto}
        onInheritAutoChange={onInheritAutoChange}
        inheritRepo={inheritRepo}
        onInheritRepoChange={onInheritRepoChange}
        inheritFile={inheritFile}
        onInheritFileChange={onInheritFileChange}
        picker={picker}
        pickerUser={pickerUser}
      />
    </div>
  );
}
