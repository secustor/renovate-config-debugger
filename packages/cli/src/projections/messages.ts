import {
  applyFixToText,
  findMentionedOption,
  translateMessage,
  type ValidationMessage,
} from "@renovate-config-debugger/engine";

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
export interface ReportedMessage {
  severity: "error" | "warning";
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
  fix?: {
    summary: string;
    path: (string | number)[];
    fixedConfig: Record<string, unknown>;
    /** The FILE with the fix applied, when the edit could be located in the
     *  original text (comments and formatting preserved). */
    fixedText?: string;
    /** True when `fixedText` is the whole document re-serialized from
     *  `fixedConfig` because the edit couldn't be located in the original
     *  text — still correct, but comments and formatting are lost. */
    fixedTextRewritesDocument?: true;
  };
}

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
 * and the docs link still work.
 */
export function describeMessage(
  message: ValidationMessage,
  severity: "error" | "warning",
  config: Record<string, unknown> | null,
  text: string | null,
): ReportedMessage {
  const translated = translateMessage(message, config);
  const mentioned = translated ? undefined : findMentionedOption(message);
  const applied = translated?.fix && text ? applyFixToText(text, translated.fix) : null;
  return {
    severity,
    topic: message.topic,
    message: message.message,
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
