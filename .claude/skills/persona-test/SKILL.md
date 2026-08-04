---
name: persona-test
description: Replays the 2026-07 persona usability study (all scenarios, or a scenario/persona subset) against the live app — spawns entry/advanced/expert subagents that drive a real Chrome browser through the Renovate Config Visualizer, ground-truth withheld, and synthesizes their structured reports. Use when asked to run a persona test, replay the persona study, or evaluate a UX change against the benchmark scenarios.
---

# Persona-test replay

Encodes the procedure from the
[2026-07 persona UX study](../../../roadmap/2026-07-persona-ux-study.md) as a
repeatable skill (roadmap 019). You (the agent running this skill) are the
**orchestrator**: you build and serve the app, generate share links, spawn
persona subagents one at a time against a single shared browser, collect
their structured reports, and synthesize a comparison against the baseline
study.

You do not drive the browser yourself except for the server health check —
all scenario exploration happens inside persona subagents.

## 1. Parse arguments

Args come as free text after the skill invocation, e.g. `/persona-test
simulator advanced` or `/persona-test 44958 all` or with no args at all.

- **Scenario filter** — optional. One of:
  - `all` (default) — every file in `scenarios/`.
  - a discussion id or filename fragment (e.g. `44958`, `star-exclusion`) —
    matches against scenario filenames.
  - a thematic word (e.g. `simulator`) — match against scenario content
    (all three current scenarios exercise the simulator; a filter like this
    only narrows once more scenarios exist — fall back to `all` with a note
    if nothing matches).
- **Persona filter** — optional. One or more of `entry`, `advanced`,
  `expert`. Default: all three.

If both are given, order doesn't matter — just identify which tokens are
scenario matches vs. persona-level matches. If a token matches neither,
say so and proceed with defaults rather than failing outright.

State your resolved plan back before proceeding: which scenario files and
which persona levels, and therefore how many subagent sessions (scenarios ×
personas) you're about to run.

## 2. Setup: build and serve

```sh
pnpm --filter @renovate-config-debugger/app build
```

Then, from `packages/app`:

```sh
pnpm exec vite preview --port <port>
```

**Use `vite preview` (the production build), never `vite dev`.** This is a
documented study finding (roadmap 019 / study report §10): a cold `vite dev`
server can wedge the first engine import after a `--force`
re-optimization — the production build has no such failure mode. Run
`vite preview` as a background process (you'll keep it alive for the whole
skill run, then stop it at the end).

