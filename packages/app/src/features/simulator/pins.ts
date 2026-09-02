import { isString } from "@renovate-config-debugger/engine/is";
import { jsonEqual } from "@renovate-config-debugger/engine/json";
import { MAX_PINNED_TESTS } from "@/lib/input-schemas";
import { EMPTY_FORM, hasMeaningfulInput } from "./form";
import type { FormState, PinnedTest } from "@/types/simulator";

/**
 * Roadmap 075 (iteration 6) — a PIN: a saved dependency descriptor that is
 * re-simulated against the rules on every pipeline run.
 *
 * The simulator answers "what would happen to THIS update, right now"; a pin is
 * the same question asked continuously — "these are the updates I care about,
 * tell me when an edit changes what happens to them". So a pin is nothing more
 * than a `FormState` the app keeps: the descriptor, evaluated by the same
 * engine call the simulator makes (`run-simulation.ts`), never a second notion
 * of what a simulation is.
 *
 * Pure and DOM-free — the share codec, the panel and the tests all read these.
 */

/** The cap — one number for the list and for the link that carries it (see
 *  `MAX_PINNED_TESTS`), enforced visibly here and again in the sanitizer. */
export const MAX_PINS = MAX_PINNED_TESTS;

/**
 * A pin's descriptor as the share payload carries it: the non-empty form fields
 * only, exactly the shape (and the same rule) `ShareSimulator.form` has used
 * since roadmap 018 — so one sanitizer serves both.
 */
export function pinShareFields(form: FormState): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(form)) {
    if (isString(value) && value.trim() !== "") {
      fields[key] = value;
    }
  }
  return fields;
}

/**
 * Roadmap 080: whether two forms describe the same test. Compared through the
 * share fields, so empty-vs-absent — a distinction the codec already erases —
 * cannot make two identical descriptors look different. Exists because the
 * detail view's pin leaves the form on screen (it captions the results), so a
 * repeated click must not mint a duplicate.
 */
export function samePinForm(a: FormState, b: FormState): boolean {
  return jsonEqual(pinShareFields(a), pinShareFields(b));
}

/** The inverse: a decoded field bag as a full `FormState` (unknown keys are
 *  dropped — a link may not invent form fields). */
export function pinFormFromShareFields(fields: Record<string, string>): FormState {
  const form: FormState = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM) as (keyof FormState)[]) {
    const value = fields[key];
    if (isString(value)) {
      form[key] = value;
    }
  }
  return form;
}

/**
 * The pins a decoded link installs. Descriptors with nothing identifying in
 * them are dropped rather than pinned: an all-blank pin is guaranteed to match
 * nothing (the 015 empty-form guard, applied to the link's inputs), and the cap
 * is enforced here too so a hand-edited link cannot hand the app 500 of them.
 */
export function pinsFromShareFields(
  entries: Record<string, string>[],
  nextId: () => string,
): PinnedTest[] {
  const pins: PinnedTest[] = [];
  for (const entry of entries) {
    if (pins.length >= MAX_PINS) {
      break;
    }
    const form = pinFormFromShareFields(entry);
    if (hasMeaningfulInput(form)) {
      pins.push({ id: nextId(), form });
    }
  }
  return pins;
}

/** The dependency's own name, or `""` when the form names neither field —
 *  what a derivation gets, before any display placeholder. */
export function pinDepName(form: FormState): string {
  return form.packageName.trim() || form.depName.trim();
}

/**
 * What the card's header calls the pin — the same pair the simulator's stale
 * banner names a run by (`packageName` falling back to `depName`), because they
 * are the same descriptor and a reader must be able to tell one from the other.
 * Display only: derivations take {@link pinDepName}, whose `""` says the form
 * names no package at all.
 */
export function pinName(form: FormState): string {
  return pinDepName(form) || "(no package name)";
}

/**
 * The muted line beside the name — the design's header grammar: the version
 * move first (`18.3.1 → 19.0.0`), then where the update comes from, then what
 * kind it is. `manager` falls back to `datasource` (the simulator's own first
 * field is the datasource, and a descriptor that names only one of the two
 * still has to read as something); `updateType` is the EFFECTIVE one from the
 * evaluation when there is one, since a derived type is what actually drove
 * the run.
 */
export function pinContext(form: FormState, effectiveUpdateType: string): string {
  const current = form.currentValue.trim();
  const next = form.newValue.trim();
  const move = current !== "" && next !== "" ? `${current} → ${next}` : current || next;
  return [move, pinSource(form), pinUpdateType(form, effectiveUpdateType)]
    .filter((part) => part !== "")
    .join(" · ");
}

/**
 * The prose subject the probe reads back as "Why it matched X" — `react ·
 * npm · minor`: name first and no version move, unlike {@link pinContext}'s
 * move-first header line. Same source and update-type fallbacks as that one.
 */
export function pinSubject(form: FormState, effectiveUpdateType: string): string {
  return [pinName(form), pinSource(form), pinUpdateType(form, effectiveUpdateType)]
    .filter((part) => part !== "")
    .join(" · ");
}

/** A descriptor that names only one of the two still has to read as something. */
function pinSource(form: FormState): string {
  return form.manager.trim() || form.datasource.trim();
}

/** The EFFECTIVE type from the evaluation when there is one — a derived type is
 *  what actually drove the run. */
function pinUpdateType(form: FormState, effectiveUpdateType: string): string {
  return effectiveUpdateType.trim() || form.updateType.trim();
}
