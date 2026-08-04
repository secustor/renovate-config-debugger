#!/usr/bin/env node
/**
 * Roadmap 019 — share-link generator for persona-test scenarios.
 *
 * Produces a URL in the exact wire format `packages/app/src/share.ts` reads:
 *   payload {v:2, renovate, config, fileName, c} → JSON → UTF-8 →
 *   deflate-raw (CompressionStream) → base64url (no padding), placed after
 *   `#config=`. `c` is the 027 integrity tag (config checksum).
 *
 * The URL also carries a unique `?s=<id>` query param BEFORE the hash. This
 * is not read by the app — it exists so pasting the link into an
 * already-open tab is a full document navigation, not a hash-only jump. A
 * hash-only jump into a tab that already ran a previous scenario is exactly
 * the bug class fixed by roadmap 017 (`hashchange` handling); keeping this
 * workaround makes the generator robust regardless of which app build a
 * replay targets.
 *
 * No dependencies — Node's global CompressionStream/DecompressionStream
 * (stable since Node 21) do the deflate-raw work, same as the browser.
 *
 * Usage:
 *   node generate-links.mjs --config <path> --port <port> [options]
 *
 * <path> is either:
 *   - a plain JSON file (a renovate.json config), or
 *   - a scenario markdown file (scenarios/*.md) — the FIRST ```json fenced
 *     code block in the file is taken as the config.
 *
 * Options:
 *   --config, -c <path>   Required. Config JSON file or scenario .md file.
 *   --port, -p <port>     Required. Port `vite preview` is listening on.
 *   --renovate <version>  Renovate version to embed. Default: read from
 *                         packages/engine/package.json's pinned dependency.
 *   --filename <name>     "renovate.json" (default) or "renovate.json5".
 *   --base <path>         URL base path. Default "/".
 *   --unique <id>         Fixed value for the `?s=` param (default: random,
 *                         one per invocation — pass a fixed value for
 *                         reproducible test output).
 *   --list                List scenario files found under ./scenarios and
 *                         exit.
 *   --help, -h            Show this help and exit.
 *
 * Examples:
 *   node generate-links.mjs --list
 *   node generate-links.mjs -c scenarios/44958-category-grouping.md -p 4173
 *   node generate-links.mjs -c /tmp/my-config.json -p 4173 --renovate 43.275.0
 */

import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = path.join(SCRIPT_DIR, "scenarios");
// packages/engine/package.json relative to .claude/skills/persona-test/
const ENGINE_PKG_JSON = path.resolve(
  SCRIPT_DIR,
  "..",
  "..",
  "..",
  "packages",
  "engine",
  "package.json",
);

const HELP = `Usage: node generate-links.mjs --config <path> --port <port> [options]

<path> is a plain JSON renovate config file, or a scenario markdown file
(scenarios/*.md) — the first \`\`\`json fenced block is used as the config.

Options:
  --config, -c <path>   Required. Config JSON file or scenario .md file.
  --port, -p <port>     Required. Port \`vite preview\` is listening on.
  --renovate <version>  Renovate version to embed (default: read from
                         packages/engine/package.json).
  --filename <name>     "renovate.json" (default) or "renovate.json5".
  --base <path>         URL base path (default "/").
  --unique <id>         Fixed value for the ?s= cache-busting param
                         (default: random per invocation).
  --list                List scenario files under ./scenarios and exit.
  --help, -h            Show this help and exit.

Examples:
  node generate-links.mjs --list
  node generate-links.mjs -c scenarios/44958-category-grouping.md -p 4173
  node generate-links.mjs -c /tmp/my-config.json -p 4173 --renovate 43.275.0
`;

function parseArgs(argv) {
  const args = { filename: "renovate.json", base: "/" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--list":
        args.list = true;
        break;
      case "--config":
      case "-c":
        args.config = argv[++i];
        break;
      case "--port":
      case "-p":
        args.port = argv[++i];
        break;
      case "--renovate":
        args.renovate = argv[++i];
        break;
      case "--filename":
        args.filename = argv[++i];
        break;
      case "--base":
        args.base = argv[++i];
        break;
      case "--unique":
        args.unique = argv[++i];
        break;
      default:
        throw new Error(`Unknown argument: ${a} (--help for usage)`);
    }
  }
  return args;
}

async function listScenarios() {
  const entries = await readdir(SCENARIOS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "README.md")
    .map((e) => path.join(SCENARIOS_DIR, e.name))
    .toSorted();
}

