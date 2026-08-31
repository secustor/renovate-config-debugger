/**
 * One of the TWO modules that deep-import renovate/dist; the other is
 * ./shims/renovate-internals.ts, which exists because a shim routing through
 * this file would close an import cycle (this module re-exports
 * config/presets/index.js, whose per-host children the preset shims replace).
 *
 * Renovate has no public API — when a release moves a file, those two are the
 * only places to fix. Lint enforces the boundary (.oxlintrc.json).
 */
export { parseFileConfig } from "renovate/dist/config/parse.js";
export { migrateConfig } from "renovate/dist/config/migration.js";
// `migrations-service.js` is deep-imported by ./shims/renovate-internals.ts
// instead — the instrumented migration fork is its only reader.
export { massageConfig } from "renovate/dist/config/massage.js";
export { validateConfig } from "renovate/dist/config/validation.js";
export { resolveConfigPresets } from "renovate/dist/config/presets/index.js";
export { parsePreset } from "renovate/dist/config/presets/parse.js";
// Renovate's bundled preset bodies (`group:`, `monorepo:`, `packages:`, …).
// Synchronous and network-free, and already in the module graph via
// `presets/index.js` — roadmap 014's `group:`-preset translation reads the
// flagged group's OWN body rather than restating it, so the suggested rule
// can't drift from the pinned Renovate.
// `groups` is the raw table those bodies live in — the SAME objects renovate
// hands out, which `getPreset` mutates (see trace/description-provenance.ts).
export {
  getPreset as getInternalPreset,
  groups as internalPresetGroups,
} from "renovate/dist/config/presets/internal/index.js";
export { mergeChildConfig } from "renovate/dist/config/utils.js";
export { getConfig as getDefaultConfig } from "renovate/dist/config/defaults.js";
export { GlobalConfig } from "renovate/dist/config/global.js";
export { InheritConfig } from "renovate/dist/config/inherit.js";
export { getOptions } from "renovate/dist/config/options/index.js";
// The simulator (006) needs the matcher registry only; `applyPackageRules`
// itself is deliberately NOT re-exported — its merge tail is replicated in
// simulate-package-rules.ts, and pulling the real one in would drag slugify +
// template compilation into the browser bundle. The golden/shimmed tests
// deep-import it directly as the behavioral oracle.
export {
  default as packageRuleMatchers,
  type PackageRuleMatcher,
} from "renovate/dist/util/package-rules/matchers.js";
export * as memCache from "renovate/dist/util/cache/memory/index.js";
// The simulator's updateType derivation (roadmap 015) needs a versioning
// scheme's compare functions plus upstream's own major/minor/patch bucketing
// — the same two calls the real dependency lookup makes before an update's
// updateType is ever set.
export {
  get as getVersioningApi,
  type VersioningApi,
} from "renovate/dist/modules/versioning/index.js";
export { getUpdateType } from "renovate/dist/workers/repository/process/lookup/update-type.js";
// ---- Manager extraction (roadmap 078) --------------------------------------
// Filename → manager detection: the generated per-manager file patterns are
// already in the bundle transitively (loadManagerOptions), and getMatchingFiles
// is upstream's own path-only matching step — browser-safe (minimatch + regex).
export { managerDefaultConfigs } from "renovate/dist/manager-default-configs.generated.js";
export { getMatchingFiles } from "renovate/dist/workers/repository/extract/file-match.js";
// extract.ts seeds the file store through upstream's own fs module, so the
// golden project (real fs under GlobalConfig.localDir) and the shimmed one
// (the in-memory shims/fs.ts) run identical engine code.
export { writeLocalFile } from "renovate/dist/util/fs/index.js";
export type {
  ExtractConfig,
  PackageDependency,
  PackageFileContent,
} from "renovate/dist/modules/manager/types.js";
import type { ExtractConfig, PackageFileContent } from "renovate/dist/modules/manager/types.js";

type ManagerExtractFn = (
  content: string,
  packageFile: string,
  config: ExtractConfig,
) => PackageFileContent | null | Promise<PackageFileContent | null>;

