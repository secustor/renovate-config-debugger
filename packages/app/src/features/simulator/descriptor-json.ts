import type { DependencyDescriptor } from "@renovate-config-debugger/engine";
import { isString } from "@renovate-config-debugger/engine/is";
import { jsonText } from "@renovate-config-debugger/engine/json";
import { toDescriptor } from "./form";
import type { FormState } from "@/types/simulator";

/**
 * Roadmap 079/082: what the descriptor LOOKS like, in one place.
 *
 * Two surfaces print it — the standalone simulator's live preview card and the
 * pin card's collapsible "Descriptor JSON" block, which also copies it — so the
 * key order and the omit-what-is-unset rule live here rather than in either
 * component, and the copy is assembled from the very lines that are rendered.
 *
 * What it prints is `toDescriptor`'s OUTPUT, whole. 079's preview showed a
 * fixed eight keys, which was true of the four fields in the sentence and a
 * lie about the rest: the compact form can set nineteen, the block's own footer
 * says "assembled from the fields above", and the document is what a reader
 * hands to `rcd simulate`. A `sourceUrl` that decides the verdict must not be
 * missing from the thing that claims to be the descriptor.
 */

/**
 * The print order: the eight the design's preview always led with (they are
 * the sentence, read left to right), then the rest of the descriptor in the
 * order the form's own groups introduce them. Anything the engine's descriptor
 * grows that is not named here still prints — at the end, rather than silently
 * not at all. The `satisfies` is what proves each name here is a key the
 * descriptor actually has — a typo would otherwise just reorder the document.
 */
const KEY_ORDER = [
  "packageName",
  "datasource",
  "currentValue",
  "newValue",
  "updateType",
  "manager",
  "packageFile",
  "depType",
  "depName",
  "sourceUrl",
  "registryUrls",
  "repository",
  "baseBranch",
  "versioning",
  "currentVersion",
  "lockedVersion",
  "lockFiles",
  "categories",
  "currentVersionTimestamp",
  "isBump",
] as const satisfies readonly (keyof DependencyDescriptor)[];

export interface DescriptorEntry {
  key: string;
  /** The value as ONE line of JSON — `"npm"`, `["a", "b"]`, `true`. */
  json: string;
  /** Strings wear the string colour; arrays and flags are not strings. */
  isString: boolean;
}

/**
 * The descriptor as printable entries. Unset keys are omitted rather than
 * printed empty: an absent field and a field set to `""` are different
 * questions to Renovate's matchers, and `""` is not a descriptor this form can
 * produce. The derived updateType appears as the value it will match on, not
 * as the empty `form.updateType` behind it.
 */
export function descriptorEntries(form: FormState, effectiveUpdateType: string): DescriptorEntry[] {
  const descriptor = new Map<string, unknown>(
    Object.entries(toDescriptor(form, effectiveUpdateType)),
  );
  const ordered = [
    ...KEY_ORDER.filter((key) => descriptor.has(key)),
    ...[...descriptor.keys()].filter((key) => !(KEY_ORDER as readonly string[]).includes(key)),
  ];
  const entries: DescriptorEntry[] = [];
  for (const key of ordered) {
    const value = descriptor.get(key);
    if (value === undefined) {
      continue;
    }
    entries.push({ key, json: jsonText(value), isString: isString(value) });
  }
  return entries;
}

/** The same object as a document — what the copy button puts on the clipboard.
 *  Assembled from the entries above, so the clipboard cannot hold a different
 *  document from the one on screen. */
export function descriptorJsonText(form: FormState, effectiveUpdateType: string): string {
  const entries = descriptorEntries(form, effectiveUpdateType);
  if (entries.length === 0) {
    return "{}\n";
  }
  const lines = entries.map((entry) => `  ${jsonText(entry.key)}: ${entry.json}`);
  return `{\n${lines.join(",\n")}\n}\n`;
}
