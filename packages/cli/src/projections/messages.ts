import {
  applyFixToText,
  findMentionedOption,
  type RuleAttribution,
  type TraceResult,
  translateMessage,
  type ValidationMessage,
} from "@renovate-config-debugger/engine";
import {
  crossRuleIndex,
  type RuleMessageIndexKind,
  ruleIndexInMessage,
} from "@renovate-config-debugger/app/headless";

/**
 * A validator message with everything roadmap 014 knows about it — shared by
 * `rcd validate` and the MCP server's `explain_message`.
 *
 * The fix is reported, never applied: agents edit configs with their own tools
 * and come back to `validate`/`compare` as the oracle.
 *
 * The absence of an explanation or a fix is reported EXPLICITLY (068):
 * `translationKnown` plus a `note` saying why, so a caller that was promised
 * "a docs link and — when the library knows one — a concrete fix" can tell
 * "the library has nothing for this message" from "the tool silently dropped
 * half its answer". Three replay sessions read the silent shape as a broken
 * promise.
 */
export type MessageSeverity = "error" | "warning";

/**
 * Roadmap 071: the merged index a validator message's `packageRules[N]` refers
 * to, and the repo-config index it was written as.
 *
 * The two are different arrays and the personas conflated them: Renovate's
 * validator cites the index in the config you WROTE, while `simulate` and
 * `get_provenance` cite the index in the merged array — for a config extending
 * `config:best-practices` those are 1 and 714 for the same rule. The app has
 * cross-linked them since roadmap 013; this quotes the app's arithmetic
 * (`crossRuleIndex`) rather than restating it.
 */
export interface RuleCrossLink {
  repoIndex: number;
  mergedIndex: number;
  note: string;
}

function crossLinkNote(kind: RuleMessageIndexKind, repo: number, merged: number): string {
  return kind === "repo"
    ? `\`packageRules[${repo}]\` in your config is merged rule \`packageRules[${merged}]\` — ` +
        "the index `simulate` and `get_provenance` cite."
    : `merged rule \`packageRules[${merged}]\` is \`packageRules[${repo}]\` in your config — ` +
        "the index Renovate's validator and your editor use.";
}

/**
 * The other index for the `packageRules[N]` a message names, or `undefined`
 * when there is none to give: no reference in the text, no attribution for
 * this run, or a rule no repo-authored config wrote (a preset's rule has no
 * repo-config index to annotate with).
 */
export function ruleCrossLink(
  message: ValidationMessage,
  kind: RuleMessageIndexKind,
  attribution: readonly RuleAttribution[] | null | undefined,
): RuleCrossLink | undefined {
  const reference = ruleIndexInMessage(message.message);
  if (!reference) {
    return undefined;
  }
  const cross = crossRuleIndex(kind, reference.index, attribution);
  if (cross === undefined) {
    return undefined;
  }
  const repoIndex = kind === "repo" ? reference.index : cross;
  const mergedIndex = kind === "repo" ? cross : reference.index;
  return { repoIndex, mergedIndex, note: crossLinkNote(kind, repoIndex, mergedIndex) };
}

/**
 * Whether this message came from validating the REPO's own config — the only
 * stage whose `packageRules[N]` is the index in the file the user wrote.
 *
 * `result.errors`/`warnings` mix stages: the global and inherited layers
 * validate their own documents into the same two arrays, and their indexes are
 * a different array's. So the events decide, and only unanimously: a message
 * whose exact text also appears in a `global`/`inherit` event is left
 * unannotated rather than annotated with a plausible index.
 */
export function repoStageMessage(result: TraceResult, message: ValidationMessage): boolean {
  const emitted = result.events.filter(
    (event) =>
      event.kind === "validation-message" &&
      (event.messages ?? []).some(
        (m) => m.message === message.message && m.topic === message.topic,
      ),
  );
  return emitted.length > 0 && emitted.every((event) => event.stage === "validate");
}

