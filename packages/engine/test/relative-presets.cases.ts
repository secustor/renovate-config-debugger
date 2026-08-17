/**
 * The relative-preset canonicalization table, shared by the golden and the
 * shimmed project so both regimes assert against the SAME expectations.
 *
 * Renovate 44.29.1 taught `config/presets/` to resolve relative references
 * (`./x`, `../x`, `/x`) written inside a preset: before a fetched preset is
 * recursed into, every entry of its `extends`/`ignorePresets` is rewritten to
 * an absolute preset string that inherits the parent's source, repo and tag
 * (`config/presets/relative.js`). Nothing in this repo implements that — but
 * the rewrite happens in `presets/index.js`, which the shim plugin does NOT
 * shim, so the browser module graph inherits it and must behave identically.
 *
 * Everything below is upstream's observed behavior, not a wish list: the
 * golden test derives these from the real module, so a Renovate bump that
 * changes the rules fails here first.
 */

/** The subset of renovate's ParsedPreset that canonicalization reads. */
export interface RelativeParent {
  presetSource: string;
  repo: string;
  presetPath?: string;
  tag?: string;
}

/** A preset living at `base/main.json` of `github>acme/presets`. */
export const PARENT: RelativeParent = {
  presetSource: "github",
  repo: "acme/presets",
  presetPath: "base",
};

export interface CanonicalizationCase {
  /** The entry exactly as authored in the parent preset's `extends`. */
  input: string;
  /** What renovate rewrites it to before resolution continues. */
  expected: string;
  /** Which rule this case pins. */
  why: string;
  /** Defaults to `PARENT`. */
  parent?: RelativeParent;
}

export const CANONICALIZATION_CASES: CanonicalizationCase[] = [
  {
    input: "./sibling",
    expected: "github>acme/presets//base/sibling",
    why: "`./` is the directory the parent preset itself lives in",
  },
  {
    input: "../top",
    expected: "github>acme/presets//top",
    why: "`../` climbs one directory, here to the repository root",
  },
  {
    input: "/rooted/thing",
    expected: "github>acme/presets//rooted/thing",
    why: "a leading `/` anchors at the repository root, ignoring presetPath",
  },
  {
    input: "./deeper/leaf",
    expected: "github>acme/presets//base/deeper/leaf",
    why: "multi-segment relative paths keep their sub-directories",
  },
  {
    input: "./a/../b",
    expected: "github>acme/presets//base/b",
    why: "the joined path is normalized, so interior `..` collapses",
  },
  {
    input: "./tpl(weekly)",
    expected: "github>acme/presets//base/tpl(weekly)",
    why: "preset parameters survive the rewrite, re-appended after the path",
  },
  {
    input: "/default",
    expected: "github>acme/presets",
    why: "a whole path of exactly `default` collapses to the bare repo form",
  },
  {
    input: "./default",
    expected: "github>acme/presets//base/default",
    why: "…but only as the WHOLE path — `base/default` is an ordinary file",
  },
  {
    input: "./sibling",
    expected: "gitlab>acme/presets//sibling",
    why: "a parent at the repo root has no presetPath to join onto",
    parent: { presetSource: "gitlab", repo: "acme/presets" },
  },
  {
    input: "./sibling",
    expected: "github>acme/presets//base/sibling#v2.0.0",
    why: "the parent's tag is inherited by everything it references",
    parent: { ...PARENT, tag: "v2.0.0" },
  },
  {
    input: "./tpl(weekly)",
    expected: "github>acme/presets//base/tpl#v2.0.0(weekly)",
    why: "with both, upstream emits the tag BEFORE the params — parsePreset round-trips this form",
    parent: { ...PARENT, tag: "v2.0.0" },
  },
  // ---- entries that must be left exactly as authored ---------------------
  {
    input: "../../elsewhere",
    expected: "../../elsewhere",
    why: "climbing out of the repository is refused; upstream warns and keeps the entry",
  },
  {
    input: "./{{env}}",
    expected: "./{{env}}",
    why: "templated references are left for the template engine, not rewritten",
  },
  {
    input: "./",
    expected: "./",
    why: "no name after the slashes — not a preset reference at all",
  },
  {
    input: ".",
    expected: ".",
    why: "a bare dot is not a relative preset reference",
  },
  {
    input: "github>other/repo",
    expected: "github>other/repo",
    why: "absolute references are untouched",
  },
  {
    input: "config:recommended",
    expected: "config:recommended",
    why: "internal presets are untouched",
  },
];

/**
 * Canonicalization walks the whole preset body, not just top-level `extends`:
 * `ignorePresets` is rewritten too, and so is an `extends` nested inside a
 * packageRule. Everything else is left alone.
 */
export const CONTAINER_INPUT = {
  extends: ["./sibling"],
  ignorePresets: ["./ignored"],
  packageRules: [{ matchDepNames: ["react"], extends: ["./nested"] }],
  labels: ["./not-a-preset"],
};

export const CONTAINER_EXPECTED = {
  extends: ["github>acme/presets//base/sibling"],
  ignorePresets: ["github>acme/presets//base/ignored"],
  packageRules: [{ matchDepNames: ["react"], extends: ["github>acme/presets//base/nested"] }],
  labels: ["./not-a-preset"],
};

/**
 * Renovate's explanation for a relative reference used where no parent preset
 * exists (repo config, inherited config, globalExtends) — and for one that
 * survived canonicalization unresolved, e.g. after escaping the repository.
 * This is the sentence a user actually reads: it reaches the run's `errors`
 * as the message topic.
 */
export const RELATIVE_NO_PARENT_TEXT = "Relative preset reference cannot be resolved";

/**
 * The short `Error.message` behind it (renovate's PRESET_RELATIVE_NO_PARENT),
 * which is what the trace's preset-error event quotes.
 */
export const RELATIVE_NO_PARENT_MESSAGE = "relative preset has no parent";
