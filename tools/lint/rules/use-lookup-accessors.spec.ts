import { ruleTester } from "../rule-tester.ts";
import rule from "./use-lookup-accessors.ts";

ruleTester.run("use-lookup-accessors", rule, {
  valid: [
    // ---- using the accessors is the point -----------------------------------
    `import { defaultEndpointFor } from "@/data/platform-endpoints";`,
    'const endpoint = defaultEndpointFor(platform) ?? "";',
    "const known = parsed.host ? platformForHost(parsed.host) : undefined;",

    // ---- the shared home the five hand-spelled guards became ----------------
    // `ownValue(table, key)` passes the table as an ARGUMENT, so no computed
    // member expression is left for the visitor to see
    `import { ownValue } from "@renovate-config-debugger/engine/is";`,
    "const resolver = ownValue(resolvers, platform);",
    "const loadExtractor = ownValue(managerExtractors, manager);",
    "export function defaultEndpointFor(platform: string) { return ownValue(PLATFORM_ENDPOINTS, platform); }",
    "export function platformForHost(host: string) { return ownValue(HOST_PLATFORM, host); }",
    // `is.ts`'s own body needs no exemption: the parameter is not a table name
    "export function ownValue<T>(table: Readonly<Record<string, T>>, key: string) { return Object.hasOwn(table, key) ? table[key] : undefined; }",

    // ---- the `in` operator is deliberately NOT matched ----------------------
    // `extract.ts:194`/`:334` test keys the engine produced itself, so an `in`
    // arm would be two false positives for no gain
    "if (!(manager in managerExtractors)) { return unsupported(manager); }",
    "const manager = matched().find((m) => m in managerExtractors);",

    // ---- a string-literal key is provably an own key ------------------------
    // the table is written in the same file, so `"gitea"` cannot reach a
    // prototype member — no guard buys anything here
    `const gitea = PLATFORM_ENDPOINTS["gitea"];`,
    `const github = PLATFORM_ENDPOINTS["github"] || "";`,
    `const platform = HOST_PLATFORM["github.com"];`,
    `const resolver = resolvers["github"];`,
    `const load = managerExtractors["npm"];`,

    // ---- a dotted access is not computed and never reaches the visitor ------
    "export const Endpoint = PLATFORM_ENDPOINTS.github;",
    "const endpoint = PLATFORM_ENDPOINTS.forgejo;",

    // ---- not a member expression on the table at all ------------------------
    // `lib/trusted-endpoint.ts:40`, the one app site that touches the table
    // outside its home file — out of shape structurally, not by exception
    "for (const endpoint of Object.values(PLATFORM_ENDPOINTS)) { trust(endpoint); }",
    "export const PLATFORMS = Object.keys(PLATFORM_ENDPOINTS);",
    "const entries = Object.entries(HOST_PLATFORM);",
    "const present = Object.hasOwn(PLATFORM_ENDPOINTS, platform);",
    "const table = PLATFORM_ENDPOINTS;",
    // `extract.ts:72` — the key list, not a read
    "export const EXTRACTABLE_MANAGERS = Object.keys(managerExtractors);",
    "const platforms = Object.keys(resolvers);",

    // ---- a table this rule does not own ------------------------------------
    "const endpoint = ENDPOINTS[platform];",
    "const value = record[key];",
    "const descriptor = HOST_TOKENS[index];",

    // ---- the object must be the bare identifier -----------------------------
    // a same-named property of something else is a different binding, and the
    // rule does no scope analysis, so it deliberately claims only the bare name
    "const endpoint = data.PLATFORM_ENDPOINTS[platform];",
    "const endpoint = mod.HOST_PLATFORM[host];",
  ],
  invalid: [
    // ---- THE DEFECT THAT SHIPPED -------------------------------------------
    // `lib/share.ts:440` before 75684991: `platform` comes out of the share-link
    // fragment, so `platform=constructor` returned a FUNCTION as the endpoint
    {
      code: `const endpoint =
  (overridden ? (explicitEndpoint ?? globalEndpoint) : (globalEndpoint ?? explicitEndpoint)) ??
  PLATFORM_ENDPOINTS[platform] ??
  "";`,
      errors: [{ messageId: "useLookupAccessor" }],
    },

    // ---- THE TWO DEFECTS THIS WIDENING IS FOR ------------------------------
    // `shims/presets/local.ts:41` before 40d7e954: `platform` comes out of
    // `GlobalConfig`, and `Object.prototype.constructor` is TRUTHY, so the
    // truthy branch called `.getPresetFromEndpoint` on a FUNCTION
    {
      code: "const resolver = resolvers[platform];",
      errors: [
        {
          messageId: "useLookupAccessor",
          data: {
            table: "resolvers",
            accessor: "ownValue(table, key)",
            from: "@renovate-config-debugger/engine/is",
          },
        },
      ],
    },
    // `extract.ts:352` before the same commit: `manager` arrives from
    // `rcd extract --manager` and MCP `extract_deps.manager`, so the
    // `loadExtractor === undefined` fall-through could never fire for a
    // prototype key
    {
      code: "const loadExtractor = managerExtractors[manager];",
      errors: [
        {
          messageId: "useLookupAccessor",
          data: {
            table: "managerExtractors",
            accessor: "ownValue(table, key)",
            from: "@renovate-config-debugger/engine/is",
          },
        },
      ],
    },
    // the endpoint table names the SHARED helper: the name is declared in both
    // packages, so `defaultEndpointFor` would be wrong advice inside the engine
    {
      code: "const endpoint = PLATFORM_ENDPOINTS[platform];",
      errors: [
        {
          messageId: "useLookupAccessor",
          data: {
            table: "PLATFORM_ENDPOINTS",
            accessor: "ownValue(table, key)",
            from: "@renovate-config-debugger/engine/is",
          },
        },
      ],
    },
    // …and the app-only table keeps its narrower domain name — and its own
    // ARITY: the message carries each accessor's call shape, so a reader does
    // not have to open `is.ts` to find out that one takes the table and the
    // other does not.
    {
      code: "const platform = HOST_PLATFORM[parsed.host];",
      errors: [
        {
          messageId: "useLookupAccessor",
          data: {
            table: "HOST_PLATFORM",
            accessor: "platformForHost(key)",
            from: "@/data/host-tokens",
          },
        },
      ],
    },

    // ---- the nine siblings converted by the same commit ---------------------
    // app/use-platform-context.ts
    {
      code: 'const shown = overridden ? (PLATFORM_ENDPOINTS[globalPlatform] ?? "") : "";',
      errors: [{ messageId: "useLookupAccessor" }],
    },
    {
      code: 'const next = PLATFORM_ENDPOINTS[value] ?? "";',
      errors: [{ messageId: "useLookupAccessor" }],
    },
    // app/use-repo-load.ts — a host the user TYPES
    {
      code: "const knownHost = parsed.host ? HOST_PLATFORM[parsed.host] : undefined;",
      errors: [{ messageId: "useLookupAccessor" }],
    },
    {
      code: 'repoEndpoint = PLATFORM_ENDPOINTS[knownHost] ?? "";',
      errors: [{ messageId: "useLookupAccessor" }],
    },
    // features/editor/HostAccessSection.tsx — in a boolean position, where the
    // prototype hit reads as "this platform IS fetched in the browser"
    {
      code: "const local = usesLocal && !PLATFORM_ENDPOINTS[displayPlatform];",
      errors: [{ messageId: "useLookupAccessor" }],
    },
    {
      code: 'const placeholder = PLATFORM_ENDPOINTS[displayPlatform] || "not fetched in the browser";',
      errors: [{ messageId: "useLookupAccessor" }],
    },
    // lib/trusted-endpoint.ts's former default check
    {
      code: 'const isDefault = endpoint === "" || endpoint === PLATFORM_ENDPOINTS[platform];',
      errors: [{ messageId: "useLookupAccessor" }],
    },
    {
      code: 'const effective = input.endpoint || PLATFORM_ENDPOINTS[input.platform] || "";',
      errors: [{ messageId: "useLookupAccessor" }],
    },
    // hooks/use-host-tokens.ts
    {
      code: "const platform = HOST_PLATFORM[host];",
      errors: [{ messageId: "useLookupAccessor" }],
    },

    // ---- other non-literal key shapes --------------------------------------
    // a nullish default does not make the key an own key
    {
      code: 'const endpoint = PLATFORM_ENDPOINTS[globalPlatform ?? ""];',
      errors: [{ messageId: "useLookupAccessor" }],
    },
    // a template literal is not a `Literal`, and its expressions are unvalidated
    {
      code: "const endpoint = PLATFORM_ENDPOINTS[`${platform}`];",
      errors: [{ messageId: "useLookupAccessor" }],
    },
    // an optional chain is the same read
    {
      code: "const endpoint = PLATFORM_ENDPOINTS?.[platform];",
      errors: [{ messageId: "useLookupAccessor" }],
    },

    // ---- both tables in one module -----------------------------------------
    {
      code: `const platform = HOST_PLATFORM[host];
const endpoint = PLATFORM_ENDPOINTS[platform];`,
      errors: [{ messageId: "useLookupAccessor" }, { messageId: "useLookupAccessor" }],
    },

    // ---- the hand-spelled guard is still reported, which is now the point ---
    // all five of these were live; each is one `ownValue` call after this
    // landing. The rule does NOT try to recognise the guarded shape — the guard
    // and the read need not be adjacent — so a site that must keep it is
    // exempted by PATH, and exactly one does.
    {
      code: "function defaultEndpointFor(platform: string) { return Object.hasOwn(PLATFORM_ENDPOINTS, platform) ? PLATFORM_ENDPOINTS[platform] : undefined; }",
      errors: [{ messageId: "useLookupAccessor" }],
    },
    {
      code: "function platformForHost(host: string) { return Object.hasOwn(HOST_PLATFORM, host) ? HOST_PLATFORM[host] : undefined; }",
      errors: [{ messageId: "useLookupAccessor" }],
    },
    {
      code: "const resolver = Object.hasOwn(resolvers, platform) ? resolvers[platform] : undefined;",
      errors: [{ messageId: "useLookupAccessor" }],
    },
    {
      code: `const loadExtractor = Object.hasOwn(managerExtractors, manager)
  ? managerExtractors[manager]
  : undefined;`,
      errors: [{ messageId: "useLookupAccessor" }],
    },
    // the engine's twin carried a cast the shared helper makes unnecessary
    {
      code: `function defaultEndpointFor(platform: string): string | undefined {
  return Object.hasOwn(PLATFORM_ENDPOINTS, platform)
    ? PLATFORM_ENDPOINTS[platform as HostPlatform]
    : undefined;
}`,
      errors: [{ messageId: "useLookupAccessor" }],
    },

    // ---- the one path exemption, reported here on shape ---------------------
    // `shims/repo-config.ts:207`/`:245`: a `RepoPlatform` union key on a
    // `Record<HostPlatform, string>` is total by construction, and the `||` arm
    // would not typecheck against a `string | undefined`
    {
      code: "const endpoint = withTrailingSlash(req.endpoint || PLATFORM_ENDPOINTS[platform]);",
      errors: [{ messageId: "useLookupAccessor" }],
    },
  ],
});
