/**
 * The quiet door from a test to the full simulator, carrying the descriptor
 * with it — the same control at the foot of an expanded pin card and of the
 * Add-a-test panel's one-off result, where with no pins yet it is the only
 * manual way in.
 *
 * One component because its accessible name is what both the render tests and
 * the e2e suite address it by: two copies of the label are two chances for one
 * of them to drift out of reach of every test that finds it.
 */
export function OpenInSimulatorLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn-quiet pin-open-sim" onClick={onClick}>
      open in simulator →
    </button>
  );
}
