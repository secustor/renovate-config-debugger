import type { ExtractCase } from "./extract-cases";

/**
 * Broad-sweep batch B (managers docker-compose → pipenv, alphabetically): one
 * real package file per mapped manager, extracted under both module regimes —
 * see extract-cases.ts.
 */
export const EXTRACT_CASES_B: ExtractCase[] = [
  {
    fixture: "docker-compose/docker-compose.yml",
    fileName: "docker-compose.yml",
    manager: "docker-compose",
    expectDeps: ["nginx", "postgres"],
  },
  {
    fixture: "droneci/.drone.yml",
    fileName: ".drone.yml",
    manager: "droneci",
    expectDeps: ["golang", "node"],
  },
  {
    fixture: "fleet/fleet.yaml",
    fileName: "fleet.yaml",
    manager: "fleet",
    expectDeps: ["kube-prometheus-stack"],
  },
  {
    fixture: "fvm/.fvmrc",
    fileName: ".fvmrc",
    manager: "fvm",
    expectDeps: ["flutter"],
  },
  {
    fixture: "gitlabci/.gitlab-ci.yml",
    fileName: ".gitlab-ci.yml",
    manager: "gitlabci",
    expectDeps: ["node", "golang"],
  },
  {
    fixture: "gitlabci-include/.gitlab-ci.yml",
    fileName: ".gitlab-ci.yml",
    manager: "gitlabci-include",
    expectDeps: ["my-group/ci-templates"],
  },
  {
    fixture: "glasskube/packages.yaml",
    fileName: "packages.yaml",
    manager: "glasskube",
    expectDeps: ["cert-manager"],
  },
  {
    fixture: "haskell-cabal/my-package.cabal",
    fileName: "my-package.cabal",
    manager: "haskell-cabal",
    expectDeps: ["base", "aeson"],
  },
  {
    fixture: "helm-requirements/requirements.yaml",
    fileName: "requirements.yaml",
    manager: "helm-requirements",
    expectDeps: ["redis", "postgresql"],
  },
  {
    fixture: "helmfile/helmfile.yaml",
    fileName: "helmfile.yaml",
    manager: "helmfile",
    expectDeps: ["redis", "postgresql"],
  },
  {
    fixture: "helmsman/helmsman.yaml",
    fileName: "helmsman.yaml",
    manager: "helmsman",
    expectDeps: ["redis"],
  },
  {
    fixture: "helmv3/Chart.yaml",
    fileName: "Chart.yaml",
    manager: "helmv3",
    expectDeps: ["redis", "postgresql"],
  },
  {
    fixture: "homeassistant-manifest/manifest.json",
    fileName: "custom_components/my_integration/manifest.json",
    manager: "homeassistant-manifest",
    expectDeps: ["aiohttp", "PyYAML"],
  },
  {
    fixture: "homebrew/ffmpeg.rb",
    fileName: "Formula/ffmpeg.rb",
    manager: "homebrew",
    expectDeps: ["FFmpeg/FFmpeg"],
  },
  {
    fixture: "html/index.html",
    fileName: "index.html",
    manager: "html",
    expectDeps: ["font-awesome", "jquery"],
  },
  {
    fixture: "jenkins/plugins.yaml",
    fileName: "plugins.yaml",
    manager: "jenkins",
    expectDeps: ["git", "job-dsl"],
  },
  {
    fixture: "jsonnet-bundler/jsonnetfile.json",
    fileName: "jsonnetfile.json",
    manager: "jsonnet-bundler",
    expectDeps: ["github.com/grafana/grafonnet-lib/grafonnet"],
  },
  {
    fixture: "kotlin-script/build.main.kts",
    fileName: "build.main.kts",
    manager: "kotlin-script",
    expectDeps: ["com.google.guava:guava", "org.apache.commons:commons-lang3"],
  },
  {
    fixture: "kubernetes/deployment.yaml",
    fileName: "k8s/deployment.yaml",
    manager: "kubernetes",
    expectDeps: ["nginx", "envoyproxy/envoy"],
  },
  {
    fixture: "leiningen/project.clj",
    fileName: "project.clj",
    manager: "leiningen",
    expectDeps: ["org.clojure:clojure", "ring:ring-core"],
  },
  {
    fixture: "maven-wrapper/maven-wrapper.properties",
    fileName: ".mvn/wrapper/maven-wrapper.properties",
    manager: "maven-wrapper",
    expectDeps: ["maven", "maven-wrapper"],
  },
  {
    fixture: "meteor/package.js",
    fileName: "package.js",
    manager: "meteor",
    expectDeps: ["lodash", "semver"],
  },
  {
    fixture: "mint/Mintfile",
    fileName: "Mintfile",
    manager: "mint",
    expectDeps: ["realm/SwiftLint", "yonaskolb/XcodeGen"],
  },
  {
    fixture: "mise/mise.toml",
    fileName: "mise.toml",
    manager: "mise",
    expectDeps: ["node", "terraform"],
  },
  {
    fixture: "nodenv/.node-version",
    fileName: ".node-version",
    manager: "nodenv",
    expectDeps: ["node"],
  },
  {
    fixture: "nvm/.nvmrc",
    fileName: ".nvmrc",
    manager: "nvm",
    expectDeps: ["node"],
  },
  {
    fixture: "ocb/builder-config.yaml",
    fileName: "builder-config.yaml",
    manager: "ocb",
    expectDeps: ["go.opentelemetry.io/collector"],
  },
  {
    fixture: "osgi/feature.json",
    fileName: "src/main/features/feature.json",
    manager: "osgi",
    expectDeps: ["org.apache.sling:org.apache.sling.api", "com.google.guava:guava"],
  },
  {
    fixture: "pep723/script.py",
    fileName: "script.py",
    manager: "pep723",
    expectDeps: ["requests", "rich"],
  },
  {
    fixture: "pip-compile/requirements.txt",
    fileName: "requirements.txt",
    manager: "pip-compile",
    expectDeps: ["click", "flask"],
  },
  {
    fixture: "pip_setup/setup.py",
    fileName: "setup.py",
    manager: "pip_setup",
    expectDeps: ["requests", "click"],
  },
];
