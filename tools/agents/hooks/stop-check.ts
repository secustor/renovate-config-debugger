/**
 * Stop — the branch must be green before the turn ends.
 *
 * Runs the same checks CI's `lint` and `test` jobs run, minus the e2e suite:
 * Playwright needs a production build first and takes minutes, which is the
 * wrong trade at the end of every turn (`pnpm --filter …/app test:e2e`, after
 * a build, stays a deliberate manual step). Everything else is ~30s in total,
 * and less than that when only one package changed.
 *
 * Failures block the stop and are handed back as the reason, tail of output
 * included, so the next turn starts from the actual error.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { exec } from "./utils/exec.ts";
import { getGitStatePath, getRepoRoot, getWorkingSet } from "./utils/git.ts";
import { block } from "./utils/output.ts";

interface Check {
  id: string;
  args: string[];
}

const PACKAGES = ["engine", "app", "oauth-worker"] as const;
type PackageName = (typeof PACKAGES)[number];

function filter(pkg: PackageName, script: string): string[] {
  return ["--filter", `@renovate-config-debugger/${pkg}`, script];
}

/** Repo-wide and cheap (~7s together) — run whenever anything at all changed. */
const ALWAYS: Check[] = [
  { id: "lint", args: ["lint"] },
  { id: "format:check", args: ["format:check"] },
  { id: "typecheck", args: ["typecheck"] },
];

const TESTS: Record<PackageName, Check[]> = {
  engine: [{ id: "engine tests", args: filter("engine", "test") }],
  app: [
    { id: "app unit/render tests", args: filter("app", "test:unit") },
    // Cheap, and it guards a module regime (`vite dev`) that no other check
    // exercises — see the app's scripts/check-dev-module-graph.mjs.
    { id: "app dev module graph", args: filter("app", "check:dev-graph") },
  ],
  "oauth-worker": [{ id: "oauth-worker tests", args: filter("oauth-worker", "test") }],
};

/** Files no check here reads — prose only, so a docs edit shouldn't cost 30s. */
function isCovered(file: string): boolean {
  return !(file.endsWith(".md") || file.startsWith("docs/") || file.startsWith("roadmap/"));
}

function affectedPackages(files: string[]): Set<PackageName> {
  const affected = new Set<PackageName>();
  for (const file of files) {
    if (file.startsWith("packages/engine/")) {
      // The app imports the engine, so an engine edit has to re-run both.
      affected.add("engine");
      affected.add("app");
    } else if (file.startsWith("packages/app/")) {
      affected.add("app");
    } else if (file.startsWith("packages/oauth-worker/")) {
      affected.add("oauth-worker");
    } else {
      // Root-level: a lockfile, a tsconfig, the lint config, these hooks —
      // anything that can change what every package compiles or resolves to.
      return new Set(PACKAGES);
    }
  }
  return affected;
}

interface State {
  /** Fingerprint of the working set the last green run covered. */
  green?: string;
  /** Consecutive blocks, to break a stop → fix → stop loop that isn't converging. */
  blocks?: number;
}

const MAX_CONSECUTIVE_BLOCKS = 3;

async function readState(path: string | null): Promise<State> {
  if (!path) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as State) : {};
  } catch {
    return {};
  }
}

async function writeState(path: string | null, state: State): Promise<void> {
  if (!path) {
    return;
  }
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(state));
  } catch {
    // State is a cache; losing it costs one redundant check run, nothing more.
  }
}

const root = await getRepoRoot();
if (!root) {
  process.exit(0);
}

const { files, fingerprint } = await getWorkingSet(root);
const relevant = files.filter(isCovered);
if (relevant.length === 0) {
  process.exit(0);
}

const statePath = await getGitStatePath(root, "rcv-stop-check.json");
const state = await readState(statePath);
// The fingerprint is the content of the changes themselves, and the checks are
// derived from that content — so an unchanged fingerprint means an unchanged
// verdict, and every stop after the first green one is free.
if (state.green === fingerprint) {
  process.exit(0);
}

const checks = [...ALWAYS, ...[...affectedPackages(relevant)].flatMap((pkg) => TESTS[pkg])];

const failures: string[] = [];
for (const check of checks) {
  console.error(`[hooks] pnpm ${check.args.join(" ")}`);
  const result = await exec("pnpm", check.args, { cwd: root });
  if (!result.ok) {
    // Tail rather than head: the summary a runner prints last is the part
    // worth carrying back.
    failures.push(
      `--- ${check.id} (pnpm ${check.args.join(" ")}) ---\n${result.output.slice(-2000).trim()}`,
    );
  }
}

if (failures.length === 0) {
  await writeState(statePath, { green: fingerprint });
  process.exit(0);
}

const blocks = (state.blocks ?? 0) + 1;

if (blocks > MAX_CONSECUTIVE_BLOCKS) {
  // Let the turn end and say so plainly. Blocking forever on something the
  // agent can't fix burns tokens and hides the problem from the user. The
  // counter resets, so the next turn gets a full set of attempts again.
  await writeState(statePath, {});
  console.error(
    `[hooks] still failing after ${MAX_CONSECUTIVE_BLOCKS} blocked stops — letting this one through:\n${failures.join("\n\n")}`,
  );
  process.exit(0);
}

await writeState(statePath, { blocks });
block(
  `Repository checks failed (e2e excluded). Fix these before finishing:\n\n${failures.join("\n\n")}`,
);
