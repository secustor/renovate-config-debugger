import type { ExtractCase } from "./extract-cases";

/**
 * Broad-sweep batch C (managers pixi → xcodegen, alphabetically): one real
 * package file per mapped manager, extracted under both module regimes — see
 * extract-cases.ts.
 */
export const EXTRACT_CASES_C: ExtractCase[] = [
  {
    fixture: "pixi/pixi.toml",
    fileName: "pixi.toml",
    manager: "pixi",
    expectDeps: ["python", "httpx"],
  },
  {
    fixture: "poetry/pyproject.toml",
    fileName: "pyproject.toml",
    manager: "poetry",
    expectDeps: ["requests", "pytest"],
  },
  {
    fixture: "pre-commit/.pre-commit-config.yaml",
    fileName: ".pre-commit-config.yaml",
    manager: "pre-commit",
    expectDeps: ["pre-commit/pre-commit-hooks", "psf/black"],
  },
  {
    fixture: "proto/.prototools",
    fileName: ".prototools",
    manager: "proto",
    expectDeps: ["node", "pnpm", "go"],
  },
  {
    fixture: "pub/pubspec.yaml",
    fileName: "pubspec.yaml",
    manager: "pub",
    expectDeps: ["http", "collection", "test"],
  },
  {
    fixture: "puppet/Puppetfile",
    fileName: "Puppetfile",
    manager: "puppet",
    expectDeps: ["puppetlabs/stdlib", "puppetlabs/apt"],
  },
  {
    fixture: "pyenv/.python-version",
    fileName: ".python-version",
    manager: "pyenv",
    expectDeps: ["python"],
  },
  {
    fixture: "quadlet/nginx.container",
    fileName: "nginx.container",
    manager: "quadlet",
    expectDeps: ["docker.io/library/nginx"],
  },
  {
    fixture: "renovate-config/renovate.json",
    fileName: "renovate.json",
    manager: "renovate-config",
    expectDeps: ["renovatebot/.github"],
  },
  {
    fixture: "ruby-version/.ruby-version",
    fileName: ".ruby-version",
    manager: "ruby-version",
    expectDeps: ["ruby"],
  },
  {
    fixture: "runtime-version/runtime.txt",
    fileName: "runtime.txt",
    manager: "runtime-version",
    expectDeps: ["python"],
  },
  {
    fixture: "rust-toolchain/rust-toolchain.toml",
    fileName: "rust-toolchain.toml",
    manager: "rust-toolchain",
    expectDeps: ["rust"],
  },
  {
    fixture: "sbt/build.sbt",
    fileName: "build.sbt",
    manager: "sbt",
    expectDeps: ["org.typelevel:cats-core", "org.scalatest:scalatest"],
  },
  {
    fixture: "scalafmt/.scalafmt.conf",
    fileName: ".scalafmt.conf",
    manager: "scalafmt",
    expectDeps: ["scalafmt"],
  },
  {
    fixture: "setup-cfg/setup.cfg",
    fileName: "setup.cfg",
    manager: "setup-cfg",
    expectDeps: ["requests", "flask", "pytest"],
  },
  {
    fixture: "smithy/smithy-build.json",
    fileName: "smithy-build.json",
    manager: "smithy",
    expectDeps: ["software.amazon.smithy:smithy-cli"],
  },
  {
    fixture: "sveltos/clusterprofile.yaml",
    fileName: "clusterprofile.yaml",
    manager: "sveltos",
    expectDeps: ["kyverno/kyverno"],
  },
  {
    fixture: "swift/Package.swift",
    fileName: "Package.swift",
    manager: "swift",
    expectDeps: ["apple/swift-log", "apple/swift-argument-parser"],
  },
  {
    fixture: "tekton/pipeline.yaml",
    fileName: ".tekton/pipeline.yaml",
    manager: "tekton",
    expectDeps: ["gcr.io/tekton-releases/catalog/upstream/git-clone"],
  },
  {
    fixture: "terraform-version/.terraform-version",
    fileName: ".terraform-version",
    manager: "terraform-version",
    expectDeps: ["hashicorp/terraform"],
  },
  {
    fixture: "terragrunt/terragrunt.hcl",
    fileName: "terragrunt.hcl",
    manager: "terragrunt",
    expectDeps: ["github.com/gruntwork-io/terragrunt-infrastructure-modules-example"],
  },
  {
    fixture: "terragrunt-version/.terragrunt-version",
    fileName: ".terragrunt-version",
    manager: "terragrunt-version",
    expectDeps: ["gruntwork-io/terragrunt"],
  },
  {
    fixture: "tflint-plugin/.tflint.hcl",
    fileName: ".tflint.hcl",
    manager: "tflint-plugin",
    expectDeps: ["terraform-linters/tflint-ruleset-aws"],
  },
  {
    fixture: "travis/.travis.yml",
    fileName: ".travis.yml",
    manager: "travis",
    expectDeps: ["node"],
  },
  {
    fixture: "typst/main.typ",
    fileName: "main.typ",
    manager: "typst",
    expectDeps: ["cetz", "tablex"],
  },
  {
    fixture: "unity3d/ProjectVersion.txt",
    fileName: "ProjectSettings/ProjectVersion.txt",
    manager: "unity3d",
    expectDeps: ["Unity Editor"],
  },
  {
    fixture: "velaci/.vela.yml",
    fileName: ".vela.yml",
    manager: "velaci",
    expectDeps: ["golang", "postgres"],
  },
  {
    fixture: "vendir/vendir.yml",
    fileName: "vendir.yml",
    manager: "vendir",
    expectDeps: ["contour", "kubernetes/kubernetes"],
  },
  {
    fixture: "woodpecker/.woodpecker.yml",
    fileName: ".woodpecker.yml",
    manager: "woodpecker",
    expectDeps: ["golang", "node"],
  },
  {
    fixture: "xcodegen/project.yml",
    fileName: "project.yml",
    manager: "xcodegen",
    expectDeps: ["SwiftLog", "Alamofire"],
  },
];