/** Extracts the config: raw JSON file, or the first ```json fenced block in a .md file. */
async function loadConfig(configPath) {
  const raw = await readFile(configPath, "utf8");
  if (configPath.endsWith(".md")) {
    const match = raw.match(/```json\n([\s\S]*?)\n```/);
    if (!match) {
      throw new Error(`No \`\`\`json fenced block found in ${configPath}`);
    }
    const config = match[1];
    JSON.parse(config); // validate — throws with a useful message on malformed JSON
    return config;
  }
  JSON.parse(raw);
  return raw;
}

async function resolveRenovateVersion(explicit) {
  if (explicit) {
    return explicit;
  }
  // The app embeds renovate/package.json's own `version` in every share link
  // (engine src/version.ts), so read that same file. `renovate` is a dependency
  // of the engine package, hence resolution anchored at its package.json.
  try {
    const pkgPath = createRequire(ENGINE_PKG_JSON).resolve("renovate/package.json");
    const { version } = JSON.parse(await readFile(pkgPath, "utf8"));
    if (typeof version === "string" && version.length > 0) {
      return version;
    }
  } catch {
    // not installed (no `pnpm install` yet) — fall back to the exact pin below
  }
  const pkg = JSON.parse(await readFile(ENGINE_PKG_JSON, "utf8"));
  const pinned = pkg.dependencies?.renovate;
  if (typeof pinned !== "string" || pinned.length === 0) {
    throw new Error(`no renovate dependency declared in ${ENGINE_PKG_JSON}`);
  }
  return pinned.replace(/^[\^~]/, "");
}

async function deflateRaw(bytes) {
  const stream = new CompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  const chunks = [];
  for await (const chunk of stream.readable) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function inflateRaw(bytes) {
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  const chunks = [];
  for await (const chunk of stream.readable) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function bytesToBase64url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Roadmap 027 integrity tag — must stay byte-for-byte identical to
 *  `configChecksum` in packages/app/src/share.ts (32-bit FNV-1a, base36). */
function configChecksum(config) {
  let h = 0x811c9dc5;
  for (let i = 0; i < config.length; i++) {
    h ^= config.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function base64urlToBytes(token) {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

function randomId() {
  return Math.random().toString(36).slice(2, 8);
}

/** Builds the share token for a payload — same shape encodeShare() in share.ts produces. */
async function encodeToken(payload) {
  const json = JSON.stringify(payload);
  const compressed = await deflateRaw(new TextEncoder().encode(json));
  return bytesToBase64url(compressed);
}

/** Round-trips a token back to a payload, for self-verification. */
async function decodeToken(token) {
  const bytes = base64urlToBytes(token);
  const json = new TextDecoder().decode(await inflateRaw(bytes));
  return JSON.parse(json);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  if (args.list) {
    const files = await listScenarios();
    for (const f of files) {
      process.stdout.write(`${path.relative(process.cwd(), f)}\n`);
    }
    return;
  }

  if (!args.config || !args.port) {
    process.stderr.write("error: --config and --port are required (--help for usage)\n");
    process.exitCode = 1;
    return;
  }

  if (args.filename !== "renovate.json" && args.filename !== "renovate.json5") {
    process.stderr.write('error: --filename must be "renovate.json" or "renovate.json5"\n');
    process.exitCode = 1;
    return;
  }

  const config = await loadConfig(path.resolve(process.cwd(), args.config));
  const renovate = await resolveRenovateVersion(args.renovate);
  // Roadmap 027: additive integrity tag (`c`) so the app can flag a link that
  // arrived truncated/corrupted. Stays v2 — old decoders ignore the extra key.
  const payload = { v: 2, renovate, config, fileName: args.filename, c: configChecksum(config) };

  const token = await encodeToken(payload);

  // Self-verify: inflate the token back and confirm it round-trips before
  // printing anything a caller might paste into a browser.
  const decoded = await decodeToken(token);
  if (
    decoded.config !== config ||
    decoded.v !== 2 ||
    decoded.renovate !== renovate ||
    decoded.c !== configChecksum(config)
  ) {
    process.stderr.write(
      "error: token failed round-trip verification — refusing to print a broken link\n",
    );
    process.exitCode = 1;
    return;
  }

  const unique = args.unique ?? randomId();
  const base = args.base.endsWith("/") ? args.base : `${args.base}/`;
  const url = `http://localhost:${args.port}${base}?s=${unique}#config=${token}`;

  process.stderr.write(
    `verified: token round-trips (${config.length}-char config, renovate ${renovate})\n`,
  );
  process.stdout.write(`${url}\n`);
}

main().catch((err) => {
  process.stderr.write(`error: ${err.message}\n`);
  process.exitCode = 1;
});
