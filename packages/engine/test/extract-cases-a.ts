import type { ExtractCase } from "./extract-cases";

/**
 * Broad-sweep batch A (managers ansible → devcontainer, alphabetically): one
 * real package file per mapped manager, extracted under both module regimes —
 * see extract-cases.ts.
 */
export const EXTRACT_CASES_A: ExtractCase[] = [
  {
    fixture: "ansible/main.yml",
    fileName: "roles/web/tasks/main.yml",
    manager: "ansible",
    expectDeps: ["nginx", "redis"],
  },
  {
    fixture: "ansible-galaxy/requirements.yml",
    fileName: "requirements.yml",
    manager: "ansible-galaxy",
    expectDeps: ["community.general", "ansible.posix", "geerlingguy.nginx"],
  },
  {
    fixture: "ant/build.xml",
    fileName: "build.xml",
    manager: "ant",
    expectDeps: ["org.apache.commons:commons-lang3", "com.google.guava:guava"],
  },
  {
    fixture: "argocd/application.yaml",
    fileName: "argocd/application.yaml",
    manager: "argocd",
    expectDeps: ["nginx"],
  },
  {
    fixture: "asdf/.tool-versions",
    fileName: ".tool-versions",
    manager: "asdf",
    expectDeps: ["node", "python"],
  },
  {
    fixture: "azure-pipelines/azure-pipelines.yml",
    fileName: "azure-pipelines.yml",
    manager: "azure-pipelines",
    expectDeps: ["contoso/build-templates", "ubuntu", "UseDotNet"],
  },
  {
    fixture: "batect/batect.yml",
    fileName: "batect.yml",
    manager: "batect",
    expectDeps: ["alpine", "https://github.com/batect/hello-world-bundle.git"],
  },
  {
    fixture: "batect-wrapper/batect",
    fileName: "batect",
    manager: "batect-wrapper",
    expectDeps: ["batect/batect"],
  },
  {
    fixture: "bazel/WORKSPACE",
    fileName: "WORKSPACE",
    manager: "bazel",
    expectDeps: ["rules_go", "rules_python"],
  },
  {
    fixture: "bazel-module/MODULE.bazel",
    fileName: "MODULE.bazel",
    manager: "bazel-module",
    expectDeps: ["rules_go", "gazelle"],
  },
  {
    fixture: "bazelisk/.bazelversion",
    fileName: ".bazelversion",
    manager: "bazelisk",
    expectDeps: ["bazel"],
  },
  {
    fixture: "bicep/main.bicep",
    fileName: "main.bicep",
    manager: "bicep",
    expectDeps: ["Microsoft.Storage/storageAccounts", "Microsoft.Web/serverfarms"],
  },
  {
    fixture: "bitbucket-pipelines/bitbucket-pipelines.yml",
    fileName: "bitbucket-pipelines.yml",
    manager: "bitbucket-pipelines",
    expectDeps: ["node", "atlassian/aws-s3-deploy"],
  },
  {
    fixture: "bitrise/bitrise.yml",
    fileName: "bitrise.yml",
    manager: "bitrise",
    expectDeps: ["activate-ssh-key", "git-clone"],
  },
  {
    fixture: "buildkite/pipeline.yml",
    fileName: ".buildkite/pipeline.yml",
    manager: "buildkite",
    expectDeps: ["docker-compose", "artifacts"],
  },
  {
    fixture: "buildpacks/project.toml",
    fileName: "project.toml",
    manager: "buildpacks",
    expectDeps: ["paketobuildpacks/builder-jammy-base", "paketo-buildpacks/git"],
  },
  {
    fixture: "bun-version/.bun-version",
    fileName: ".bun-version",
    manager: "bun-version",
    expectDeps: ["Bun"],
  },
  {
    fixture: "bundler/Gemfile",
    fileName: "Gemfile",
    manager: "bundler",
    expectDeps: ["rails", "puma", "rspec-rails"],
  },
  {
    fixture: "cake/build.cake",
    fileName: "build.cake",
    manager: "cake",
    expectDeps: ["Cake.Docker", "nunit.consolerunner"],
  },
  {
    fixture: "cdnurl/index.html",
    fileName: "index.html",
    manager: "cdnurl",
    expectDeps: ["font-awesome", "jquery"],
  },
  {
    fixture: "circleci/config.yml",
    fileName: ".circleci/config.yml",
    manager: "circleci",
    expectDeps: ["node", "cimg/node"],
  },
  {
    fixture: "cloudbuild/cloudbuild.yaml",
    fileName: "cloudbuild.yaml",
    manager: "cloudbuild",
    expectDeps: ["gcr.io/cloud-builders/docker", "golang"],
  },
  {
    fixture: "composer/composer.json",
    fileName: "composer.json",
    manager: "composer",
    expectDeps: ["monolog/monolog", "phpunit/phpunit"],
  },
  {
    fixture: "conan/conanfile.txt",
    fileName: "conanfile.txt",
    manager: "conan",
    expectDeps: ["zlib", "fmt"],
  },
  {
    fixture: "copier/.copier-answers.yml",
    fileName: ".copier-answers.yml",
    manager: "copier",
    expectDeps: ["https://github.com/example/copier-template.git"],
  },
  {
    fixture: "cpanfile/cpanfile",
    fileName: "cpanfile",
    manager: "cpanfile",
    expectDeps: ["Plack", "JSON::MaybeXS", "Test::More"],
  },
  {
    fixture: "crossplane/provider.yaml",
    fileName: "crossplane/provider.yaml",
    manager: "crossplane",
    expectDeps: ["xpkg.upbound.io/upbound/provider-aws-s3"],
  },
  {
    fixture: "crow/.crow.yml",
    fileName: ".crow.yml",
    manager: "crow",
    expectDeps: ["golang", "alpine"],
  },
  {
    fixture: "deps-edn/deps.edn",
    fileName: "deps.edn",
    manager: "deps-edn",
    expectDeps: ["org.clojure/clojure", "cheshire/cheshire"],
  },
  {
    fixture: "devbox/devbox.json",
    fileName: "devbox.json",
    manager: "devbox",
    expectDeps: ["nodejs", "python"],
  },
  {
    fixture: "devcontainer/devcontainer.json",
    fileName: ".devcontainer/devcontainer.json",
    manager: "devcontainer",
    expectDeps: ["mcr.microsoft.com/devcontainers/base", "ghcr.io/devcontainers/features/node"],
  },
];
