# 030 — Input validation at every boundary (zod/mini)

Milestone: M8 · Status: done

> Implemented as specified. A single new module, `packages/app/src/
input-schemas.ts`, holds every schema and typed parse helper, built
> exclusively on `zod/mini` (the `zod` package's tree-shakeable functional
> build — every import in the app is `from "zod/mini"`, never the full `zod`
> entry point). Three things live there: (1) schemas for the share payload's
> security-relevant fields (`platform`/`endpoint`/`globalConfig`/
> `inheritedConfig`/`platformOverride`), storage reads (platform/endpoint/
> per-host tokens/the OAuth stored user), OAuth callback params and the
> Worker's token-exchange response, and repo-load ref parts; (2) a shared
> deep pollution guard, `findPollutedPath`/`isPolluted`, recursing through
> object AND array nesting (so `packageRules[n].__proto__` is caught) for own
> `__proto__`/`constructor`/`prototype` keys; (3) the http(s)-only URL rule
> (`isHttpUrl`/`endpointSchema` — deliberately not zod's built-in `httpUrl()`
> format, which also demands a dotted hostname and would reject the
> localhost/bare-IP self-hosted endpoints 010 supports) and the token rule
> (`isValidToken`/`tokenSchema`: no control characters, incl. CR/LF/NUL, and a
> 4096-char cap). **The pollution guard's placement is the load-bearing
> detail**: it is verified (input-schemas.test.ts's "zod's object/record
> parsing silently drops an own `__proto__` key" case) that zod's own object/
> record parsing quietly strips an own `"__proto__"` property while copying
> recognized fields onto its output — it never uses the `target[key] = value`
> assignment form that would trip the accessor's setter, so nothing is
> actually polluted, but the key is simply gone by the time any `.check()`/
> `.refine()` could see it. A guard placed after a zod `.parse()` call would
> therefore never fire. Every call site in this codebase runs it on the value
> straight out of `JSON.parse` instead — `configObjectSchema` wraps `z.
unknown()` (which performs no copy) with a refine, so nesting it inside a
> larger object schema still sees the untouched raw value.
>
> Wiring: `share.ts`'s `decodeShareResult` now runs
> `sharePayloadStrictFieldsSchema` (platform/endpoint/the two config layers/
> platformOverride) as a unit AFTER the existing 027 envelope/checksum gates —
> a failure there classifies as "damaged" (the version is already known-good
> at that point, so it's transit/tamper damage, not a future-version
> payload), directly reusing 027's banner plumbing with no new error
> vocabulary. `view`/`sim` are deliberately NOT part of that hard-fail schema:
> `sanitizeShareView`/`sanitizeShareSim` validate each field independently and
> drop only the malformed one, preserving 028's forward-compatible tolerance
> for an unrecognized `tab` (a hand-edited link, or a future version's new tab
> id) and extending the same treatment to `stage`/`node`/`step`, which
> previously reached React state completely unchecked. `fileName` keeps its
> pre-existing lenient normalize-not-reject ternary (no security
> implication). App.tsx's `parseLayerText` is now `parseLayerJson` from the
> schemas module — same "must be a JSON object" message and native
> `JSON.parse` error text preserved verbatim, now also pollution-checked.
> `readLocal`/`readSession` take a validator predicate and silently fall back
> to the default (removing the bad stored value) on failure; `onEndpointChange`/
> `makeTokenHandler` skip persisting an invalid value while still updating the
> live field, with inline `layer-editor-error`-styled messages for a bad
> endpoint or token; `blockedByLayerErrors` gained an endpoint case so Run is
> blocked (not silently attempted) on a bad manually-typed endpoint.
> `onLoadRepo`'s parsed host/repo/ref are bounds/control-character checked
> before `loadRepoConfig`. `PresetTree.tsx`'s injection `submit()` runs
> `findPollutedPath` on the engine's `parseInjectedPreset` output before
> calling `onInject` (verified: JSON5's parser has the same safe own-property
> behavior as `JSON.parse`, so the guard sees a real `__proto__` key when one
> is present) — the engine package itself stays untouched. `oauth.ts`
> validates the callback's `code`/`state`, the Worker's token-exchange
> response (an out-of-shape `access_token` is treated as no token at all,
> failing the same "Token exchange failed" path), the GitHub user API
> response's `avatar_url` (dropped if not http(s), login kept), and the
> stored user read back from `sessionStorage` (invalid JSON or a non-string
> `login` removes the stored value and returns null, exactly like every other
> storage read). `run.ts`'s `ensureAuth` re-validates each per-host PAT with
> `isValidToken` immediately before it reaches `engine.setPresetAuth` — the
> actual use-time boundary, checked again rather than trusted transitively
> from the write side. A latent bug surfaced by finally having unit coverage
> on `decodeShareResult`: `pipeThrough`'s unawaited `writer.write`/
> `writer.close()` promises could reject unhandled when a corrupt/truncated
> stream errored; both now carry a `.catch(() => {})` (the real failure is
> already surfaced through the awaited readable side).
>
> Tests: 122 new/updated vitest cases across `input-schemas.test.ts` (74) and
> a new `share.test.ts` (24, share.ts had zero prior unit coverage) plus the
> pre-existing `run-digest.test.ts` (24) — adversarial cases for `__proto__`
> at several depths (including inside a share payload's `globalConfig.
packageRules[n]`), `constructor`/`prototype` keys, `javascript:`/`data:`
> endpoints, CR-LF/NUL tokens, wrong-typed `view`/`sim` fields, tampered
> OAuth-user storage JSON, and the pollution-guard-ordering proof. Two new
> e2e cases in `10-share-diagnostics.spec.ts` (a polluted `globalConfig` and a
> `javascript:` endpoint both surface the damaged banner), built via a new
> `encodeRawShareToken` fixture helper (a raw-JSON-text encoder, since a
> `__proto__`-keyed payload can't be expressed as a JS object literal without
> tripping the same special-cased-prototype-setter gotcha the guard itself
> exists to catch). Bundle: `zod/mini`'s own tree-shaken contribution,
> measured by bundling `input-schemas.ts` standalone, is ~6.8 kB gzip — under
> the ~10 kB budget. The production build's main entry chunk actually
> _shrank_ (~454.7 kB → ~414.0 kB gzip); Vite/rolldown's automatic chunk-
> splitting heuristic reacted to the changed module graph by splitting ~54 kB
> gzip of pre-existing (non-zod) code out into four new eagerly
> `modulepreload`-ed chunks, for a net "everything fetched on initial load"
> delta of roughly +13.8 kB gzip — a chunking side effect of the new shared
> module's import graph, not zod/mini code growth (confirmed by grepping the
> built output for a zod-specific marker, which appears only in the main
> chunk). Flagged here rather than silently accepted; no `manualChunks`
> config was added to counteract it, to keep this a validation change, not a
> build-config change.

## Summary

Every input the app consumes is currently shape-checked ad hoc, or not at
all: the share-link decoder validates its envelope (027) but trusts the
decoded payload's field types; `parseLayerText` checks "is a JSON object"
and nothing deeper; platform/endpoint/tokens are read back from
local/sessionStorage untyped; OAuth callback params and the Worker's
token-exchange response are consumed as-is; injected preset JSON goes
straight into the resolution pipeline. Replace this with explicit schemas
at every boundary using **zod v4's `zod/mini`** (the tree-shakeable,
functional-API build — fits the app-bundle discipline), so that malformed
or hostile input fails closed, with an honest message, before it reaches
any merge, fetch, or render path.

### Threat model (what validation actually buys here)

A share link is attacker-controlled data that the app decodes and **runs
automatically on open** — it is the main vector, and it can carry
arbitrary config objects (repo, global, inherited), platform/endpoint
strings, view state and simulator form fields. React's rendering escapes
output, so classic markup XSS is not the concern; the realistic risks are:

- **Prototype pollution**: user-supplied config objects (share payloads,
  pasted layers, injected presets) flow into deep merges — Renovate's own
  `mergeChildConfig` among them. Own-keys `__proto__` / `constructor` /
  `prototype` anywhere in those objects must be rejected before merging.
- **Dangerous URLs**: `endpoint` (and any URL-ish field, e.g. the stored
  OAuth avatar URL) must parse as `http(s):` — never `javascript:` /
  `data:` — before being fetched or rendered into an attribute.
- **Header injection**: tokens are placed into request headers; reject
  control characters / CR-LF and enforce a sane charset and length.
- **Type confusion / crashes**: a `view.step` that is a string, a `sim`
  form that is an array, a `platform` that is an object — each currently
  relies on downstream code happening to cope. Schemas make the failure a
  diagnosed rejection instead of an undefined behavior.
- **Storage tampering**: local/sessionStorage values are same-origin but
  can drift across versions or be edited; validated reads fall back to
  defaults instead of poisoning state for every later run.

## User story

As a user opening a shared link (or restoring a session), malformed or
malicious state can at worst produce the 027 "link couldn't be opened"
banner — never a polluted merge, a request to a `javascript:` endpoint, or
a half-applied state I then unknowingly run and share onward.

## Scope

- **Schemas** (in the app package, `zod/mini` only):
  - share payload, all supported versions: config text, fileName enum,
    platform/endpoint, global/inherited config objects, `platformOverride`,
    `view` (stage enum / step index / node identity / 028's tab),
    `sim` (string-record form + `autoSimulate`), `renovate` version string;
  - storage reads: platform, endpoint, per-host tokens, OAuth stored user
    (login, avatar URL);
  - OAuth callback query params and the Worker token-exchange response;
  - injected-preset JSON (object, pollution-checked) at the injection form;
  - pasted global/inherited layer objects (replacing `parseLayerText`'s
    hand-rolled check);
  - repo-load input split results (host/repo/ref) before request building.
- A shared **deep pollution check** (`__proto__`/`constructor`/`prototype`
  own keys, recursive) applied to every user-supplied config object,
  including nested `packageRules[n]` content.
- **Failure UX reuses existing honesty patterns**: share-link schema
  failures map onto 027's diagnosed banners (damaged / incompatible);
  stored-value failures silently reset to defaults; form-field failures
  show inline messages in 014/023 style. No new error vocabulary.
- **Bundle discipline**: `zod/mini` lands in the main app chunk; measure
  the size delta in CI's build step (expected low single-digit kB gz —
  fail loudly if it balloons).
- **Adversarial tests**: polluted payloads (`__proto__` at several depths),
  `javascript:` endpoint, CR-LF token, wrong-typed view/sim fields,
  truncated-but-valid-envelope share tokens, tampered storage values —
  each asserting both the rejection and the surfaced UX.

## Out of scope

- Validating Renovate config _semantics_ — that is the pipeline's validate
  stage (the whole point of the app); schemas here check transport shape,
  not option correctness.
- Engine-internal types and the trace format (TypeScript-only remains
  sufficient inside the sandboxed pipeline).
- Any server-side validation (there is no server; the 009 Worker keeps its
  own minimal checks).

## Dependencies

- 007/017/027 (share links: the payload surface and the failure banners),
  008 (config layers), 009 (OAuth artifacts), 010 (tokens, injection),
  028 (adds the `tab` view field this must cover).
