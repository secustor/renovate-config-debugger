import { useState } from "react";
import { nf } from "@/lib/format";
import type { PinnedTest } from "./pins";
import {
  filterRepoDeps,
  hiddenDepFiles,
  REPO_DEPS_SHOWN,
  type RepoConnectOffer,
  type RepoDep,
  type RepoDepsView,
  type RepoDraft,
} from "./repo-deps";

/**
 * Roadmap 078 — the "From repository" tab: the dependencies Renovate's own
 * extraction found in the loaded repository's package files, each one click
 * from becoming a pinned test. The quick-pin buttons name the update TYPE
 * (patch/minor/major) because extraction cannot know the next version — the
 * draft card, rendered inline right under the picked row (the design's
 * `draftHere`), is where the reader may type one, and "refine any field in
 * Manual" hands the whole descriptor to the form for anything more. The list
 * is capped at REPO_DEPS_SHOWN rows so the tab keeps its height; the footer
 * counts the tail and the search reaches it. The draft's shapes (and what its
 * Pin writes) live in `repo-deps.ts` — this file only draws.
 */

/** The pin standing for this row, if any — matched on the identity fields the
 *  extraction filled, so a pin refined in Manual still claims its row. */
function pinnedAs(pins: readonly PinnedTest[], dep: RepoDep): string | null {
  const hit = pins.find(
    (pin) =>
      pin.form.packageFile === dep.packageFile &&
      (pin.form.packageName === dep.depName || pin.form.depName === dep.depName),
  );
  if (!hit) {
    return null;
  }
  return hit.form.updateType === "" ? "pinned" : hit.form.updateType;
}

const QUICK_TYPES = ["patch", "minor", "major"] as const;

function RepoDepRow({
  dep,
  pinned,
  showQuickPins,
  onQuickPin,
}: {
  dep: RepoDep;
  pinned: string | null;
  /** Hidden at MAX_PINS — same rule as the form's quiet Pin. */
  showQuickPins: boolean;
  onQuickPin: (type: (typeof QUICK_TYPES)[number]) => void;
}) {
  return (
    <li className="pin-repo-row">
      <code className="pin-repo-name">{dep.depName}</code>
      <span className="pin-repo-meta">{dep.meta}</span>
      {pinned !== null ? (
        <span className="pin-repo-pinned">pinned · {pinned}</span>
      ) : showQuickPins ? (
        <span className="pin-repo-quick">
          {QUICK_TYPES.map((type) => (
            <button key={type} type="button" onClick={() => onQuickPin(type)}>
              {type}
            </button>
          ))}
        </span>
      ) : null}
    </li>
  );
}

