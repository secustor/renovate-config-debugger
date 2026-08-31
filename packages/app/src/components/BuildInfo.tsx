import { type RefObject, useId, useState } from "react";
import {
  BUILD_INFO,
  type BuildIdentity,
  commitUrl,
  formatCommitTime,
  formatVersion,
  shortCommit,
  verifyCommands,
} from "@/lib/build-info";
import { CopyButton } from "@/components/CopyButton";
import { ESCAPE_PRIORITY } from "@/lib/escape-stack";
import { useAnchoredPopover } from "@/hooks/use-anchored-popover";

/**
 * Roadmap 088 — "verify this build": the popover that lets a reader check the
 * served bundle really is CI's build of the open-source code, plus its three
 * anchors (the ⓘ beside the landing subtitle, the landing's build line, the
 * pane-foot stamp). Design: `Build Provenance.dc.html`.
 *
 * Deliberately NOT called "provenance" anywhere user-facing — that word
 * already means config-value provenance (which layer set an option) in this
 * app; here the copy says "build" and "verify".
 *
 * Every anchor renders nothing when `BUILD_INFO` is null (a build without
 * git, e.g. the Docker image): no identity, nothing to verify.
 */

const TABS = [
  { id: "attest", label: "gh attestation" },
  { id: "rebuild", label: "rebuild & diff" },
] as const;
type VerifyTab = (typeof TABS)[number]["id"];

function BuildIdentityLine({ info }: { info: BuildIdentity }) {
  const time = info.commitTime ? formatCommitTime(info.commitTime) : null;
  // formatVersion says whether this commit IS the tagged release or sits
  // after it ("v0.5.0" vs "v0.5.0 + 3 commits").
  const version = formatVersion(info);
  return (
    <p className="build-info-id">
      {version ? `${version} · ` : null}
      <a href={commitUrl(info)} target="_blank" rel="noreferrer">
        {shortCommit(info)}
      </a>
      {time ? ` · ${time}` : null}
    </p>
  );
}

function VerifyTabs({ tab, onPick }: { tab: VerifyTab; onPick: (tab: VerifyTab) => void }) {
  return (
    <div className="build-info-tabs">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className="build-info-tab"
          aria-pressed={tab === t.id}
          onClick={() => onPick(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function VerifyCommand({
  info,
  tab,
  command,
}: {
  info: BuildIdentity;
  tab: VerifyTab;
  command: string;
}) {
  const note =
    tab === "attest"
      ? `Checks GitHub's signed attestation that CI built this from ${shortCommit(info)}. Every served file is an attested subject — the same command verifies any downloaded asset.`
      : `Clones the source, rebuilds ${shortCommit(info)} with the pinned toolchain (needs mise), and diffs every served asset hash against this deployment.`;
  return (
    <div className="build-info-cmd-wrap">
      <pre className="build-info-cmd">
        <span className="build-info-prompt" aria-hidden="true">
          ${" "}
        </span>
        {command}
      </pre>
      <CopyButton
        iconOnly
        className="build-info-copy"
        getText={() => command}
        label="Copy command"
      />
      <p className="build-info-note">{note}</p>
    </div>
  );
}

interface PanelProps {
  info: BuildIdentity;
  panelId: string;
  panelRef: RefObject<HTMLDivElement | null>;
  /** Where the panel sits relative to its anchor — a CSS modifier class. */
  placement: "below-center" | "above-center" | "above-end";
}

function BuildInfoPanel({ info, panelId, panelRef, placement }: PanelProps) {
  const [tab, setTab] = useState<VerifyTab>("attest");
  const commands = verifyCommands(info, window.location.origin);
  return (
    // tabIndex: a click on non-interactive panel content must settle focus ON
    // the panel — without it, focus falls to the nearest focusable ancestor
    // (the config column is a tabindex=-1 skip-link target), and the hook's
    // focus-left close fires for a click INSIDE the panel.
    <div className={`build-info-panel ${placement}`} id={panelId} ref={panelRef} tabIndex={-1}>
      <BuildIdentityLine info={info} />
      <VerifyTabs tab={tab} onPick={setTab} />
      <VerifyCommand
        info={info}
        tab={tab}
        command={tab === "attest" ? commands.attest : commands.rebuild}
      />
    </div>
  );
}

/** Octicon `info`, inlined like CopyButton's icons (031: no icon dep). */
function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
    </svg>
  );
}

function AboutBuildTrigger({ info }: { info: BuildIdentity }) {
  const { open, triggerRef, panelRef, toggle } = useAnchoredPopover(ESCAPE_PRIORITY.popover);
  const panelId = useId();
  return (
    <span className="build-info-anchor">
      <button
        type="button"
        ref={triggerRef}
        className="build-info-about"
        aria-label="About this build"
        title="About this build"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        <InfoIcon />
      </button>
      {open ? (
        <BuildInfoPanel
          info={info}
          panelId={panelId}
          panelRef={panelRef}
          placement="below-center"
        />
      ) : null}
    </span>
  );
}

/** The ⓘ beside the landing subtitle. */
export function AboutBuildButton() {
  return BUILD_INFO ? <AboutBuildTrigger info={BUILD_INFO} /> : null;
}

function BuildVerifyLineInner({ info }: { info: BuildIdentity }) {
  const { open, triggerRef, panelRef, toggle } = useAnchoredPopover(ESCAPE_PRIORITY.popover);
  const panelId = useId();
  // The committer date's day, as the committer wrote it — %cI's ISO prefix.
  const built = info.commitTime?.slice(0, 10) ?? null;
  return (
    <div className="build-info-line">
      <span>
        debugger {info.version ? `v${info.version} · ` : ""}
        <a href={commitUrl(info)} target="_blank" rel="noreferrer">
          {shortCommit(info)}
        </a>
        {built ? ` · built ${built}` : ""} —{" "}
      </span>
      <button
        type="button"
        ref={triggerRef}
        className="build-info-verify"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        verify this build
      </button>
      {open ? (
        <BuildInfoPanel
          info={info}
          panelId={panelId}
          panelRef={panelRef}
          placement="above-center"
        />
      ) : null}
    </div>
  );
}

/** The landing's closing line: the deployment's identity, and the way in. */
export function BuildVerifyLine() {
  return BUILD_INFO ? <BuildVerifyLineInner info={BUILD_INFO} /> : null;
}

function BuildStampInner({ info }: { info: BuildIdentity }) {
  const { open, triggerRef, panelRef, toggle } = useAnchoredPopover(ESCAPE_PRIORITY.popover);
  const panelId = useId();
  return (
    <span className="build-info-anchor build-info-stamp-anchor">
      <button
        type="button"
        ref={triggerRef}
        className="build-info-stamp"
        title="About this build"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        · {info.version ? `v${info.version} ` : ""}
        {shortCommit(info)}
      </button>
      {open ? (
        <BuildInfoPanel info={info} panelId={panelId} panelRef={panelRef} placement="above-end" />
      ) : null}
    </span>
  );
}

/** The pane-foot's version stamp — the shell reader's way to the same panel. */
export function BuildStamp() {
  return BUILD_INFO ? <BuildStampInner info={BUILD_INFO} /> : null;
}
