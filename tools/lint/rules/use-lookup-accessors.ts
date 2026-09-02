import { defineRule } from "@oxlint/plugins";

/**
 * The second rule of the set that guards a defect that SHIPPED, and the only
 * one whose defect was security-shaped.
 *
 * `resolveEffectivePlatformContext` read `PLATFORM_ENDPOINTS[platform]` with a
 * `platform` taken straight out of a share-link fragment (sweep IV, finding 69,
 * `lib/share.ts:440`). A plain object literal inherits `Object.prototype`, so a
 * link carrying `platform=constructor` did not miss the table — it resolved to
 * `Object.prototype.constructor` and handed a FUNCTION back as the endpoint.
 * `toString` and `valueOf` are the same hole. 75684991 built the two own-key
 * accessors — `defaultEndpointFor` (`data/platform-endpoints.ts`) and
 * `platformForHost` (`data/host-tokens.ts`) — and converted ten computed
 * accesses across five files onto them. Nine were harmless; the tenth was the
 * defect, and it was invisible in review precisely because it looked like the
 * other nine.
 *
 * Sweep V found the same class twice more, in the tree the rule did not cover:
 * `shims/presets/local.ts:41` dispatched on `resolvers[platform]` with the
 * platform out of `GlobalConfig`, where `Object.prototype.constructor` is
 * TRUTHY and `.getPresetFromEndpoint` is not a function; `extract.ts:352`
 * looked up `managerExtractors[manager]` with a manager out of
 * `rcd extract --manager` / MCP `extract_deps`, so the `undefined`
 * fall-through below it could never fire for `constructor`. 40d7e954 fixed
 * both by hand-spelling the guard, which made five hand-spelled copies in
 * three packages.
 *
 * SO THE HOME MOVED, the way `rules.ts` asks: `ownValue(table, key)` in
 * `packages/engine/src/is.ts` — the import-free module the app and the CLI
 * already reach as `@renovate-config-debugger/engine/is`, the same route
 * `prefer-is-helpers` uses. All five copies collapse onto it, the two app
 * accessors keep their domain names with a one-call body, and the rule reaches
 * the engine because its answer now does.
 *
 * Arm (a): an import, not a ban. The message names the accessor AND the hazard,
 * because `HOST_PLATFORM[parsed.host]` on a host the user TYPES is the natural
 * thing to write and will be written again.
 *
 * WHY THE SHAPE IS THIS NARROW. A COMPUTED access with a non-literal key is the
 * whole match. A string-literal key (`PLATFORM_ENDPOINTS["gitea"]`) is provably
 * an own key of a table written in the same file, and a dotted
 * `PLATFORM_ENDPOINTS.github` is not a computed access at all — neither can
 * reach a prototype member, so neither is reported. Nor is anything that is not
 * a member expression on the bare table identifier: `lib/trusted-endpoint.ts`
 * iterates `Object.values(PLATFORM_ENDPOINTS)`, which is out of shape
 * structurally rather than by exception. All four tables are module-level
 * `const` maps that nothing in scope assigns into, so every computed access the
 * rule sees is a read.
 *
 * TABLE-DRIVEN ON PURPOSE. A third lookup table with an own-key accessor is one
 * entry in `TABLES`, which is what keeps this from being a rule about one
 * symbol — the same shape as `use-rule-ref`, `use-truncate` and
 * `use-goto-app-helper`, each of which is about one named home.
 *
 * WHY `PLATFORM_ENDPOINTS` NAMES THE SHARED HELPER AND `HOST_PLATFORM` DOES
 * NOT. `PLATFORM_ENDPOINTS` is declared TWICE — in the engine
 * (`shims/presets/host-transport.ts:38`) and in the app
 * (`data/platform-endpoints.ts`) — and this rule has no cross-file knowledge,
 * so naming the app-only `defaultEndpointFor` would be wrong advice inside the
 * engine. `ownValue` is right in both, and each file's own accessor is still
 * there for the callers that want the domain name. `HOST_PLATFORM` is app-only
 * (it occurs in `data/host-tokens.ts` and nowhere else), so it keeps
 * `platformForHost`, the narrower answer.
 *
 * DELIBERATELY OUT OF SCOPE, so nobody re-derives it:
 * - `packages/engine/src/shims/repo-config.ts` is the rule's ONE path
 *   exemption. `:207` and `:245` index a `Record<HostPlatform, string>` with a
 *   `platform: RepoPlatform` union — total by construction, and behind a
 *   `req.endpoint || …` where a `string | undefined` would not typecheck.
 * - The `in` operator has the same prototype hole and is NOT matched:
 *   `manager in managerExtractors` at `extract.ts:194` and `:334` both test
 *   keys this engine produced itself, so an `in` arm would be two false
 *   positives for no gain.
 * - `is.ts` itself needs no exemption — `ownValue` indexes a parameter named
 *   `table`, which is not a registered table name.
 * - `resolvers` is the one table name generic enough to collide: it also names
 *   a local array in `tools/lint/rules/comment-cites-what-exists.ts`, which no
 *   enabled glob covers. A collision inside an enabled `src`
 *   tree would be a false positive, and the answer is to rename the table.
 * A hand-spelled `Object.hasOwn(T, k) ? T[k] : undefined` IS still reported,
 * on shape: that is the point now, since `ownValue` is where it goes. The rule
 * does not try to recognise the guarded shape — the guard and the read need not
 * be adjacent — which is why `repo-config.ts` is exempted by PATH.
 */

/** Where `ownValue` lives, spelled as the app and the CLI import it. */
const IS_HELPERS = "@renovate-config-debugger/engine/is";

/** Lookup tables whose keys can be user-supplied, and the own-key accessor that
 *  owns each. The accessor carries its CALL SHAPE, not just its name: the shared
 *  `ownValue` takes the table too, the domain accessors do not, and a reader who
 *  hits this message should not have to open `is.ts` to learn the arity. One
 *  entry per table; the enabled trees are in `.oxlintrc.json`. */
const TABLES = new Map<string, { accessor: string; from: string }>([
  ["PLATFORM_ENDPOINTS", { accessor: "ownValue(table, key)", from: IS_HELPERS }],
  ["HOST_PLATFORM", { accessor: "platformForHost(key)", from: "@/data/host-tokens" }],
  ["resolvers", { accessor: "ownValue(table, key)", from: IS_HELPERS }],
  ["managerExtractors", { accessor: "ownValue(table, key)", from: IS_HELPERS }],
]);

export default defineRule({
  meta: {
    type: "suggestion",
    messages: {
      useLookupAccessor:
        "Read `{{table}}` through `{{accessor}}` from `{{from}}`: an unvalidated key with no own-key guard resolves `constructor`, `toString` and `valueOf` to Object.prototype members, so the table answers a function where it should answer `undefined`.",
    },
  },
  createOnce(context) {
    return {
      // `PLATFORM_ENDPOINTS[platform]` — computed, on the bare table, with a
      // key that is not a string literal.
      MemberExpression(node) {
        if (!node.computed || node.object.type !== "Identifier") {
          return;
        }
        const table = TABLES.get(node.object.name);
        if (!table) {
          return;
        }
        const key = node.property;
        if (key.type === "Literal" && typeof key.value === "string") {
          return;
        }
        context.report({
          node,
          messageId: "useLookupAccessor",
          data: { table: node.object.name, accessor: table.accessor, from: table.from },
        });
      },
    };
  },
});