function RepoDraftSentence({
  draft,
  onNewValue,
  onSubmit,
}: {
  draft: RepoDraft;
  onNewValue: (value: string) => void;
  /** Enter in the next-version input pins — the button says ⏎. */
  onSubmit: () => void;
}) {
  const cur = draft.dep.fill.currentValue ?? draft.dep.fill.currentVersion ?? "";
  return (
    <p className="pin-repo-draft-sentence">
      <span>A</span>
      <strong>{draft.type}</strong>
      <span>update of</span>
      <code>{draft.dep.depName}</code>
      {cur === "" ? null : <span>from</span>}
      {cur === "" ? null : <code>{cur}</code>}
      <span>to</span>
      <input
        aria-label="newValue"
        placeholder="next version"
        value={draft.newValue}
        onChange={(e) => onNewValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <span>in</span>
      <code>{draft.dep.packageFile}</code>
      <span>.</span>
    </p>
  );
}

function RepoDraftCard({
  draft,
  onNewValue,
  onPin,
  onRefine,
  onCancel,
}: {
  draft: RepoDraft;
  onNewValue: (value: string) => void;
  onPin: () => void;
  onRefine: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="pin-repo-draft">
      <RepoDraftSentence draft={draft} onNewValue={onNewValue} onSubmit={onPin} />
      <p className="pin-repo-draft-note">
        pre-filled from its package file — packageFile, current value, manager and datasource came
        along; the next version is yours to name (extraction cannot know it)
      </p>
      <div className="pin-repo-draft-actions">
        <button type="button" className="btn-primary" onClick={onPin}>
          Pin ⏎
        </button>
        <button type="button" className="digest-link" onClick={onRefine}>
          refine any field in Manual →
        </button>
        <button
          type="button"
          className="pin-repo-draft-close"
          aria-label="Discard draft"
          onClick={onCancel}
        >
          ×
        </button>
      </div>
    </div>
  );
}

/** One shown row plus, when the draft was opened from it, the draft card
 *  inline right beneath — the design's `draftHere`. */
function RepoDepItem({
  dep,
  pinned,
  showQuickPins,
  draft,
  onDraftChange,
  onPinDraft,
  onRefineDraft,
}: {
  dep: RepoDep;
  pinned: string | null;
  showQuickPins: boolean;
  draft: RepoDraft | null;
  onDraftChange: (draft: RepoDraft | null) => void;
  onPinDraft: () => void;
  onRefineDraft: () => void;
}) {
  return (
    <>
      <RepoDepRow
        dep={dep}
        pinned={pinned}
        showQuickPins={showQuickPins}
        onQuickPin={(type) => onDraftChange({ dep, type, newValue: "" })}
      />
      {draft !== null && draft.dep.key === dep.key ? (
        <li className="pin-repo-draft-row">
          <RepoDraftCard
            draft={draft}
            onNewValue={(newValue) => onDraftChange({ ...draft, newValue })}
            onPin={onPinDraft}
            onRefine={onRefineDraft}
            onCancel={() => onDraftChange(null)}
          />
        </li>
      ) : null}
    </>
  );
}

/**
 * The design's connect panel — what the From-repository tab shows while no
 * repository is loaded in this session. A share link carries the config and
 * the pinned tests but not repository access; when it also names the repo the
 * config came from, one click grants access and extraction runs. Either way
 * the editor's load-from-repo overlay stays one link away.
 */
export function RepoConnectPanel({ offer }: { offer: RepoConnectOffer }) {
  return (
    <div className="pin-repo-connect">
      <p className="pin-repo-connect-head">The repository isn’t loaded in this session</p>
      {offer.suggestion === null ? (
        <p className="pin-repo-connect-body">
          Load the repository this config belongs to and the dependencies Renovate detects in its
          package files appear here — each one a click from a pinned test.
        </p>
      ) : (
        <p className="pin-repo-connect-body">
          This config was opened from a shared link, which carries the config and pinned tests but
          not repository access. Reload <code>{offer.suggestion}</code> to pick from its detected
          dependencies.
        </p>
      )}
      <div className="pin-repo-connect-actions">
        {offer.suggestion === null ? null : (
          <button type="button" className="btn-primary" onClick={offer.onConnect}>
            Reload {offer.suggestion}
          </button>
        )}
        <button type="button" className="digest-link" onClick={offer.onOpenLoad}>
          {offer.suggestion === null ? "load a repository…" : "load a different repository…"}
        </button>
      </div>
      <p className="pin-repo-connect-note">read-only · your pinned tests are untouched</p>
    </div>
  );
}

/** The counts line under the list — what was read, and what honestly wasn't.
 *  Past the row cap it opens with the design's "… N more across <files>"
 *  instead of the totals (the search placeholder already carries those). */
function RepoDepsFootnote({ view, hidden }: { view: RepoDepsView; hidden: readonly RepoDep[] }) {
  const parts: string[] = [];
  if (hidden.length > 0) {
    const files = hiddenDepFiles(hidden);
    const named = files.slice(0, 4).join(", ") + (files.length > 4 ? ", …" : "");
    parts.push(`… ${nf.format(hidden.length)} more across ${named}`);
  } else {
    parts.push(
      `${nf.format(view.deps.length)} dependencies across ${nf.format(view.fileCount)} package files`,
    );
  }
  parts.push(`detected because you loaded this config from ${view.repo}`);
  if (view.skippedFiles > 0) {
    parts.push(`${nf.format(view.skippedFiles)} matched files not read`);
  }
  if (view.truncated) {
    parts.push("the repository's file listing was truncated");
  }
  return <p className="pin-repo-note">{parts.join(" · ")}</p>;
}

export function RepoDepsTab({
  view,
  pins,
  atLimit,
  draft,
  onDraftChange,
  onPinDraft,
  onRefineDraft,
  onRetry,
}: {
  view: RepoDepsView;
  pins: PinnedTest[];
  atLimit: boolean;
  /** Held by the CALLER (the Paste tab's rule): the panel unmounts on a tab
   *  switch, and a draft must survive a look at the Manual form. */
  draft: RepoDraft | null;
  onDraftChange: (draft: RepoDraft | null) => void;
  onPinDraft: () => void;
  onRefineDraft: () => void;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState("");
  if (view.status === "loading" || view.status === "idle") {
    return <p className="pin-repo-status">Reading {view.repo}’s package files…</p>;
  }
  if (view.status === "error") {
    return (
      <div className="pin-repo-status">
        <p className="sim-empty-guard">
          Could not read {view.repo}: {view.error}
        </p>
        <button type="button" className="btn-quiet" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (view.deps.length === 0) {
    return (
      <div className="pin-repo-status">
        <p>No dependencies detected in the package files the browser engine can read.</p>
        <RepoDepsFootnote view={view} hidden={[]} />
      </div>
    );
  }
  const matches = filterRepoDeps(view.deps, query);
  const shown = matches.slice(0, REPO_DEPS_SHOWN);
  const hidden = matches.slice(REPO_DEPS_SHOWN);
  // A draft whose row is off screen (searched away, or past the cap) still
  // needs its card — it falls back to the list's tail.
  const draftInline = draft !== null && shown.some((dep) => dep.key === draft.dep.key);
  return (
    <div className="pin-repo">
      <div className="pin-repo-search">
        <input
          aria-label="Search detected dependencies"
          placeholder={`Search the ${nf.format(view.deps.length)} dependencies detected across ${nf.format(view.fileCount)} package files…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="pin-repo-source">from {view.repo}</span>
      </div>
      <ul className="pin-repo-list">
        {shown.map((dep) => (
          <RepoDepItem
            key={dep.key}
            dep={dep}
            pinned={pinnedAs(pins, dep)}
            showQuickPins={!atLimit}
            draft={draft}
            onDraftChange={onDraftChange}
            onPinDraft={onPinDraft}
            onRefineDraft={onRefineDraft}
          />
        ))}
      </ul>
      {matches.length === 0 ? (
        <p className="pin-repo-note">Nothing matches “{query}”.</p>
      ) : (
        <RepoDepsFootnote view={view} hidden={hidden} />
      )}
      {draft !== null && !draftInline ? (
        <RepoDraftCard
          draft={draft}
          onNewValue={(newValue) => onDraftChange({ ...draft, newValue })}
          onPin={onPinDraft}
          onRefine={onRefineDraft}
          onCancel={() => onDraftChange(null)}
        />
      ) : null}
    </div>
  );
}
