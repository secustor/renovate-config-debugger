import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { nextTabIndex } from "@/lib/roving-tabs";
import { anyModifierHeld } from "@/lib/shortcuts";
import { type LogLoadPanelProps, LogLoadPanel } from "./LogLoadPanel";
import { type RepoLoadFormProps, RepoLoadForm } from "./RepoLoadForm";
import type { LoadTab } from "@/types/repo";

/**
 * Roadmap 075 — the load form as an overlay over the editor pane: a panel that
 * covers the document a load replaces instead of pushing it out of the pane.
 * Roadmap 095 gave it two tabs, Repository and Renovate log.
 *
 * The scrim is a real button so click-to-dismiss is reachable and announced;
 * Cancel and Escape close it too. While it is up the Run BUTTONS are disabled
 * (`ConfigColumn`'s `runBlockedReason`); ⌘⏎ still runs.
 *
 * Both panels stay mounted (hidden when inactive), so a tab switch keeps what
 * was typed and never moves focus out of the tab strip.
 */

const TABS: readonly { id: LoadTab; label: string; hint: string }[] = [
  { id: "repo", label: "Repository", hint: "full experience: config, dependencies and tests" },
  { id: "log", label: "Renovate log", hint: "dependencies for Tests and the Dependencies tab" },
];

const tabId = (id: LoadTab) => `load-tab-${id}`;
const panelId = (id: LoadTab) => `load-panel-${id}`;

function LoadTabs({ tab, onTabChange }: { tab: LoadTab; onTabChange: (tab: LoadTab) => void }) {
  const refs = useRef(new Map<LoadTab, HTMLButtonElement>());
  const [openedOn] = useState(tab);
  // Opened on the log tab (Tests › Paste JSON): focus follows the reader there.
  useEffect(() => {
    if (openedOn === "log") {
      refs.current.get("log")?.focus();
    }
  }, [openedOn]);

  function rove(e: KeyboardEvent<HTMLDivElement>) {
    if (anyModifierHeld(e)) {
      return;
    }
    const nextAt = nextTabIndex(
      e.key,
      TABS.findIndex((t) => t.id === tab),
      TABS.length,
    );
    const next = nextAt === null ? undefined : TABS[nextAt];
    if (next === undefined) {
      return;
    }
    e.preventDefault();
    onTabChange(next.id);
    refs.current.get(next.id)?.focus();
  }

  return (
    // oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- the composite-tablist pattern (AddTestBox's strip): the roving tabindex lives on the tab buttons, and `rove` handles their arrow keys by delegation.
    <div className="tab-bar load-tabs" role="tablist" aria-label="Load from" onKeyDown={rove}>
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={tabId(t.id)}
          aria-selected={tab === t.id}
          aria-controls={panelId(t.id)}
          tabIndex={tab === t.id ? 0 : -1}
          className={`tab${tab === t.id ? " active" : ""}`}
          ref={(el) => {
            if (el) {
              refs.current.set(t.id, el);
            }
          }}
          onClick={() => onTabChange(t.id)}
        >
          {t.label}
        </button>
      ))}
      <span className="load-tabs-hint">{TABS.find((t) => t.id === tab)?.hint}</span>
    </div>
  );
}

export function LoadOverlay({
  tab,
  onTabChange,
  repo,
  log,
}: {
  tab: LoadTab;
  onTabChange: (tab: LoadTab) => void;
  repo: RepoLoadFormProps;
  log: LogLoadPanelProps;
}) {
  return (
    <div className="repo-overlay">
      <button
        type="button"
        className="repo-overlay-scrim"
        aria-label="Cancel loading"
        onClick={repo.onClose}
      />
      <div className="load-card">
        <LoadTabs tab={tab} onTabChange={onTabChange} />
        <div
          role="tabpanel"
          id={panelId("repo")}
          aria-labelledby={tabId("repo")}
          hidden={tab !== "repo"}
        >
          <RepoLoadForm {...repo} />
        </div>
        <div
          role="tabpanel"
          id={panelId("log")}
          aria-labelledby={tabId("log")}
          hidden={tab !== "log"}
        >
          <LogLoadPanel {...log} />
        </div>
      </div>
    </div>
  );
}