Pick a port not already in use (check with `lsof -i :<port>` or just try
`4173`, `4174`, … on conflict — `vite preview`'s default is `4173`).

**Verify the server responds before spawning any persona**: curl the root
URL and confirm a 200 / HTML body comes back. Do not proceed to persona
spawning on a server that isn't answering yet — retry briefly, but don't
paper over a real startup failure.

## 3. Generate share links

For each `(scenario, persona)` pair you're running, generate the share URL
with the bundled generator (no dependencies, already verified to round-trip
its own tokens):

```sh
node .claude/skills/persona-test/generate-links.mjs \
  --config .claude/skills/persona-test/scenarios/<scenario file> \
  --port <port>
```

This prints a URL of the form `http://localhost:<port>/?s=<unique>#config=<token>`,
built as:

```
payload = { v: 2, renovate: "<engine renovate version>", config: "<config text>", fileName: "renovate.json" }
token   = base64url( deflate-raw( utf8( JSON.stringify(payload) ) ) )   // no padding
url     = `http://localhost:<port>/?s=<unique>#config=${token}`
```

— the exact wire format `packages/app/src/share.ts` decodes. The generator
reads the pinned Renovate version straight from
`packages/engine/package.json`, so it always matches the build you just
served; only pass `--renovate` explicitly if you need to deviate.

The `?s=<unique>` query parameter is not read by the app. Its purpose: a
same-origin URL that differs only in its hash is (correctly) treated by the
in-app `hashchange` handler as a live navigation (roadmap 017 fixed that
case) — but pasting a link into a **freshly-opened tab** with no prior app
state is the common case here, and the unique query param guarantees a full
document load regardless of which app build or browser tab state you land
on. Keep it; it costs nothing and removes a whole class of flakiness.

Each `(scenario, persona)` pair gets its **own freshly-generated link** — do
not reuse a URL across personas even when the scenario config is identical,
so each persona session starts from a clean load.

## 4. Spawn persona subagents — serially, one shared browser

Run persona sessions **one at a time**, never in parallel — the study used
one shared browser tab/session throughout, and so does the replay (roadmap
019 explicitly scopes out parallel personas). For each `(scenario, persona)`
pair, in order:

1. Load `personas.md` and extract the matching persona block (Entry /
   Advanced / Expert) plus the shared mechanics footer.
2. Load the scenario file and extract the matching `### <Level>` framing
   from `## Symptom framing`, plus the `## Facts each level is allowed to
know` bullet for that level. **Never** include the `## Ground truth`
   section, or anything derived from it, in the subagent prompt.
3. Compose the subagent prompt: persona block + shared mechanics footer +
   scenario framing + allowed facts + the pre-generated share link for this
   pair + instruction to navigate to that link first thing.
4. Spawn as a **browser-only** subagent (it should have Chrome MCP tools
   and nothing else it could use to route around the browser — no file
   read/search, no web search, no shell). Enforce the ~30 action budget in
   the prompt; the subagent self-reports when it stops, it isn't
   externally metered.
5. Collect its structured report (first impression / step log / outcome +
   confidence / friction points / wishes) verbatim before moving to the
   next pair.

If a scenario config needs re-loading between personas (e.g. the previous
persona edited the in-app config), the next persona's fresh share link
navigation resets that — no manual cleanup needed between sessions, since
each pair gets its own link and its own document load.

## 5. Synthesize

Once all sessions are collected, produce:

1. **Per-scenario outcome table** — rows = persona levels, columns =
   diagnosis correctness (graded by you, the orchestrator, against the
   scenario's `## Ground truth` section — correct / partial / incorrect)
   and confidence %. One table per scenario run.
2. **Friction points, ranked by frequency** — pool every persona's friction
   points across the run, group near-duplicates, sort by how many sessions
   hit each one.
3. **Comparison against the baseline** — the
   [2026-07 study report](../../../roadmap/2026-07-persona-ux-study.md) is
   the baseline. For each friction point or finding number (1–10) the
   baseline documented that's in scope for this run's scenarios/personas,
   state: still present / improved / resolved / not applicable this run.
   Call out anything genuinely new (not in the baseline's 10 findings).
   Pay particular attention to scenario `44006-automerge-nesting.md`'s
   built-in regression check for roadmap 012 (update-type flattening) — an
   expert run against it should now succeed where the baseline's expert
   persona couldn't.

   `44958-category-grouping.md` carries a second built-in check: whether the
   simulator derives `categories` from the selected `manager`. Until it does,
   personas cannot reach that scenario's diagnosis unaided — report whether
   they had to hand-supply the answer as input.

**Check each scenario's `### Validity` section (where present) before
grading.** Scenarios built on upstream data — preset bodies, manager
definitions — go stale when Renovate is bumped, and a stale scenario grades
correct answers as wrong. The retired `44772-monorepo-preset` scenario failed
exactly this way: upstream added `react/react` to the `monorepo:react` preset,
so the bug it was built on no longer existed. If a validity check fails, say
so and grade against observed current behavior rather than the written
ground truth.

Present this as your final report; do not silently drop a session's report
even if it was short (budget ran out, or the persona bailed early) — note
it as such in the table.

## 6. Teardown

Stop the `vite preview` process you started.

---

## Known infra pitfalls (from the study — avoid re-discovering these)

- **Pasting into the CodeMirror config editor**: a synthesized paste needs
  a real `ClipboardEvent` dispatched at the editor; `document.execCommand`
  paste emulation does not work against CodeMirror's editable surface.
  Before pasting replacement content, **select all and Delete first** —
  pasting over a selection can behave differently than pasting into an
  empty document, and stale selections have silently replaced the wrong
  line in past sessions.
- **Screenshot coordinates are in downscaled screenshot space**, not raw
  page pixels — if you (or a persona) compute a click position from a
  screenshot, remember the image you're looking at is scaled down from the
  actual viewport; don't feed screenshot pixel coordinates directly to a
  click without accounting for the scale factor.
- **MCP-injected JavaScript runs in an isolated world** — it cannot see or
  touch the page's own JS state/closures directly; interact through the DOM
  and real events, not by reaching into React internals or module state.
- **Never trigger native browser dialogs** (`confirm()`, `alert()`,
  `beforeunload` prompts, file pickers) — a persona session has no way to
  drive them and a stuck dialog silently ends the session. If a UI action
  might trigger one (e.g. the "overwrite current work?" guard from roadmap
  017's hashchange handling), avoid the sequence that provokes it rather
  than trying to handle the dialog.
- **`vite dev`, not `vite preview`, is the one with the cold-start wedge**
  (see step 2) — don't "simplify" the setup back to `pnpm dev` for a faster
  iteration loop; it's exactly the setup the study found unreliable.
- **Hash-only navigation into an already-loaded tab was a real bug**
  (roadmap 017, now fixed) — the `?s=<unique>` workaround in step 3 is
  cheap insurance against the same bug class resurfacing or against
  replaying this skill on an older build that predates the fix; keep it.
