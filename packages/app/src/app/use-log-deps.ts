/**
 * Roadmap 095 — the Renovate log as a second dependency source: the load
 * overlay's tab and log draft, the draft parsed as it is typed, and the view a
 * confirmed log produced. The draft dies with the overlay; only the view is
 * held, and nothing here reaches a share link.
 */
import { useCallback, useMemo, useState } from "react";
import { logDepsView } from "@/features/simulator/log-deps";
import { useSyncedReset } from "@/hooks/use-synced-reset";
import { parseRenovateLog } from "@/lib/renovate-log";
import { getRenovateVersion } from "@/platform/run";
import type {
  LoadedRepo,
  LoadOverlayInit,
  LoadTab,
  LogDraft,
  LogPreview,
  RepoDepsView,
} from "@/types/repo";

export interface LogDeps {
  /** The loaded log's view, or null while no log is loaded. */
  view: RepoDepsView | null;
  tab: LoadTab;
  setTab: (tab: LoadTab) => void;
  draft: LogDraft;
  setDraft: (draft: LogDraft) => void;
  /** null while the draft is empty. */
  preview: LogPreview | null;
  alsoLoadConfig: boolean;
  setAlsoLoadConfig: (value: boolean) => void;
  loading: boolean;
  /** Sets the tab (and draft) the overlay opens on; identity-stable. */
  prepare: (initial?: LoadOverlayInit) => void;
  load: () => Promise<void>;
  clear: () => void;
}

interface LogDepsHost {
  loadedRepo: LoadedRepo | null;
  /** The load overlay's open flag — `useRepoLoad` owns it. */
  overlayOpen: boolean;
  closeOverlay: () => void;
  /** Loads a repository's config, as the Repository tab does. */
  loadRepo: (slug: string) => Promise<void>;
}

const EMPTY_DRAFT: LogDraft = { text: "", name: null };

async function pinnedRenovateVersion(): Promise<string | null> {
  try {
    return await getRenovateVersion();
  } catch {
    return null;
  }
}

export function useLogDeps({
  loadedRepo,
  overlayOpen,
  closeOverlay,
  loadRepo,
}: LogDepsHost): LogDeps {
  const [view, setView] = useState<RepoDepsView | null>(null);
  const [tab, setTab] = useState<LoadTab>("repo");
  const [draft, setDraft] = useState<LogDraft>(EMPTY_DRAFT);
  const [alsoLoadConfig, setAlsoLoadConfig] = useState(false);
  const [loading, setLoading] = useState(false);
  // The slug the "also load its config" checkbox is loading: that load keeps
  // the log as the dependency source, any other repository load replaces it.
  const [keepFor, setKeepFor] = useState<string | null>(null);

  useSyncedReset(loadedRepo, () => {
    if (loadedRepo === null) {
      return;
    }
    if (loadedRepo.repo === keepFor) {
      setKeepFor(null);
      return;
    }
    setView(null);
  });

  // The pasted text lives only as long as the overlay. Opening it also drops a
  // "keep" a failed checkbox load left, so a later Repository-tab load replaces.
  useSyncedReset(overlayOpen, () => {
    if (overlayOpen) {
      setKeepFor(null);
    } else {
      setTab("repo");
      setDraft(EMPTY_DRAFT);
      setAlsoLoadConfig(false);
    }
  });

  const parsed = useMemo(
    () => (draft.text.trim() === "" ? null : parseRenovateLog(draft.text)),
    [draft.text],
  );
  const preview = useMemo<LogPreview | null>(() => {
    if (parsed === null) {
      return null;
    }
    return parsed.ok
      ? { ok: true, view: logDepsView(parsed.log, null) }
      : { ok: false, error: parsed.error };
  }, [parsed]);

  const prepare = useCallback((initial?: LoadOverlayInit) => {
    if (initial !== undefined) {
      setTab(initial.tab);
      setDraft({ text: initial.text, name: null });
    }
  }, []);

  async function load() {
    if (parsed?.ok !== true) {
      return;
    }
    setLoading(true);
    const pinned = await pinnedRenovateVersion();
    setView(logDepsView(parsed.log, pinned));
    const slug = alsoLoadConfig ? parsed.log.slug : null;
    if (slug === null) {
      setLoading(false);
      closeOverlay();
      return;
    }
    // The repository load closes the overlay on success, like the Repository
    // tab's; a failed one leaves it open.
    setKeepFor(slug);
    try {
      await loadRepo(slug);
    } finally {
      setLoading(false);
    }
  }

  return {
    view,
    tab,
    setTab,
    draft,
    setDraft,
    preview,
    alsoLoadConfig,
    setAlsoLoadConfig,
    loading,
    prepare,
    load,
    clear: () => {
      setView(null);
      setKeepFor(null);
    },
  };
}
