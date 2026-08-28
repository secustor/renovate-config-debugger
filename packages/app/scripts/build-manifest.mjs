// Roadmap 088 — writes dist/build-manifest.json: the sha256 of every file the
// deployment serves, plus the build identity vite emitted to build-info.json.
// Also writes build-checksums.txt (next to dist, not in it): the same digests
// in sha256sum format, manifest included — CI's attestation input, so EVERY
// served file is an attested subject and `gh attestation verify` works on any
// downloaded asset, not only the manifest. Run after `pnpm build`.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const MANIFEST = "build-manifest.json";
// Edge/runtime-mutable files are deliberately not attested: the Docker
// entrypoint may overwrite rcd-config.js at container start, and Cloudflare's
// managed content signals rewrite robots.txt at the edge.
const EXCLUDED = new Set([MANIFEST, "rcd-config.js", "robots.txt"]);

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

const manifestBody = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(path.join(dist, MANIFEST), manifestBody);

// The attestation subjects: every served file plus the manifest itself.
// actions/attest caps one invocation at 1024 subjects — warn well before the
// main-only attest step starts failing.
const checksums = [
  ...paths.map((rel) => `${files[rel].sha256}  ${rel}`),
  `${createHash("sha256").update(manifestBody).digest("hex")}  ${MANIFEST}`,
];
if (checksums.length > 1000) {
  console.warn(`${checksums.length} subjects — actions/attest refuses more than 1024.`);
}
await writeFile(path.join(dist, "..", "build-checksums.txt"), `${checksums.join("\n")}\n`);
console.log(
  `${MANIFEST}: ${paths.length} files hashed for ${identity.commit.slice(0, 7)}; ` +
    `build-checksums.txt: ${checksums.length} attestation subjects`,
);