export interface ReportedMessage {
  /** The list the RUN put this message in — `null` when nothing decided that:
   *  no run was given, or the run holds no message with this exact text. */
  severity: MessageSeverity | null;
  topic: string;
  message: string;
  /** Whether roadmap 014's curated library has an entry for this message.
   *  When false, `message`/`topic`/`severity` are Renovate's own and nothing
   *  else here is derived. */
  translationKnown: boolean;
  explanation?: string;
  docsUrl?: string;
  /** Present exactly when there is no `fix` — why there isn't one. */
  note?: string;
  /** Present exactly when `severity` is null — why it could not be decided. */
  severityNote?: string;
  /** The merged index of the `packageRules[N]` this message names, when the run
   *  can attribute it. Absent means "not determinable", never "index 0". */
  rule?: RuleCrossLink;
  fix?: {
    summary: string;
    path: (string | number)[];
    fixedConfig: Record<string, unknown>;
    /** The FILE with the fix applied, when the edit could be located in the
     *  original text (comments and formatting preserved). */
    fixedText?: string;
    /** True when `fixedText` is the whole document re-serialized from
     *  `fixedConfig` because the edit couldn't be located in the original
     *  text — still correct, but comments and formatting are lost. Rare: it
     *  takes a config written in a key style the locator doesn't read
     *  (unquoted or single-quoted keys), or a path that isn't in this exact
     *  text. Absent means the edit was a minimal in-place patch. */
    fixedTextRewritesDocument?: true;
  };
}

const UNKNOWN_SEVERITY_NOTE =
  "Severity is null: nothing decided which list this message is in. Either no runId was given, " +
  "or that run's `errors`/`warnings` hold no message with this exact text — a paraphrase, a " +
  "quote shortened by the digest, or another Renovate version's wording all land here. The " +
  "explanation below is still the library's; the severity is not the run's. Address the message " +
  "by position instead: run_config lists each message with its `index`.";

const NO_TRANSLATION_NOTE =
  "No translation for this message — the message text and severity are Renovate's own, " +
  "unedited, and this library knows no explanation or fix for it. Use get_option_docs on the " +
  "option it names, or read Renovate's docs.";

const NO_SNAPSHOT_NOTE =
  "No fix was computed: this message was explained without the config it came from. Pass the " +
  "runId the message belongs to and the fix is computed against that exact snapshot.";

const NO_SAFE_FIX_NOTE =
  "The library explains this message but cannot compute a safe automatic fix for this config — " +
  "the edit would be a guess. Apply the explanation by hand, then use compare as the oracle.";

/**
 * `config` should be the exact snapshot the message was validated against
 * (`validatedConfigOf`) so a fix's path resolves against the same document;
 * `text` is the original file, for the formatting-preserving text fix. Pass
 * `null`/`undefined` for either when they are not available — the translation
 * and the docs link still work. `rule` is the cross-link {@link ruleCrossLink}
 * computed for this message, when the caller holds the run it came from.
 */
export function describeMessage(
  message: ValidationMessage,
  severity: MessageSeverity | null,
  config: Record<string, unknown> | null,
  text: string | null,
  rule?: RuleCrossLink,
): ReportedMessage {
  const translated = translateMessage(message, config);
  const mentioned = translated ? undefined : findMentionedOption(message);
  const applied = translated?.fix && text ? applyFixToText(text, translated.fix) : null;
  return {
    severity,
    ...(severity === null ? { severityNote: UNKNOWN_SEVERITY_NOTE } : {}),
    topic: message.topic,
    message: message.message,
    ...(rule ? { rule } : {}),
    translationKnown: translated !== null,
    ...(translated ? { explanation: translated.explanation } : {}),
    ...(translated?.docsUrl
      ? { docsUrl: translated.docsUrl }
      : mentioned
        ? { docsUrl: mentioned.url }
        : {}),
    ...(translated?.fix
      ? {
          fix: {
            summary: translated.fix.summary,
            path: translated.fix.path,
            fixedConfig: translated.fix.fixedConfig,
            ...(applied ? { fixedText: applied.text } : {}),
            ...(applied && !applied.surgical ? { fixedTextRewritesDocument: true as const } : {}),
          },
        }
      : { note: noteFor(translated !== null, config) }),
  };
}

function noteFor(known: boolean, config: Record<string, unknown> | null): string {
  if (!known) {
    return NO_TRANSLATION_NOTE;
  }
  return config === null ? NO_SNAPSHOT_NOTE : NO_SAFE_FIX_NOTE;
}
