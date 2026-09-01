import type { SimulationResult } from "@renovate-config-debugger/engine";
import { ConfigJson } from "@/components/ConfigJson";
import { mergeStopId } from "./dom-ids";
import type { MergeStop } from "./merge-stops";

/** One stop, stated in place: where it sits, what it is, what it did — and,
 *  for the final stop, the config it produced. */
function MergeStopItem({ stop, index }: { stop: MergeStop; index: number }) {
  return (
    <li className="sim-merge-stop" id={mergeStopId(index)}>
      <div className="migration-step-head">
        <span className="migration-step-counter">{stop.counter}</span>
        {stop.head}
      </div>
      <p className="migration-explanation">{stop.explanation}</p>
      {stop.body}
    </li>
  );
}

/**
 * Roadmap 094: the merge replay as an ordered LIST — every stop on screen at
 * once, in merge order. The 044/046 positional stepper (chips, Prev/Next, the
 * per-stop and cumulative `JsonDiff`) retired with the ruling; what a stop SAYS
 * — which rule merged, which keys it wrote, what flattening consumed, the final
 * config with its Copy — is what the replay was read for, and it is all here.
 *
 * Roadmap 046/047: the body of the "How the final config was built" drawer.
 * When nothing merged there is no sequence at all and the final config falls
 * back to the plain disclosure.
 */
export function SimMergeBody({
  finalDependencyConfig,
  stops,
  showReplay,
}: {
  finalDependencyConfig: SimulationResult["finalDependencyConfig"];
  stops: MergeStop[];
  showReplay: boolean;
}) {
  return showReplay ? (
    <ol className="sim-merge-stops">
      {stops.map((stop, i) => (
        <MergeStopItem key={stop.id} stop={stop} index={i} />
      ))}
    </ol>
  ) : (
    <details className="sim-final">
      <summary>Show the full resolved dependency config</summary>
      <pre className="config-view">
        <ConfigJson value={finalDependencyConfig} />
      </pre>
    </details>
  );
}
