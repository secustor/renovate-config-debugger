// Roadmap 088 — writes dist/build-manifest.json: the sha256 of every file the
// deployment serves, plus the build identity vite emitted to build-info.json.
// CI attests THIS file (attest-build-provenance), so verifying the manifest's
// signature and then the served files against it proves the deployment is
// CI's build of the named commit. Run after `pnpm build`.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const MANIFEST = "build-manifest.json";
// rcd-config.js is runtime deployment config — the Docker entrypoint may
// overwrite it at container start — so it is deliberately not attested.
const EXCLUDED = new Set([MANIFEST, "rcd-config.js"]);

const dist = fileURLToPath(new URL("../dist", import.meta.url));

let identity;
try {
  identity = JSON.parse(await readFile(path.join(dist, "build-info.json"), "utf8"));
} catch {
  console.error("dist/build-info.json missing — run `pnpm build` first (it emits the identity).");
  process.exit(1);
}
if (!identity.commit) {
  console.error("build-info.json has no commit (built without git?) — nothing to attest.");
  process.exit(1);
}

function branch() {
  if (process.env.GITHUB_REF_NAME) {
    return process.env.GITHUB_REF_NAME;
  }
  try {
    return execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

const entries = await readdir(dist, { recursive: true, withFileTypes: true });
const paths = entries
  .filter((entry) => entry.isFile())
  .map((entry) =>
    path.relative(dist, path.join(entry.parentPath, entry.name)).replaceAll(path.sep, "/"),
  )
  .filter((rel) => !EXCLUDED.has(rel))
  .toSorted();

const files = {};
for (const rel of paths) {
  const body = await readFile(path.join(dist, rel));
  files[rel] = { sha256: createHash("sha256").update(body).digest("hex"), bytes: body.byteLength };
}

const manifest = {
  schemaVersion: 1,
  repo: identity.repo,
  commit: identity.commit,
  version: identity.version,
  commitTime: identity.commitTime,
  // Informational only — everything above is commit-derived (reproducible),
  // the branch is whatever ref the building checkout happened to be on.
  branch: branch(),
  files,
};

await writeFile(path.join(dist, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${MANIFEST}: ${paths.length} files hashed for ${identity.commit.slice(0, 7)}`);
