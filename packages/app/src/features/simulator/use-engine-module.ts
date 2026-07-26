import { useEffect, useState } from "react";
import type * as EngineModule from "@renovate-config-visualizer/engine";

/**
 * Roadmap 015: the engine module, loaded once up front — by the time the
 * simulator can render, a run has already pulled the engine chunk in (see
 * `useSimulationRun`), so this is a cache hit, not a second network fetch.
 *
 * Typed off a type-only import declaration (erased at build time, so the
 * engine still arrives only via the dynamic `import()` in the effect below).
 */
export function useEngineModule(): typeof EngineModule | null {
  const [engineModule, setEngineModule] = useState<typeof EngineModule | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const m = await import("@renovate-config-visualizer/engine");
      if (!cancelled) {
        setEngineModule(m);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return engineModule;
}
