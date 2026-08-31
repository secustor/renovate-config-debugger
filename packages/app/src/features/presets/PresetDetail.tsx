import { useMemo, useState } from "react";
import type { PresetNode, TraceEvent } from "@renovate-config-debugger/engine";
import { ConfigJson } from "@/components/ConfigJson";
import { CopyMarkdownButton } from "@/components/CopyMarkdownButton";
import { type AuthState, GithubAuthHint } from "@/components/GithubAuthHint";
import { JsonDiff } from "@/components/JsonDiff";
import { MigrationSteps } from "@/components/MigrationSteps";
import { PresetName } from "@/components/PresetName";
import { findPollutedPath } from "@/lib/input-schemas";
import type { NodeDescriptionFacts } from "@/lib/tree-descriptions";
import { NodeDescriptionLines } from "./NodeDescriptions";
import { githubAuthFailure } from "@/lib/github-failure";
import {
  type InjectionKeyFn,
  type MergeFn,
  nodeInjectionKey,
  type ParseFn,
  STATE_LABELS,
} from "./tree-shared";
import { useEngineHelpers } from "./use-engine-helpers";
import { pluralWord } from "@/lib/format";
import { errorMessage } from "@/lib/errors";

/**
 * Replays the parent's merge loop with renovate's real mergeChildConfig to
 * get "merged config before this preset" vs "after". The engine chunk is
 * already loaded at this point, so the dynamic import (which keeps renovate
 * out of the app's initial bundle) resolves instantly.
 */
function useContribution(node: PresetNode, parent: PresetNode | undefined, merge: MergeFn | null) {
  return useMemo(() => {
    if (!merge || !parent || node.nested || node.state !== "resolved" || !node.resolved) {
      return null;
    }
    let acc: Record<string, unknown> = {};
    for (const child of parent.children) {
      if (child.nested || child.state !== "resolved" || !child.resolved) {
        continue;
      }
      // clone: mergeChildConfig may share references with its inputs
      const resolved = structuredClone(child.resolved) as Record<string, unknown>;
      if (child.id === node.id) {
        return { before: acc, after: merge(structuredClone(acc), resolved) };
      }
      acc = merge(acc, resolved);
    }
    return null;
  }, [merge, node, parent]);
}

/**
 * Roadmap 069 (PR 4): what this preset says about itself — the same lines the
 * name's hover card shows, kept in the panel where a reader inspects the
 * node. Its own component because the lines nest past the `<dl>`'s depth
 * budget (`react/jsx-max-depth`).
 */
function DescriptionEntry({ facts }: { facts: NodeDescriptionFacts }) {
  return (
    <div className="preset-source-desc">
      <dt>Description</dt>
      <dd>
        <NodeDescriptionLines facts={facts} />
      </dd>
    </div>
  );
}

function SourceDetails({ node, facts }: { node: PresetNode; facts?: NodeDescriptionFacts }) {
  const source = node.source;
  // Internal presets carry no source block, but can still have a description —
  // the `<dl>` then holds only the Description entry.
  const rows: [string, string | undefined][] = source?.presetSource
    ? [
        ["Source", source.presetSource],
        ["Repository", source.repo],
        ["Path", source.presetPath],
        ["Preset", source.presetName],
        ["Tag", source.tag],
        ["Parameters", source.params?.join(", ")],
        ["Platform", source.platform],
        ["Endpoint", source.endpoint],
      ]
    : [];
  const shown = rows.filter(([, v]) => v);
  if (shown.length === 0 && !facts) {
    return null;
  }
  return (
    <dl className="preset-source">
      {shown.map(([label, v]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{v}</dd>
        </div>
      ))}
      {facts ? <DescriptionEntry facts={facts} /> : null}
    </dl>
  );
}

