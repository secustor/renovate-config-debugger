# 030 — Input validation at every boundary (zod/mini)

Milestone: M8 · Status: planned

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
