/**
 * Replay-02 N3: the stats effect used to call `onStats` while provenance was
 * still loading, reporting an honest-looking `{keys: 0}` that overwrote App's
 * pending `null` — the Overview painted "✓ accepted … merged into 0 effective
 * options" next to the tab badge's 0 on first paint, self-correcting only
 * once provenance resolved. The contract this locks: silence until real
 * numbers exist, and the first report already carries them.
 */
import { runPipeline } from "@renovate-config-debugger/engine";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EffectiveConfig } from "./EffectiveConfig";

afterEach(cleanup);

it("reports stats only once provenance has resolved, never a loading-time zero", async () => {
  // No `extends`, so the run resolves offline; several non-default options so
  // the real report has something to count.
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify({
      automerge: true,
      labels: ["dependencies"],
      rangeStrategy: "bump",
    }),
  });

  const onStats = vi.fn();
  render(<EffectiveConfig result={result} onStats={onStats} />);

  // Mount-time effects run with provenance still loading — the old code
  // reported {keys: 0} right here.
  expect(onStats).not.toHaveBeenCalled();

  await waitFor(() => expect(onStats).toHaveBeenCalled());
  const first = onStats.mock.calls[0]?.[0] as { keys: number } | undefined;
  expect(first?.keys).toBeGreaterThan(0);
});
