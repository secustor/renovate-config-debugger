import { ruleTester } from "../rule-tester.ts";
import rule from "./use-lookup-accessors.ts";

ruleTester.run("use-lookup-accessors", rule, {
  valid: [
    // ---- using the accessors is the point -----------------------------------
    `import { defaultEndpointFor } from "@/data/platform-endpoints";`,
    'const endpoint = defaultEndpointFor(platform) ?? "";',
    "const known = parsed.host ? platformForHost(parsed.host) : undefined;",

    // ---- a string-literal key is provably an own key ------------------------
    // the table is written in the same file, so `"gitea"` cannot reach a
    // prototype member — no guard buys anything here
    `const gitea = PLATFORM_ENDPOINTS["gitea"];`,
    `const github = PLATFORM_ENDPOINTS["github"] || "";`,
    `const platform = HOST_PLATFORM["github.com"];`,

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

    // ---- the accessor bodies themselves ------------------------------------
    // reported on shape, exempted BY PATH in `.oxlintrc.json`: the guard and the
    // read need not be adjacent, so an AST rule must not try to recognise one
    {
      code: "function defaultEndpointFor(platform: string) { return Object.hasOwn(PLATFORM_ENDPOINTS, platform) ? PLATFORM_ENDPOINTS[platform] : undefined; }",
      errors: [{ messageId: "useLookupAccessor" }],
    },
    {
      code: "function platformForHost(host: string) { return Object.hasOwn(HOST_PLATFORM, host) ? HOST_PLATFORM[host] : undefined; }",
      errors: [{ messageId: "useLookupAccessor" }],
    },
  ],
});
