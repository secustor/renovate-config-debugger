import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

/**
 * Plain-language explanations for Renovate concepts used in the app's own
 * copy (the option hover docs in option-docs.tsx cover config *keys*; this
 * covers the vocabulary around them). Each entry links to the matching
 * docs.renovatebot.com page when one exists.
 */

export interface GlossaryEntry {
  /** The exact Renovate name, shown as the card heading. */
  name: string;
  /** One or two plain sentences — what it means to a repo user. */
  plain: string;
  /** docs.renovatebot.com page, when there is one. */
  url?: string;
}

export const GLOSSARY = {
  preset: {
    name: "presets",
    plain:
      "Reusable, shareable pieces of configuration that your config pulls in through the extends option. Most repos start from the config:recommended preset.",
    url: "https://docs.renovatebot.com/config-presets/",
  },
  extends: {
    name: "extends",
    plain:
      "The config option that lists which presets to pull in. Renovate downloads each one, expands presets referenced inside it, and merges the result under your own settings.",
    url: "https://docs.renovatebot.com/configuration-options/#extends",
  },
  migration: {
    name: "config migration",
    plain:
      "Renovate renames and reshapes options over time. Migration rewrites deprecated settings in your config to their current form before anything else happens.",
    url: "https://docs.renovatebot.com/config-migration/",
  },
  massage: {
    name: "massaging",
    plain:
      "A normalization step: shorthand you are allowed to write (like a single string where a list is expected) is expanded into the full form Renovate works with internally.",
  },
  validation: {
    name: "config validation",
    plain:
      "Every option is checked against Renovate's schema — unknown names, wrong types and misplaced options are reported the same way renovate-config-validator would.",
    url: "https://docs.renovatebot.com/config-validation/",
  },
  globalConfig: {
    name: "global config",
    plain:
      "Bot-level settings a self-hosted Renovate administrator configures on the bot itself (config file, environment or CLI). Repos on the hosted GitHub App don't have one to worry about.",
    url: "https://docs.renovatebot.com/self-hosted-configuration/",
  },
  inheritedConfig: {
    name: "inherited config",
    plain:
      "Org-level defaults a self-hosted admin shares across repositories via the inheritConfig setting. It merges between the bot's global config and each repo's own config.",
    url: "https://docs.renovatebot.com/self-hosted-configuration/#inheritconfig",
  },
  platform: {
    name: "platform",
    plain:
      "Where your repositories are hosted — github, gitlab, and so on. Renovate uses it to resolve presets that live in other repositories on the same host (local> and owner/repo references).",
    url: "https://docs.renovatebot.com/modules/platform/",
  },
  localPreset: {
    name: "local> presets",
    plain:
      "Presets referenced as local>owner/repo (or bare owner/repo) live on the same host as the repository being processed, so resolving them needs a platform and endpoint for context.",
    url: "https://docs.renovatebot.com/config-presets/#local-presets",
  },
  packageRules: {
    name: "packageRules",
    plain:
      "Targeted overrides: each rule matches certain dependencies or updates (by name, manager, update type, …) and applies extra settings — grouping, automerge, labels — only to those.",
    url: "https://docs.renovatebot.com/configuration-options/#packagerules",
  },
  updateType: {
    name: "update types",
    plain:
      "How big a version jump an update is — major, minor, patch, pin, digest and friends. Many rules and presets branch on it.",
    url: "https://docs.renovatebot.com/configuration-options/#matchupdatetypes",
  },
  manager: {
    name: "managers",
    plain:
      "The modules that find dependencies in your repo — npm for package.json, gomod for go.mod, dockerfile, github-actions, and many more.",
    url: "https://docs.renovatebot.com/modules/manager/",
  },
  datasource: {
    name: "datasources",
    plain:
      "Where Renovate looks up available versions for a dependency — the npm registry, Docker Hub, Maven Central, GitHub releases, and so on.",
    url: "https://docs.renovatebot.com/modules/datasource/",
  },
  effectiveConfig: {
    name: "effective config",
    plain:
      "The final result after defaults, presets and your own settings are merged in order — the configuration Renovate actually acts on for your repository.",
  },
  simSourceUrl: {
    name: "sourceUrl",
    plain:
      'The DEPENDENCY\'s own source repository — e.g. "https://github.com/facebook/react" ' +
      "for the react package. This is what matchSourceUrls compares against, and is often the " +
      "only way to identify a dependency across renames or monorepo moves. It is NOT the repo " +
      "Renovate is running in — that's the repository field.",
    url: "https://docs.renovatebot.com/configuration-options/#matchsourceurls",
  },
  simRepository: {
    name: "repository",
    plain:
      'The repo Renovate is running IN — e.g. "your-org/your-repo". This is what ' +
      "matchRepositories compares against. It is NOT the dependency's own source — that's " +
      "the sourceUrl field.",
    url: "https://docs.renovatebot.com/configuration-options/#matchrepositories",
  },
  dependencyDashboard: {
    name: "Dependency Dashboard",
    plain:
      "An issue Renovate keeps open in your repo listing every pending, open and rate-limited update, with checkboxes to trigger them.",
    url: "https://docs.renovatebot.com/key-concepts/dashboard/",
  },
} satisfies Record<string, GlossaryEntry>;

