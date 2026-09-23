/**
 * Roadmap 095 — the Renovate log as a second dependency source: the overlay's
 * open state, its inline error, and the view a parsed log produced. The raw
 * text is parsed and dropped; only the view is held, and nothing here reaches
 * a share link.
 */
import { type RefObject, useRef, useState } from "react";
import { logDepsView } from "@/features/simulator/log-deps";
import { ESCAPE_PRIORITY } from "@/lib/escape-stack";
import { useEscapeLayer } from "@/hooks/use-escape-layer";
import { useSyncedReset } from "@/hooks/use-synced-reset";
import { parseRenovateLog } from "@/lib/renovate-log";
import { getRenovateVersion } from "@/platform/run";
import type { LoadedRepo, RepoDepsView } from "@/types/repo";

export interface LogDeps {
  /** The log-derived view, or null while no log is loaded. */
  view: RepoDepsView | null;
  formOpen: boolean;
  toggleRef: RefObject<HTMLButtonElement | null>;
  toggleForm: () => void;
  closeForm: () => void;
  error: string | null;
  loading: boolean;
  load: (text: string) => Promise<void>;
  clear: () => void;
}

async function pinnedRenovateVersion(): Promise<string | null> {
  try {
    return await getRenovateVersion();
  } catch {
    return null;
  }
}

export function useLogDeps(loadedRepo: LoadedRepo | null): LogDeps {
  const [view, setView] = useState<RepoDepsView | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Loading a repository replaces the log as the dependency source.
  useSyncedReset(loadedRepo, () => {
    if (loadedRepo !== null) {
      setView(null);
    }
  });

  function closeForm() {
    setFormOpen(false);
    setError(null);
    toggleRef.current?.focus();
  }

  function toggleForm() {
    if (formOpen) {
      closeForm();
    } else {
      setFormOpen(true);
    }
  }

  useEscapeLayer(formOpen, closeForm, ESCAPE_PRIORITY.popover);

  async function load(text: string) {
    const parsed = parseRenovateLog(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setLoading(true);
    const pinned = await pinnedRenovateVersion();
    setLoading(false);
    setView(logDepsView(parsed.log, pinned));
    closeForm();
  }

  return {
    view,
    formOpen,
    toggleRef,
    toggleForm,
    closeForm,
    error,
    loading,
    load,
    clear: () => setView(null),
  };
}
