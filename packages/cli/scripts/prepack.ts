#!/usr/bin/env node
/**
 * Everything `files` promises, guaranteed by the package itself.
 *
 * `package.json` declares `AGPL-3.0-only` and lists `LICENSE` and `dist` — but
 * the license text lives at the repo root (one copy, not one per package) and
 * `dist/` is a build output, so neither exists in a checkout. Leaving both to
 * the publish workflow means any other route to a tarball (`pnpm publish` by
 * hand, `pnpm pack` to inspect what ships) uploads a package that states a
 * license it does not carry, or a bin with nothing to dispatch to.
 *
 * `prepack` is the hook npm and pnpm run for BOTH `pack` and `publish`, so the
 * guarantee travels with the package rather than with one workflow file.
 *
 * Plain Node, no dependencies: like `check-compat.ts`, it may run before
 * anything is built.
 */
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

// The bin refuses to run without it, so packing without it ships a package
// whose only entry point is an error message.
if (!existsSync(path("../dist/main.js"))) {
  throw new Error(
    "packages/cli: dist/main.js is missing — run `pnpm --filter @renovate-config-debugger/cli build` before packing.",
  );
}

copyFileSync(path("../../../LICENSE"), path("../LICENSE"));

process.stdout.write("prepack ok: dist/main.js present, LICENSE copied in\n");
