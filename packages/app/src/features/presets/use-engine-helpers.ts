import { useEffect, useState } from "react";
import type { InjectionKeyFn, MergeFn, ParseFn } from "./tree-shared";

/** Loads the engine helpers the tree needs (merge + injection key/parse). */
export function useEngineHelpers() {
  const [helpers, setHelpers] = useState<{
    merge: MergeFn;
    injectionKey: InjectionKeyFn;
    parse: ParseFn;
  } | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const engine = await import("@renovate-config-debugger/engine");
      if (live) {
        setHelpers({
          merge: engine.mergeChildConfig as MergeFn,
          injectionKey: engine.presetInjectionKey as InjectionKeyFn,
          parse: engine.parseInjectedPreset as ParseFn,
        });
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  return helpers;
}
