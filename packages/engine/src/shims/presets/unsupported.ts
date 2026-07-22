/** Factory for preset sources the browser build cannot serve (yet). */
export function makeUnsupportedGetPreset(source: string) {
  return function getPreset(config: { repo: string }): Promise<never> {
    return Promise.reject(
      new Error(
        `preset source '${source}' is not supported in the browser yet (requested: ${config.repo})`,
      ),
    );
  };
}
