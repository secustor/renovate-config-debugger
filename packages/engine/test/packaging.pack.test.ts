/**
 * Roadmap 056 — the published shape, asserted against a real tarball.
 *
 * `pnpm pack` (which runs `prepack` → the tsc build, and applies the
 * `publishConfig` rewrite of `exports`) is unpacked into a scratch directory
 * outside the workspace, linked up like a consumer's `node_modules`, and then:
 *
 * 1. the packed manifest is checked (nothing private, AGPL stated, exports
 *    pointing at `dist/`, the Renovate pin exact);
 * 2. the tarball's file list is checked (dist + README + LICENSE, no sources,
 *    no tests, no scripts);
 * 3. a scratch consumer that imports all three entry points is TYPE-CHECKED
 *    against the tarball — the only thing that catches an `exports` typo, a
 *    missing `types` condition, or a `renovate/dist/**` type path leaking into
 *    the public surface (those modules ship no `.d.ts`; this package declares
 *    them ambiently, which does not travel);
 * 4. the packed Vite plugin is loaded and every shim it redirects to is
 *    required to exist inside the tarball — the compiled tree still has to
 *    line up with `renovateShims()`'s own path arithmetic.
 *
 * Deliberately NOT executed: the emitted ESM is bundler-targeted (extensionless
 * relative specifiers, JSON imports of `renovate/package.json`), which is the
 * documented consumption model — running the engine under plain Node is its own
 * roadmap item.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const pkgRoot = fileURLToPath(new URL("..", import.meta.url));
const PACKAGE_NAME = "@renovate-config-debugger/engine";

/** The scratch consumer: touches every entry point, values and types alike. */
const CONSUMER_SOURCE = `
import {
  mergeChildConfig,
  renovateVersion,
  runPipeline,
  simulatePackageRules,
  STAGE_IDS,
  type PipelineInput,
  type TraceResult,
} from "${PACKAGE_NAME}";
import { renovateSchema } from "${PACKAGE_NAME}/schema";
import { renovateShims } from "${PACKAGE_NAME}/vite-plugin";

export const stages: readonly string[] = STAGE_IDS;
export const version: string = renovateVersion;
export const schemaKeys: string[] = Object.keys(renovateSchema);
export const plugin = renovateShims();
export const merged = mergeChildConfig({ a: 1 }, { b: 2 });
export const simulate = simulatePackageRules;

export function run(input: PipelineInput): Promise<TraceResult> {
  return runPipeline(input);
}
`;

const CONSUMER_TSCONFIG = {
  compilerOptions: {
    target: "ES2023",
    module: "ESNext",
    moduleResolution: "bundler",
    lib: ["ES2023", "DOM"],
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    types: [],
  },
  files: ["consumer.ts"],
};

interface PackedManifest {
  private?: boolean;
  version: string;
  license: string;
  description: string;
  files: string[];
  keywords: string[];
  homepage: string;
  repository: { url: string; directory: string };
  exports: Record<string, { types: string; default: string }>;
  types: string;
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  publishConfig?: Record<string, unknown>;
  scripts?: Record<string, string>;
}

/** The one hook shape this plugin uses — a plain function, not an object hook. */
interface ShimPlugin {
  resolveId: (source: string, importer?: string) => string | null;
}

let scratch = "";
/** The unpacked tarball: `<scratch>/package`. */
let packed = "";
let manifest: PackedManifest;
let tarballFiles: string[] = [];

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Failure output rather than a thrown Error, so a tsc diagnostic is readable. */
function runForDiagnostics(command: string, args: string[], cwd: string): string {
  try {
    run(command, args, cwd);
    return "";
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: string; stderr?: string };
    return `${stdout ?? ""}${stderr ?? ""}`.trim() || String(error);
  }
}

beforeAll(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "rcd-engine-pack-"));

  // `pnpm pack` runs prepack (the build) and rewrites exports/types from
  // publishConfig — i.e. exactly what `pnpm publish` would upload.
  run("pnpm", ["pack", "--pack-destination", scratch], pkgRoot);
  const tarball = fs.readdirSync(scratch).find((entry) => entry.endsWith(".tgz"));
  expect(tarball, "pnpm pack produced no tarball").toBeDefined();

  tarballFiles = run("tar", ["-tzf", String(tarball)], scratch)
    .split("\n")
    .filter(Boolean)
    // every entry is prefixed `package/`; compare against the paths a consumer
    // would see instead.
    .map((entry) => entry.replace(/^package\//, ""))
    .filter((entry) => !entry.endsWith("/"));
  run("tar", ["-xzf", String(tarball)], scratch);
  packed = path.join(scratch, "package");
  manifest = JSON.parse(fs.readFileSync(path.join(packed, "package.json"), "utf8"));

  // A consumer's node_modules: the tarball under its own name, plus everything
  // the published manifest says an install brings with it (its declared
  // dependencies, and `vite` for the optional peer the plugin entry needs).
  // Symlinked to the real store paths so their own dependencies keep resolving
  // — which also makes a dependency this package forgot to declare fail here.
  const nodeModules = path.join(scratch, "node_modules");
  fs.mkdirSync(path.join(nodeModules, "@renovate-config-debugger"), { recursive: true });
  fs.symlinkSync(packed, path.join(nodeModules, PACKAGE_NAME), "dir");
  for (const dep of [...Object.keys(manifest.dependencies), "vite"]) {
    fs.symlinkSync(
      fs.realpathSync(path.join(pkgRoot, "node_modules", dep)),
      path.join(nodeModules, dep),
      "dir",
    );
  }

  fs.writeFileSync(path.join(scratch, "consumer.ts"), CONSUMER_SOURCE);
  fs.writeFileSync(path.join(scratch, "tsconfig.json"), JSON.stringify(CONSUMER_TSCONFIG, null, 2));
}, 300_000);

