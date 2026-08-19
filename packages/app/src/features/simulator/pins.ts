import { MAX_PINNED_TESTS } from "@/lib/input-schemas";
import { EMPTY_FORM, type FormState, hasMeaningfulInput } from "./form";

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

export interface PinnedTest {
  /**
   * Identity within the session, minted by App. Deliberately NOT shared: a link
   * carries descriptors, and the opener mints its own ids — an id from someone
   * else's session would collide with the reader's own the moment they pin.
   */
  id: string;
  form: FormState;
}

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
    if (typeof value === "string" && value.trim() !== "") {
      fields[key] = value;
    }
  }
  return fields;
}

/** The inverse: a decoded field bag as a full `FormState` (unknown keys are
 *  dropped — a link may not invent form fields). */
export function pinFormFromShareFields(fields: Record<string, string>): FormState {
  const form: FormState = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM) as (keyof FormState)[]) {
    const value = fields[key];
    if (typeof value === "string") {
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

/**
 * What the card's header calls the pin — the same pair the simulator's stale
 * banner names a run by (`packageName` falling back to `depName`), because they
 * are the same descriptor and a reader must be able to tell one from the other.
 */
export function pinName(form: FormState): string {
  return form.packageName.trim() || form.depName.trim() || "(no package name)";
}

/**
 * The muted line under the name: where the update comes from and what kind it
 * is. `manager` falls back to `datasource` (the simulator's own first field is
 * the datasource, and a descriptor that names only one of the two still has to
 * read as something); `updateType` is the EFFECTIVE one from the evaluation
 * when there is one, since a derived type is what actually drove the run.
 */
export function pinContext(form: FormState, effectiveUpdateType: string): string {
  const source = form.manager.trim() || form.datasource.trim();
  const updateType = effectiveUpdateType.trim() || form.updateType.trim();
  return [source, updateType].filter((part) => part !== "").join(" · ");
}
