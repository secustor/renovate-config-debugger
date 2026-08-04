/**
 * Roadmap 059: the engine's public API, re-exported as a second entry of the
 * published bundle.
 *
 * This exists for ONE reason: the bundle's parity proof. CI re-runs the
 * engine's own shimmed snapshot suite with `../src/index` aliased to
 * `dist/engine-surface.js`, so "the bundle is the same module graph" is
 * tested against the artifact that ships, not assumed from the fact that both
 * were built with the same plugin. It shares every chunk with `dist/main.js`,
 * which is what makes the proof cover the CLI too.
 *
 * It is not a supported import: the package declares no `exports` for it, and
 * programmatic consumers want `@renovate-config-debugger/engine` (roadmap 056)
 * rather than a debugger CLI's internals.
 */
export * from "@renovate-config-debugger/engine";