function PresetInjector({
  node,
  injectionKey,
  parse,
  onInject,
}: {
  node: PresetNode;
  injectionKey: InjectionKeyFn | null;
  parse: ParseFn | null;
  onInject: (key: string, content: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const key = nodeInjectionKey(node.source, injectionKey);
  if (!key || !parse) {
    return null;
  }
  // Re-bound as consts so the narrowing above survives into `submit`: `parse`
  // is a parameter (never const-narrowed inside a closure) and `submit` was a
  // hoisted function declaration, which TS can't assume runs after the guard.
  const injectionTarget = key;
  const parseConfig = parse;

  const submit = () => {
    setError(null);
    try {
      const parsed = parseConfig(text);
      // Roadmap 030: injected preset content is user-supplied JSON that
      // flows straight into the pipeline's merges — reject an own
      // `__proto__`/`constructor`/`prototype` key anywhere in it (including
      // nested `packageRules[n]`) before it ever reaches `onInject`. Checked
      // here (the app boundary) rather than inside the engine's
      // `parseInjectedPreset`, which stays untouched.
      const pollutedAt = findPollutedPath(parsed);
      if (pollutedAt) {
        throw new Error(
          `Preset content must not contain a "${pollutedAt.at(-1)}" key (at ${pollutedAt.join(".")})`,
        );
      }
      onInject(injectionTarget, parsed);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <details className="preset-inject" open>
      <summary>Provide preset content manually</summary>
      <p className="empty-note">
        Paste this preset&apos;s JSON (JSON5 accepted). It is stored in memory and the pipeline
        re-runs using it, so unreachable / self-hosted presets can still be explored.
      </p>
      <textarea
        className="preset-inject-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'{\n  "labels": ["from-manual-preset"]\n}'}
        rows={6}
        spellCheck={false}
      />
      {error ? <p className="preset-node-error">{error}</p> : null}
      <button
        type="button"
        className="btn-primary"
        onClick={submit}
        disabled={text.trim().length === 0}
      >
        Use this content &amp; re-run
      </button>
    </details>
  );
}

export function PresetDetail({
  node,
  parent,
  descriptionFacts,
  onClose,
  usedInjections,
  onInject,
  migrationSteps,
  authState,
  onSignIn,
}: {
  node: PresetNode;
  parent: PresetNode | undefined;
  /** Roadmap 069 (PR 4): this node's description facts, for the Description
   *  entry of the source details — `undefined` when it has none. */
  descriptionFacts?: NodeDescriptionFacts;
  onClose: () => void;
  usedInjections: ReadonlySet<string>;
  onInject: (key: string, content: Record<string, unknown>) => void;
  migrationSteps: TraceEvent[];
  authState: AuthState;
  onSignIn: () => void;
}) {
  // The injection key and the parser come from the same hook as `merge`, so
  // the panel reads them here rather than taking them a second time as props.
  const helpers = useEngineHelpers();
  const injectionKey = helpers?.injectionKey ?? null;
  const parse = helpers?.parse ?? null;
  const contribution = useContribution(node, parent, helpers?.merge ?? null);
  const stateLabel = STATE_LABELS[node.state];
  const key = nodeInjectionKey(node.source, injectionKey);
  const userSupplied = key !== null && usedInjections.has(key);
  const ghFailure = githubAuthFailure(node);
  // Roadmap 032: these compare FULLY RESOLVED preset bodies, and the tree
  // re-renders on every filter keystroke and every scroll tick — so they are
  // memoized on the node (a stable per-run identity, WeakMap-cached) and
  // short-circuit on reference equality before stringifying anything.
  const { migrationChanged, resolvedChanged } = useMemo(() => {
    const { fetched, input, resolved } = node;
    return {
      migrationChanged:
        fetched !== undefined &&
        input !== undefined &&
        fetched !== input &&
        JSON.stringify(fetched) !== JSON.stringify(input),
      resolvedChanged:
        resolved !== undefined &&
        resolved !== input &&
        JSON.stringify(resolved) !== JSON.stringify(input),
    };
  }, [node]);

  return (
    <div className="preset-panel">
      <div className="preset-panel-head">
        {/* The heading variant, and the one token with no hover card: this
            panel IS what the card previews, so a card here would offer the
            reader a summary of the page they are already reading. */}
        <PresetName name={node.name} heading noCard />
        <button type="button" className="close" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </div>
      <SourceDetails node={node} facts={descriptionFacts} />
      {userSupplied ? (
        <p className="empty-note">
          Resolved from preset content you supplied manually rather than a fetch.
        </p>
      ) : null}
      {node.error ? <p className="preset-node-error">{node.error.message}</p> : null}
      {ghFailure.match ? (
        <GithubAuthHint
          authState={authState}
          rateLimited={ghFailure.rateLimited}
          onSignIn={onSignIn}
        />
      ) : null}
      {stateLabel && !node.error ? <p className="empty-note">{stateLabel}</p> : null}
      {node.state === "error" ? (
        <PresetInjector node={node} injectionKey={injectionKey} parse={parse} onInject={onInject} />
      ) : null}
      {node.duplicate ? (
        <p className="empty-note">
          This preset also appears elsewhere in the tree; its content was resolved once and served
          from cache here.
        </p>
      ) : null}

      {node.fetched !== undefined ? (
        <details open={!migrationChanged}>
          <summary>
            Fetched content
            <CopyMarkdownButton
              className="inline"
              header={`\`${node.name}\` — fetched preset body`}
              code={JSON.stringify(node.afterParams ?? node.fetched, null, 2)}
              lang="json"
            />
          </summary>
          <pre className="config-view">
            <ConfigJson value={node.afterParams ?? node.fetched} />
          </pre>
        </details>
      ) : null}
      {migrationChanged ? (
        <details open>
          <summary>Migration &amp; massaging applied on fetch</summary>
          <JsonDiff
            key={`${node.id}-migration`}
            before={node.afterParams ?? node.fetched}
            after={node.input}
            names={["fetched", "migrated"]}
          />
          {migrationSteps.length > 0 ? (
            <div className="preset-migration-steps">
              <div className="preset-migration-steps-title">
                Step through the {migrationSteps.length}{" "}
                {pluralWord(migrationSteps.length, "migration")}
              </div>
              <MigrationSteps key={`${node.id}-steps`} steps={migrationSteps} compact />
            </div>
          ) : null}
        </details>
      ) : null}
      {resolvedChanged ? (
        <details>
          <summary>
            Fully resolved (sub-presets merged)
            <CopyMarkdownButton
              className="inline"
              header={`\`${node.name}\` — fully resolved preset body`}
              code={JSON.stringify(node.resolved, null, 2)}
              lang="json"
            />
          </summary>
          <pre className="config-view">
            <ConfigJson value={node.resolved} />
          </pre>
        </details>
      ) : null}
      {contribution ? (
        <details open>
          <summary>Contribution to the merged config</summary>
          <JsonDiff
            key={`${node.id}-contribution`}
            before={contribution.before}
            after={contribution.after}
            names={["before this preset", "after this preset"]}
          />
        </details>
      ) : null}
      {node.nested ? (
        <p className="empty-note">
          Resolved inside a nested value (e.g. a packageRules entry), so it contributes to that
          value rather than the top-level merge.
        </p>
      ) : null}
    </div>
  );
}