/**
 * The lazy map of per-manager extract entry points — deep imports, never
 * `modules/manager/api.js` (the barrel statically imports all 129 managers:
 * 2.8 MB plus got/WASM/@yarnpkg, and renovate ships no `sideEffects` flag to
 * shake it). Each mapped manager is its own lazy chunk, and every entry has a
 * golden/shimmed fixture pair holding the byte-identity invariant.
 *
 * The map holds EVERY browser-clean single-file manager (a classification
 * sweep over the pinned dist: exposes `extractPackageFile`, and its transitive
 * graph is clean over the shim set). Deliberately absent, and why:
 * - `bun`, `deno`, `gradle` — `extractAllPackageFiles`-only, no single-file
 *   function to borrow (npm and maven below have internal ones — used
 *   directly, which deliberately skips npm's lockfile-sweeping `postExtract`
 *   and maven's parent-POM resolution; 078's single-file semantics);
 * - `terraform` — eagerly imports the @cdktf/hcl2json Go WASM;
 * - `cocoapods`, `gleam`, `mix` — their datasource classes pull node:crypto/
 *   zlib at module scope (hex, pod);
 * - `flux`, `kustomize` — node:querystring; `gradle-wrapper` — node:os;
 *   `hermit` — node:stream;
 * - `git-submodules` — graph-clean but extraction itself runs git;
 * - `nix` — reads only the sibling `flake.lock`, never the flake itself, and
 *   the picker fetches one file at a time (also enabled:false upstream);
 * - `pipenv` — calls `ensureLocalPath` (util/fs/util.js, unshimmed), which
 *   resolves against a `GlobalConfig.localDir` the browser never sets;
 * - `regex`/`jsonata` custom managers — need user-authored matchStrings (063).
 */