export type TermId = keyof typeof GLOSSARY;

interface CardPos {
  left: number;
  top: number;
  bottom: number;
}

interface CardState {
  entry: GlossaryEntry;
  pos: CardPos;
}

/** Module-level singleton so only one glossary card is ever open. */
let activeHide: (() => void) | null = null;

/**
 * Shared hover/focus behavior for an element that explains itself with a
 * floating card. Same interaction contract as the option hover docs: a grace
 * period lets the pointer travel into the card to click the docs link.
 */
function useHoverCard(entry: GlossaryEntry) {
  const [card, setCard] = useState<CardState | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);

  const hideNow = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    setCard(null);
  }, []);

  const show = useCallback(
    (el: Element) => {
      if (activeHide && activeHide !== hideNow) {
        activeHide();
      }
      activeHide = hideNow;
      window.clearTimeout(hideTimer.current);
      const rect = el.getBoundingClientRect();
      setCard({ entry, pos: { left: rect.left, top: rect.top, bottom: rect.bottom } });
    },
    [entry, hideNow],
  );

  const hide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setCard(null), 250);
  }, []);

  const cancelHide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
  }, []);

  // Scrolling moves the anchor out from under the fixed-position card; hide
  // rather than float a card pointing at nothing.
  useEffect(() => {
    if (!card) {
      return;
    }
    window.addEventListener("scroll", hideNow, { passive: true });
    return () => window.removeEventListener("scroll", hideNow);
  }, [card, hideNow]);

  return { card, show, hide, hideNow, cancelHide };
}

function GlossaryCard({
  card,
  onEnter,
  onLeave,
}: {
  card: CardState;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { entry, pos } = card;
  const width = 320;
  const left = Math.max(8, Math.min(pos.left, window.innerWidth - width - 16));
  const openUpward = pos.bottom > window.innerHeight - 200;
  const style: React.CSSProperties = openUpward
    ? { left, bottom: window.innerHeight - pos.top + 6, maxWidth: width }
    : { left, top: pos.bottom + 6, maxWidth: width };
  return (
    <div
      className="option-card glossary-card"
      style={style}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="option-card-head">
        <code className="option-card-name">{entry.name}</code>
      </div>
      <p className="option-card-desc">{entry.plain}</p>
      {entry.url ? (
        <p className="option-card-row">
          <a href={entry.url} target="_blank" rel="noreferrer">
            Renovate docs ↗
          </a>
        </p>
      ) : null}
    </div>
  );
}

interface TermProps {
  id: TermId;
  /** Visible text; defaults to the glossary entry's exact Renovate name. */
  children?: ReactNode;
}

/**
 * A Renovate term in running copy: dotted underline, and a hover/focus card
 * with the plain-language explanation plus a docs link. Keyboard reachable
 * (Tab to focus, Escape to dismiss).
 */
export function Term({ id, children }: TermProps) {
  const entry = GLOSSARY[id];
  const { card, show, hide, hideNow, cancelHide } = useHoverCard(entry);
  return (
    <>
      <span
        className="term"
        tabIndex={0}
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={hide}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={hide}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            hideNow();
          }
        }}
      >
        {children ?? entry.name}
      </span>
      {card ? <GlossaryCard card={card} onEnter={cancelHide} onLeave={hide} /> : null}
    </>
  );
}

interface ExplainedProps {
  entry: GlossaryEntry;
  /** Renders the anchor element; receives the hover/focus handlers to spread. */
  children: (handlers: {
    onMouseEnter: (e: React.MouseEvent) => void;
    onMouseLeave: () => void;
    onFocus: (e: React.FocusEvent) => void;
    onBlur: () => void;
  }) => ReactNode;
}

/**
 * Attaches a glossary card to an arbitrary element (e.g. a stage chip that is
 * already a button). The child render-prop spreads the handlers on its anchor.
 */
export function Explained({ entry, children }: ExplainedProps) {
  const { card, show, hide, cancelHide } = useHoverCard(entry);
  return (
    <>
      {children({
        onMouseEnter: (e) => show(e.currentTarget),
        onMouseLeave: hide,
        onFocus: (e) => show(e.currentTarget),
        onBlur: hide,
      })}
      {card ? <GlossaryCard card={card} onEnter={cancelHide} onLeave={hide} /> : null}
    </>
  );
}
