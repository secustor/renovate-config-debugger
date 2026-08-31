/**
 * Roadmap 086 (the 048-deferred state-sharing ruling): App's four message
 * surfaces — the fatal banner, the dismissable notice, the transient toast,
 * and the polite run-outcome live region — as one hook, because they are one
 * concern: what the app is SAYING, on which channel, and when a later event
 * may take it back.
 *
 * The alternating-space device lives here spelled once (`useAlternatingText`,
 * one instance per surface). It exists because a live region (and a
 * `role="alert"` banner) speaks only
 * when its text CHANGES, so raising the identical message twice — the same
 * run outcome, the same unfixed load failure — was silent, and React does not
 * even re-render for it. An invisible trailing space alternates to make every
 * raise a mutation.
 *
 * `applyFatal` vs the raw `setFatal` is the 068 expiry rule and it is
 * load-bearing: a STAMPED message describes something that never ran (a layer
 * that would not parse, a repo load that failed), and a run only clears the
 * banner whose stamp it was already carrying when it was requested
 * (`fatalSeqRef`). A run's own failure goes through `setFatal` directly,
 * unstamped, because the next run's outcome genuinely does supersede it.
 */
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from "react";
import { useTransientValue } from "@/hooks/use-transient-value";

const TOAST_MS = 4500;

/** The alternating trailing space, spelled once for both surfaces that need
 *  it (see this file's header): the returned function stamps a text so two
 *  consecutive raises of the same sentence are still a state MUTATION. */
function useAlternatingText(): (text: string) => string {
  const spacerRef = useRef(false);
  return useCallback((text: string) => {
    spacerRef.current = !spacerRef.current;
    return spacerRef.current ? `${text} ` : text;
  }, []);
}

export interface AppMessages {
  /** The fatal-error banner (`role="alert"` in ConfigColumn). */
  fatal: string | null;
  /** The unstamped write — a RUN's own failure, superseded by the next run. */
  setFatal: Dispatch<SetStateAction<string | null>>;
  /** The stamped raise for everything that did NOT run — see this file's
   *  header. `null` clears without stamping. */
  applyFatal: (next: string | null) => void;
  /** Read by the run path: the stamp a run carries is the banner it may
   *  clear on its way past (see `onRun`/`executeRun`). */
  fatalSeqRef: RefObject<number>;
  /** Non-fatal notices (version drift, load-from-repo results). */
  notice: string | null;
  setNotice: Dispatch<SetStateAction<string | null>>;
  /** Roadmap 023: the transient toast — lands an instrument-triggered re-run
   *  on its consequence without yanking the user's scroll around. */
  toast: string | null;
  showToast: (message: string) => void;
  /** What the polite live region is saying about the last run. */
  runAnnouncement: string;
  /** Roadmap 068: one sentence into the live region — every call speaks, even
   *  a repeat of the same sentence (the alternator makes it a mutation). */
  announceRun: (sentence: string) => void;
  /** Roadmap 068, ninth review: how the NEXT committed result's outcome
   *  sentence starts (`RunOptions.outcomeLead`). Written by `executeRun`
   *  immediately before the commit it describes, read by the announcement
   *  effect that commit triggers. */
  outcomeLeadRef: RefObject<string | null>;
}

export function useAppMessages(): AppMessages {
  const [fatal, setFatal] = useState<string | null>(null);
  // Roadmap 068: the banner carries two kinds of message and they expire
  // differently — this counter stamps the kind a passing run may NOT clear.
  const fatalSeqRef = useRef(0);
  const alternateFatal = useAlternatingText();
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, showToast] = useTransientValue<string>(TOAST_MS);
  const [runAnnouncement, setRunAnnouncement] = useState("");
  const alternateAnnouncement = useAlternatingText();
  const outcomeLeadRef = useRef<string | null>(null);

  const applyFatal = useCallback(
    (next: string | null) => {
      if (next === null) {
        setFatal(null);
        return;
      }
      fatalSeqRef.current += 1;
      setFatal(alternateFatal(next));
    },
    [alternateFatal],
  );

  const announceRun = useCallback(
    (sentence: string) => {
      setRunAnnouncement(alternateAnnouncement(sentence));
    },
    [alternateAnnouncement],
  );

  return {
    fatal,
    setFatal,
    applyFatal,
    fatalSeqRef,
    notice,
    setNotice,
    toast,
    showToast,
    runAnnouncement,
    announceRun,
    outcomeLeadRef,
  };
}
