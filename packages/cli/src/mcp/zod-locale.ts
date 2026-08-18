import { config } from "zod";
import { en } from "zod/locales";

/**
 * Re-installs zod's English locale, which the PUBLISHED bundle otherwise ships
 * without.
 *
 * zod installs it as a top-level side effect (`config(en())` in
 * `zod/v4/classic/external.js`), but its `package.json` declares
 * `"sideEffects": false` — so rolldown, building this package with
 * `ssr.noExternal: true` (`vite.config.ts`), is entitled to drop that call and
 * does. Without a locale, `finalizeIssue` falls through `config.localeError`
 * to the literal fallback, and every validation error the MCP server reports
 * degrades to a bare `Invalid input`: no typo'd key named, no enum members
 * listed, no expected type. That voids the promise the tool descriptions make
 * — that a rejection tells the model what to fix.
 *
 * Nothing catches this in-process: `src/` runs zod unbundled, locale intact.
 * `test/bundle/mcp-messages.test.ts` spawns the built bin and asserts the real
 * messages, which is the only regime where the loss is visible.
 */
export function installZodLocale(): void {
  config(en());
}
