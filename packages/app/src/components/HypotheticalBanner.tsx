/**
 * Roadmap 023: shown on post-Validate results (the presets/merge stage diffs,
 * the effective config, the simulator) whenever validation reported errors —
 * a real Renovate run would refuse the config outright, so everything below is
 * hypothetical. Rendered only when validation ERRORS (not warnings) exist.
 */
export function HypotheticalBanner() {
  return (
    <p className="hypothetical-banner" role="note">
      ⚠ Validation failed — a real Renovate run would refuse this config. What you see here is what
      it <em>would</em> do if it ran anyway.
    </p>
  );
}
