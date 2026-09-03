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
 * structurally rather than by exception. Both tables are module-level `const`
 * maps that nothing in scope assigns into, so every computed access the rule
 * sees is a read.
 *
 * TABLE-DRIVEN ON PURPOSE. A third lookup table with an own-key accessor is one
 * entry in `TABLES`, which is what keeps this from being a rule about one
 * symbol — the same shape as `use-rule-ref`, `use-truncate` and
 * `use-goto-app-helper`, each of which is about one named home.
 *
 * DELIBERATELY OUT OF SCOPE, so nobody re-derives it: the rule is enabled on
 * `packages/app/src/**` only. `engine/src/shims/repo-config.ts:207` and `:245`
 * index a `Record<HostPlatform, string>` with a `platform: RepoPlatform` union —
 * total by construction, and behind a `||` fallback — and
 * `engine/src/shims/presets/host-transport.ts:55` is the engine's OWN guarded
 * accessor, the twin the app's two were modelled on. Those three are the rule's
 * only false positives on the whole tree, and app-only scoping removes all three
 * structurally (the `comment-cites-what-exists` excludes-`tools/**` precedent).
 * The two app accessor bodies ARE the guarded access and take the standard
 * one-file `"off"` override in `.oxlintrc.json` — by path, not by shape: a
 * `Object.hasOwn(T, k) ? T[k] : undefined` arm is not something an AST rule
 * should try to recognise, since the guard and the read need not be adjacent.
 */

/** Lookup tables whose keys can be user-supplied, and the own-key accessor that
 *  owns each. One entry per table; the app-only scoping is in `.oxlintrc.json`. */
const TABLES = new Map<string, { accessor: string; from: string }>([
  ["PLATFORM_ENDPOINTS", { accessor: "defaultEndpointFor", from: "@/data/platform-endpoints" }],
  ["HOST_PLATFORM", { accessor: "platformForHost", from: "@/data/host-tokens" }],
]);

export default defineRule({
  meta: {
    type: "suggestion",
    messages: {
      useLookupAccessor:
        "Read `{{table}}` through `{{accessor}}(key)` from `{{from}}`: an unvalidated key with no own-key guard resolves `constructor`, `toString` and `valueOf` to Object.prototype members, so the table answers a function where it should answer `undefined`.",
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