export const managerExtractors: Record<string, () => Promise<ManagerExtractFn>> = {
  ansible: async () =>
    (await import("renovate/dist/modules/manager/ansible/extract.js")).extractPackageFile,
  "ansible-galaxy": async () =>
    (await import("renovate/dist/modules/manager/ansible-galaxy/extract.js")).extractPackageFile,
  ant: async () =>
    (await import("renovate/dist/modules/manager/ant/extract.js")).extractPackageFile,
  argocd: async () =>
    (await import("renovate/dist/modules/manager/argocd/extract.js")).extractPackageFile,
  asdf: async () =>
    (await import("renovate/dist/modules/manager/asdf/extract.js")).extractPackageFile,
  "azure-pipelines": async () =>
    (await import("renovate/dist/modules/manager/azure-pipelines/extract.js")).extractPackageFile,
  batect: async () =>
    (await import("renovate/dist/modules/manager/batect/extract.js")).extractPackageFile,
  "batect-wrapper": async () =>
    (await import("renovate/dist/modules/manager/batect-wrapper/extract.js")).extractPackageFile,
  bazel: async () =>
    (await import("renovate/dist/modules/manager/bazel/extract.js")).extractPackageFile,
  "bazel-module": async () =>
    (await import("renovate/dist/modules/manager/bazel-module/extract.js")).extractPackageFile,
  bazelisk: async () =>
    (await import("renovate/dist/modules/manager/bazelisk/extract.js")).extractPackageFile,
  bicep: async () =>
    (await import("renovate/dist/modules/manager/bicep/extract.js")).extractPackageFile,
  "bitbucket-pipelines": async () =>
    (await import("renovate/dist/modules/manager/bitbucket-pipelines/extract.js"))
      .extractPackageFile,
  bitrise: async () =>
    (await import("renovate/dist/modules/manager/bitrise/extract.js")).extractPackageFile,
  buildkite: async () =>
    (await import("renovate/dist/modules/manager/buildkite/extract.js")).extractPackageFile,
  buildpacks: async () =>
    (await import("renovate/dist/modules/manager/buildpacks/extract.js")).extractPackageFile,
  "bun-version": async () =>
    (await import("renovate/dist/modules/manager/bun-version/index.js")).extractPackageFile,
  bundler: async () =>
    (await import("renovate/dist/modules/manager/bundler/extract.js")).extractPackageFile,
  cake: async () =>
    (await import("renovate/dist/modules/manager/cake/index.js")).extractPackageFile,
  cargo: async () =>
    (await import("renovate/dist/modules/manager/cargo/extract.js")).extractPackageFile,
  cdnurl: async () =>
    (await import("renovate/dist/modules/manager/cdnurl/extract.js")).extractPackageFile,
  circleci: async () =>
    (await import("renovate/dist/modules/manager/circleci/extract.js")).extractPackageFile,
  cloudbuild: async () =>
    (await import("renovate/dist/modules/manager/cloudbuild/extract.js")).extractPackageFile,
  composer: async () =>
    (await import("renovate/dist/modules/manager/composer/extract.js")).extractPackageFile,
  conan: async () =>
    (await import("renovate/dist/modules/manager/conan/extract.js")).extractPackageFile,
  copier: async () =>
    (await import("renovate/dist/modules/manager/copier/extract.js")).extractPackageFile,
  cpanfile: async () =>
    (await import("renovate/dist/modules/manager/cpanfile/extract.js")).extractPackageFile,
  crossplane: async () =>
    (await import("renovate/dist/modules/manager/crossplane/extract.js")).extractPackageFile,
  crow: async () =>
    (await import("renovate/dist/modules/manager/crow/extract.js")).extractPackageFile,
  "deps-edn": async () =>
    (await import("renovate/dist/modules/manager/deps-edn/extract.js")).extractPackageFile,
  devbox: async () =>
    (await import("renovate/dist/modules/manager/devbox/extract.js")).extractPackageFile,
  devcontainer: async () =>
    (await import("renovate/dist/modules/manager/devcontainer/extract.js")).extractPackageFile,
  "docker-compose": async () =>
    (await import("renovate/dist/modules/manager/docker-compose/extract.js")).extractPackageFile,
  dockerfile: async () =>
    (await import("renovate/dist/modules/manager/dockerfile/extract.js")).extractPackageFile,
  droneci: async () =>
    (await import("renovate/dist/modules/manager/droneci/extract.js")).extractPackageFile,
  fleet: async () =>
    (await import("renovate/dist/modules/manager/fleet/extract.js")).extractPackageFile,
  fvm: async () =>
    (await import("renovate/dist/modules/manager/fvm/extract.js")).extractPackageFile,
  "github-actions": async () =>
    (await import("renovate/dist/modules/manager/github-actions/extract.js")).extractPackageFile,
  gitlabci: async () =>
    (await import("renovate/dist/modules/manager/gitlabci/extract.js")).extractPackageFile,
  "gitlabci-include": async () =>
    (await import("renovate/dist/modules/manager/gitlabci-include/extract.js")).extractPackageFile,
  glasskube: async () =>
    (await import("renovate/dist/modules/manager/glasskube/extract.js")).extractPackageFile,
  gomod: async () =>
    (await import("renovate/dist/modules/manager/gomod/extract.js")).extractPackageFile,
  "haskell-cabal": async () =>
    (await import("renovate/dist/modules/manager/haskell-cabal/index.js")).extractPackageFile,
  "helm-requirements": async () =>
    (await import("renovate/dist/modules/manager/helm-requirements/extract.js")).extractPackageFile,
  "helm-values": async () =>
    (await import("renovate/dist/modules/manager/helm-values/extract.js")).extractPackageFile,
  helmfile: async () =>
    (await import("renovate/dist/modules/manager/helmfile/extract.js")).extractPackageFile,
  helmsman: async () =>
    (await import("renovate/dist/modules/manager/helmsman/extract.js")).extractPackageFile,
  helmv3: async () =>
    (await import("renovate/dist/modules/manager/helmv3/extract.js")).extractPackageFile,
  "homeassistant-manifest": async () =>
    (await import("renovate/dist/modules/manager/homeassistant-manifest/extract.js"))
      .extractPackageFile,
  homebrew: async () =>
    (await import("renovate/dist/modules/manager/homebrew/extract.js")).extractPackageFile,
  html: async () =>
    (await import("renovate/dist/modules/manager/html/extract.js")).extractPackageFile,
  jenkins: async () =>
    (await import("renovate/dist/modules/manager/jenkins/extract.js")).extractPackageFile,
  "jsonnet-bundler": async () =>
    (await import("renovate/dist/modules/manager/jsonnet-bundler/extract.js")).extractPackageFile,
  "kotlin-script": async () =>
    (await import("renovate/dist/modules/manager/kotlin-script/extract.js")).extractPackageFile,
  kubernetes: async () =>
    (await import("renovate/dist/modules/manager/kubernetes/extract.js")).extractPackageFile,
  leiningen: async () =>
    (await import("renovate/dist/modules/manager/leiningen/extract.js")).extractPackageFile,
  "maven-wrapper": async () =>
    (await import("renovate/dist/modules/manager/maven-wrapper/extract.js")).extractPackageFile,
  meteor: async () =>
    (await import("renovate/dist/modules/manager/meteor/extract.js")).extractPackageFile,
  mint: async () =>
    (await import("renovate/dist/modules/manager/mint/extract.js")).extractPackageFile,
  mise: async () =>
    (await import("renovate/dist/modules/manager/mise/extract.js")).extractPackageFile,
  nodenv: async () =>
    (await import("renovate/dist/modules/manager/nodenv/extract.js")).extractPackageFile,
  nuget: async () =>
    (await import("renovate/dist/modules/manager/nuget/extract.js")).extractPackageFile,
  nvm: async () =>
    (await import("renovate/dist/modules/manager/nvm/extract.js")).extractPackageFile,
  ocb: async () =>
    (await import("renovate/dist/modules/manager/ocb/extract.js")).extractPackageFile,
  osgi: async () =>
    (await import("renovate/dist/modules/manager/osgi/extract.js")).extractPackageFile,
  pep621: async () =>
    (await import("renovate/dist/modules/manager/pep621/extract.js")).extractPackageFile,
  pep723: async () =>
    (await import("renovate/dist/modules/manager/pep723/extract.js")).extractPackageFile,
  "pip-compile": async () =>
    (await import("renovate/dist/modules/manager/pip-compile/extract.js")).extractPackageFile,
  pip_requirements: async () =>
    (await import("renovate/dist/modules/manager/pip_requirements/extract.js")).extractPackageFile,
  pip_setup: async () =>
    (await import("renovate/dist/modules/manager/pip_setup/extract.js")).extractPackageFile,
  pixi: async () =>
    (await import("renovate/dist/modules/manager/pixi/extract.js")).extractPackageFile,
  poetry: async () =>
    (await import("renovate/dist/modules/manager/poetry/extract.js")).extractPackageFile,
  "pre-commit": async () =>
    (await import("renovate/dist/modules/manager/pre-commit/extract.js")).extractPackageFile,
  proto: async () =>
    (await import("renovate/dist/modules/manager/proto/extract.js")).extractPackageFile,
  pub: async () =>
    (await import("renovate/dist/modules/manager/pub/extract.js")).extractPackageFile,
  puppet: async () =>
    (await import("renovate/dist/modules/manager/puppet/extract.js")).extractPackageFile,
  pyenv: async () =>
    (await import("renovate/dist/modules/manager/pyenv/extract.js")).extractPackageFile,
  quadlet: async () =>
    (await import("renovate/dist/modules/manager/quadlet/extract.js")).extractPackageFile,
  "renovate-config": async () =>
    (await import("renovate/dist/modules/manager/renovate-config/extract.js")).extractPackageFile,
  "ruby-version": async () =>
    (await import("renovate/dist/modules/manager/ruby-version/extract.js")).extractPackageFile,
  "runtime-version": async () =>
    (await import("renovate/dist/modules/manager/runtime-version/extract.js")).extractPackageFile,
  "rust-toolchain": async () =>
    (await import("renovate/dist/modules/manager/rust-toolchain/extract.js")).extractPackageFile,
  sbt: async () =>
    (await import("renovate/dist/modules/manager/sbt/extract.js")).extractPackageFile,
  scalafmt: async () =>
    (await import("renovate/dist/modules/manager/scalafmt/extract.js")).extractPackageFile,
  "setup-cfg": async () =>
    (await import("renovate/dist/modules/manager/setup-cfg/extract.js")).extractPackageFile,
  smithy: async () =>
    (await import("renovate/dist/modules/manager/smithy/extract.js")).extractPackageFile,
  sveltos: async () =>
    (await import("renovate/dist/modules/manager/sveltos/extract.js")).extractPackageFile,
  swift: async () =>
    (await import("renovate/dist/modules/manager/swift/extract.js")).extractPackageFile,
  tekton: async () =>
    (await import("renovate/dist/modules/manager/tekton/extract.js")).extractPackageFile,
  "terraform-version": async () =>
    (await import("renovate/dist/modules/manager/terraform-version/extract.js")).extractPackageFile,
  terragrunt: async () =>
    (await import("renovate/dist/modules/manager/terragrunt/extract.js")).extractPackageFile,
  "terragrunt-version": async () =>
    (await import("renovate/dist/modules/manager/terragrunt-version/extract.js"))
      .extractPackageFile,
  "tflint-plugin": async () =>
    (await import("renovate/dist/modules/manager/tflint-plugin/extract.js")).extractPackageFile,
  travis: async () =>
    (await import("renovate/dist/modules/manager/travis/extract.js")).extractPackageFile,
  typst: async () =>
    (await import("renovate/dist/modules/manager/typst/extract.js")).extractPackageFile,
  unity3d: async () =>
    (await import("renovate/dist/modules/manager/unity3d/extract.js")).extractPackageFile,
  velaci: async () =>
    (await import("renovate/dist/modules/manager/velaci/extract.js")).extractPackageFile,
  vendir: async () =>
    (await import("renovate/dist/modules/manager/vendir/extract.js")).extractPackageFile,
  woodpecker: async () =>
    (await import("renovate/dist/modules/manager/woodpecker/extract.js")).extractPackageFile,
  xcodegen: async () =>
    (await import("renovate/dist/modules/manager/xcodegen/extract.js")).extractPackageFile,

  maven: async () => {
    const { extractPackage } = await import("renovate/dist/modules/manager/maven/extract.js");
    return (content, packageFile, config) => extractPackage(content, packageFile, config) ?? null;
  },
  npm: async () =>
    (await import("renovate/dist/modules/manager/npm/extract/index.js")).extractPackageFile,
};
