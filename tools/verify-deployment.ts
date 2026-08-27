/**
 * Roadmap 088 — the "rebuild & diff" half of "verify this build".
 *
 *   node tools/verify-deployment.ts [origin]     (default: https://renovate.secustor.dev)
 *
 * Three checks, from weakest to strongest:
 * 1. Fetches <origin>/build-manifest.json and every file it lists, and
 *    compares served hashes to the manifest — the deployment is internally
 *    consistent with what it claims to be.
 * 2. Prints the `gh attestation verify` command — GitHub's signed statement
 *    that CI built that manifest from the named commit.
 * 3. If packages/app/dist exists locally, diffs its hashes against the
 *    manifest — run from a checkout of the manifest's commit after
 *    `pnpm --filter @renovate-config-debugger/app build && pnpm --filter
 *    @renovate-config-debugger/app build:manifest`, this is the independent
 *    rebuild proof (the baked identity is commit-derived, so the same commit
 *    reproduces the same bytes).
 *
 * Exit codes: 0 verified, 1 mismatch, 2 could not check.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";

interface ManifestFile {
  sha256: string;
  bytes: number;
}

interface Manifest {
  repo: string;
  commit: string;
  version: string | null;
  commitTime: string | null;
  branch: string | null;
  files: Record<string, ManifestFile>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseManifest(raw: unknown): Manifest | null {
  if (!isRecord(raw) || typeof raw.repo !== "string" || typeof raw.commit !== "string") {
    return null;
  }
  if (!isRecord(raw.files)) {
    return null;
  }
  const files: Record<string, ManifestFile> = {};
  for (const [file, entry] of Object.entries(raw.files)) {
    if (!isRecord(entry) || typeof entry.sha256 !== "string" || typeof entry.bytes !== "number") {
      return null;
    }
    files[file] = { sha256: entry.sha256, bytes: entry.bytes };
  }
  return {
    repo: raw.repo,
    commit: raw.commit,
    version: typeof raw.version === "string" ? raw.version : null,
    commitTime: typeof raw.commitTime === "string" ? raw.commitTime : null,
    branch: typeof raw.branch === "string" ? raw.branch : null,
    files,
  };
}

const sha256 = (body: Uint8Array): string => createHash("sha256").update(body).digest("hex");

async function forEachConcurrent<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  // One shared (synchronous) iterator — each worker pulls the next item.
  const queue = items.values();
  async function worker() {
    for (const item of queue) {
      await work(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

const origin = (process.argv[2] ?? "https://renovate.secustor.dev").replace(/\/+$/, "");

const manifestResponse = await fetch(`${origin}/build-manifest.json`);
if (!manifestResponse.ok) {
  console.error(
    `${origin}/build-manifest.json → HTTP ${manifestResponse.status} — this deployment publishes no manifest.`,
  );
  process.exit(2);
}
const manifest = parseManifest(await manifestResponse.json());
if (!manifest) {
  console.error("build-manifest.json is not the expected shape.");
  process.exit(2);
}

const shortCommit = manifest.commit.slice(0, 7);
console.log(`Deployment: ${origin}`);
console.log(
  `Claims: ${manifest.version ? `v${manifest.version} · ` : ""}${shortCommit}` +
    `${manifest.branch ? ` · ${manifest.branch}` : ""}${manifest.commitTime ? ` · ${manifest.commitTime}` : ""}`,
);
console.log(
  `Attestation check: gh attestation verify build-manifest.json -R ${manifest.repo}\n` +
    `  (every served file is an attested subject — the same command verifies any downloaded asset)\n`,
);

// 1 — the served files against the manifest they were served with.
const entries = Object.entries(manifest.files);
const servedProblems: string[] = [];
await forEachConcurrent(entries, 8, async ([name, expected]) => {
  const response = await fetch(`${origin}/${name}`);
  if (!response.ok) {
    servedProblems.push(`${name}: HTTP ${response.status}`);
    return;
  }
  const digest = sha256(new Uint8Array(await response.arrayBuffer()));
  if (digest !== expected.sha256) {
    servedProblems.push(
      `${name}: served ${digest.slice(0, 12)}… ≠ manifest ${expected.sha256.slice(0, 12)}…`,
    );
  }
});
if (servedProblems.length > 0) {
  console.error(`SERVED ≠ MANIFEST (${servedProblems.length} of ${entries.length} files):`);
  for (const problem of servedProblems.toSorted()) {
    console.error(`  ${problem}`);
  }
  process.exit(1);
}
console.log(`Served files: all ${entries.length} match the manifest.`);

// 2 — the local rebuild, when one is present.
const dist = fileURLToPath(new URL("../packages/app/dist", import.meta.url));
if (!existsSync(dist)) {
  console.log(
    `\nNo local build to diff. For the independent proof, from a checkout of ${shortCommit}:\n` +
      `  git checkout ${manifest.commit}\n` +
      `  pnpm install && pnpm --filter @renovate-config-debugger/app build\n` +
      `then re-run this script.`,
  );
  process.exit(0);
}

const rebuildProblems: string[] = [];
await forEachConcurrent(entries, 8, async ([name, expected]) => {
  try {
    const digest = sha256(await readFile(`${dist}/${name}`));
    if (digest !== expected.sha256) {
      rebuildProblems.push(
        `${name}: local ${digest.slice(0, 12)}… ≠ manifest ${expected.sha256.slice(0, 12)}…`,
      );
    }
  } catch {
    rebuildProblems.push(`${name}: missing from the local build`);
  }
});
if (rebuildProblems.length > 0) {
  console.error(`\nLOCAL BUILD ≠ MANIFEST (${rebuildProblems.length} of ${entries.length} files):`);
  for (const problem of rebuildProblems.toSorted()) {
    console.error(`  ${problem}`);
  }
  console.error(
    `A differing local build usually means a different commit — the manifest names ${shortCommit}.`,
  );
  process.exit(1);
}
console.log(
  `Local rebuild: all ${entries.length} files match — this deployment is a build of ${shortCommit}.`,
);
