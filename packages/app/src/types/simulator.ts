/**
 * The simulator CONTRACT types — the dependency description a run is asked
 * about, and a pinned standing test.
 *
 * Hoisted here for the reason `types/repo.ts` explains at length: `FormState`
 * had 23 consumers, two of them the app shell, and `PinnedTest` ten with two —
 * so the shell depended on the simulator slice's declarations, which is the
 * inversion the cross-feature ban exists to prevent. Both sides import
 * downward now.
 *
 * Only the SHAPES moved. `EMPTY_FORM`, the sanitizers, the share encoding and
 * everything that interprets these live on in `features/simulator/`, which is
 * where they belong: a type is a contract, a function is behaviour.
 */

/**
 * The simulated dependency, as the form holds it: every field a string,
 * including the ones Renovate types otherwise. Empty string means "not set",
 * which is what makes a field's absence expressible in a text input at all —
 * and what the fail-closed matchers then report as `no-input`.
 */
export interface FormState {
  manager: string;
  datasource: string;
  packageName: string;
  depName: string;
  depType: string;
  packageFile: string;
  currentValue: string;
  currentVersion: string;
  newValue: string;
  updateType: string;
  lockedVersion: string;
  lockFiles: string;
  versioning: string;
  sourceUrl: string;
  registryUrls: string;
  categories: string;
  repository: string;
  baseBranch: string;
  currentVersionTimestamp: string;
}

/** One standing test: a dependency the reader wants checked against every run. */
export interface PinnedTest {
  /**
   * Identity within the session, minted by App. Deliberately NOT shared: a link
   * carries descriptors, and the opener mints its own ids — an id from someone
   * else's session would collide with the reader's own the moment they pin.
   */
  id: string;
  form: FormState;
  /**
   * Roadmap 091: this pin was SEEDED from the reader's own `packageRules`, not
   * authored — the card wears a "starter" chip and the link leaves it behind
   * (the opener's own config seeds their own). Absent on every pin a reader or
   * a link made, which is the majority, so it stays optional.
   */
  starter?: boolean;
}