describe("the packed manifest", () => {
  it("is publishable and says AGPL on the tin", () => {
    expect(manifest.private).toBeUndefined();
    expect(manifest.license).toBe("AGPL-3.0-only");
    // The engine links Renovate's own AGPL code; npm's package page is where a
    // consumer looks for that, so the description states it too (roadmap 056).
    expect(manifest.description).toMatch(/AGPL-3\.0-only/);
    expect(manifest.version).toMatch(/^0\.\d+\.\d+$/);
    expect(manifest.keywords).toContain("renovate");
    expect(manifest.homepage).toContain("github.com/secustor/renovate-config-debugger");
    expect(manifest.repository.directory).toBe("packages/engine");
  });

  it("pins renovate exactly rather than ranging over it", () => {
    // The engine reaches into renovate/dist internals that are not a public
    // API: the exact pin IS the contract (roadmap 056).
    expect(manifest.dependencies.renovate).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.peerDependencies.vite).toBeDefined();
  });

  it("exports the three entry points from built output, types first", () => {
    expect(Object.keys(manifest.exports)).toEqual([".", "./schema", "./vite-plugin"]);
    for (const [subpath, conditions] of Object.entries(manifest.exports)) {
      // `types` must precede `default`: conditions are matched in order.
      expect(Object.keys(conditions), subpath).toEqual(["types", "default"]);
      for (const target of Object.values(conditions)) {
        expect(target, subpath).toMatch(/^\.\/dist\//);
        expect(fs.existsSync(path.join(packed, target)), `${subpath} → ${target}`).toBe(true);
      }
    }
    expect(manifest.types).toBe("./dist/index.d.ts");
  });
});

describe("the tarball contents", () => {
  it("ships the build, the README and the license — and nothing else", () => {
    expect(tarballFiles).toContain("README.md");
    expect(tarballFiles).toContain("LICENSE");
    expect(tarballFiles).toContain("package.json");
    const unexpected = tarballFiles.filter(
      (entry) =>
        !entry.startsWith("dist/") && !["README.md", "LICENSE", "package.json"].includes(entry),
    );
    expect(unexpected).toEqual([]);
  });

  it("ships no TypeScript sources beyond the declarations", () => {
    const sources = tarballFiles.filter(
      (entry) => entry.endsWith(".ts") && !entry.endsWith(".d.ts"),
    );
    expect(sources).toEqual([]);
  });

  it("keeps the workspace-facing exports on the sources", () => {
    // The app and the engine's own vitest projects consume `src/*.ts` through
    // the workspace; only the PUBLISHED manifest points at dist/ (publishConfig).
    const workspace = JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8")) as {
      exports: Record<string, string>;
    };
    expect(workspace.exports).toEqual({
      ".": "./src/index.ts",
      "./schema": "./src/schema.ts",
      "./vite-plugin": "./src/shims/vite-plugin-renovate-shims.ts",
    });
  });
});

describe("a consumer of the tarball", () => {
  it("type-checks against all three entry points", () => {
    // Runs the engine's own tsc over a scratch project whose only dependency
    // is the packed tarball: resolution goes through the published `exports`,
    // so a missing `types` condition or an unresolvable `renovate/dist` type
    // path in the emitted declarations fails here.
    const tsc = path.join(pkgRoot, "node_modules", ".bin", "tsc");
    expect(runForDiagnostics(tsc, ["-p", "tsconfig.json"], scratch)).toBe("");
  }, 300_000);

  it("gets a Vite plugin whose shims all exist in the tarball", async () => {
    const pluginModule = (await import(
      pathToFileURL(path.join(packed, "dist/shims/vite-plugin-renovate-shims.js")).href
    )) as { renovateShims: () => ShimPlugin };
    const plugin = pluginModule.renovateShims();

    // The redirect table lives in the source; reading the keys back out of it
    // keeps this test from drifting when a choke point is added or removed.
    const source = fs.readFileSync(
      path.join(pkgRoot, "src/shims/vite-plugin-renovate-shims.ts"),
      "utf8",
    );
    const chokePoints = [...source.matchAll(/^\s+"([\w./-]+\.js)":/gm)].map((match) => match[1]);
    expect(chokePoints.length).toBeGreaterThan(10);

    for (const chokePoint of chokePoints) {
      const resolved = plugin.resolveId(`renovate/dist/${chokePoint}`);
      expect(resolved, chokePoint).toBeTruthy();
      expect(String(resolved).startsWith(packed), `${chokePoint} → ${resolved}`).toBe(true);
      expect(fs.existsSync(String(resolved)), `${chokePoint} → ${resolved}`).toBe(true);
    }
  });
});
