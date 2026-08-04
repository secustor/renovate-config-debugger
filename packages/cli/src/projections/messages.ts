import {
  applyFixToText,
  findMentionedOption,
  translateMessage,
  type ValidationMessage,
} from "@renovate-config-debugger/engine";

/**
 * A validator message with everything roadmap 014 knows about it — shared by
 * `rcv validate` and the MCP server's `explain_message`.
 *
 * The fix is reported, never applied: agents edit configs with their own tools
 * and come back to `validate`/`compare` as the oracle.
 */
export interface ReportedMessage {
  severity: "error" | "warning";
  topic: string;
  message: string;
  explanation?: string;
  docsUrl?: string;
  fix?: {
    summary: string;
    path: (string | number)[];
    fixedConfig: Record<string, unknown>;
    /** The FILE with the fix applied, when the edit could be located in the
     *  original text (comments and formatting preserved). */
    fixedText?: string;
  };
}

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
          },
        }
      : {}),
  };
}
