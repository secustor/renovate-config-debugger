import { plural } from "@/lib/format";
import { EMPTY_FORM, type FormState, joinValues, MULTI_VALUE_KEYS } from "./form";

/**
 * Roadmap 082: the Tests tab's "Paste JSON" tab, as a pure function.
 *
 * The descriptor a reader can already get their hands on is the one in
 * Renovate's own debug log (`packageFiles with updates`), and retyping its
 * eight fields into the Manual form is the step this removes. Everything
 * happens here, in the browser: the paste is parsed, the keys this form has a
 * field for are kept, and everything else is COUNTED rather than silently
 * dropped — a log entry carries a dozen keys the simulator has no meaning for
 * (`updates`, `fixedVersion`, `isSingleVersion`, …) and a reader who is not
 * told they were ignored will believe the simulation saw them.
 *
 * Pure and DOM-free so the whole mapping is unit-testable
 * (`paste-descriptor.test.ts`); the tab component only routes the result into
 * the form.
 */

/**
 * The descriptor keys the form has a field for — every one of them, derived
 * from the form's own shape rather than hand-listed: the list drifted ten
 * fields behind `FormState` once already, and a paste carrying `sourceUrl`
 * (the decisive matcher in two of the persona study's three problems) was
 * dropped and reported as an unknown key.
 *
 * `depName` maps to the form's own `depName` — Renovate matches on both, and a
 * descriptor whose two names differ is exactly the case worth simulating — and
 * additionally FILLS IN `packageName` when the paste has none, which is the
 * design's KEYS map and the honest reading of a log entry that only carries
 * `depName`.
 */
function isKnownKey(key: string): key is keyof FormState {
  return Object.hasOwn(EMPTY_FORM, key);
}

function isMultiValueKey(key: keyof FormState): boolean {
  return (MULTI_VALUE_KEYS as readonly string[]).includes(key);
}

/**
 * The pasted value as the form can hold it, or undefined when it cannot.
 *
 * Every field of `FormState` is a string, so a string is always usable. The
 * three multi-value fields are the honest exception: the form keeps them as one
 * comma-separated string while a real descriptor (and Renovate's own log)
 * carries `lockFiles: ["package-lock.json"]` — the same array the chip editor
 * splits back out, so it is imported, not dropped.
 */
function coerce(key: keyof FormState, value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (isMultiValueKey(key) && Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return joinValues(value);
  }
  return undefined;
}

export interface PasteFill {
  /** Applied over an EMPTY form: a paste is a whole descriptor, not a patch. */
  fill: Partial<FormState>;
  /** How many of the form's fields the paste actually filled. */
  imported: number;
  /** Keys this form has no field for at all — reported, not hidden. */
  unknown: number;
  /**
   * Keys it HAS a field for whose value it cannot hold (`depType:
   * ["dependencies"]`, a numeric version). Counted apart from `unknown`
   * because the note has to be true: calling `depType` an unknown key when the
   * form is showing a `depType` box would read as a bug in the parser.
   */
  unusable: number;
  /** The paste stated an updateType itself — so the form must stop deriving
   *  one (roadmap 015's `updateTypeTouched`), or the pasted value would be
   *  overwritten by whatever currentValue → newValue implies. */
  updateTypeGiven: boolean;
}

export type PasteResult = { ok: true; value: PasteFill } | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePastedDescriptor(text: string): PasteResult {
  if (text.trim() === "") {
    return { ok: false, error: "Paste a dependency descriptor first." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: "That isn’t valid JSON — paste one object, braces included.",
    };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, error: "That JSON is not an object — a descriptor is a single object." };
  }

  const fill: Partial<FormState> = {};
  let imported = 0;
  let unknown = 0;
  let unusable = 0;
  for (const [key, value] of Object.entries(parsed)) {
    if (!isKnownKey(key)) {
      unknown++;
      continue;
    }
    const held = coerce(key, value);
    // A `depType` of `["dependencies"]` is a value this form cannot hold — it
    // is not a multi-value field. Dropped, and said so.
    if (held === undefined) {
      unusable++;
      continue;
    }
    fill[key] = held;
    imported++;
  }
  if (fill.packageName === undefined && fill.depName !== undefined) {
    fill.packageName = fill.depName;
  }
  return {
    ok: true,
    value: { fill, imported, unknown, unusable, updateTypeGiven: fill.updateType !== undefined },
  };
}

/**
 * The green note the Manual tab wears after an import.
 *
 * The design's copy is "Imported N fields from pasted JSON · M unknown keys
 * ignored", and that is what a paste of an ordinary log entry gets. The second
 * shape exists because the first would otherwise lie: a key this form KNOWS
 * whose value it cannot hold is not an unknown key, so when any of those turn
 * up the clause counts everything that was dropped and names the reason.
 */
export function pasteImportNote({ imported, unknown, unusable }: PasteFill): string {
  const head = `Imported ${plural(imported, "field")} from pasted JSON`;
  if (unusable > 0) {
    return `${head} · ${plural(unknown + unusable, "key")} ignored (${unusable} the form can't hold)`;
  }
  return unknown > 0 ? `${head} · ${plural(unknown, "unknown key")} ignored` : head;
}
