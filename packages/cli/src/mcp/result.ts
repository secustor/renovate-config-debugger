import { byteLength } from "../output";

/**
 * The one JSON document every MCP tool answers with — and its size budget.
 *
 * Two economics, one module. A model consumer pays for every byte, and the
 * host truncates what it cannot fit, so:
 *
 * - small answers are pretty-printed, because a human reads them in the
 *   transcript; large ones are compact, because indentation on a 60 kB
 *   payload is pure token overhead;
 * - an answer that would blow the budget is elided STRUCTURALLY — never cut
 *   mid-JSON — and says so, with the parameter that narrows the question.
 *   Silent truncation is the failure mode worth avoiding: an agent cannot
 *   tell a short list from a shortened one.
 */

/** Above this, indentation stops paying for itself. */
const PRETTY_LIMIT_BYTES = 4_000;

/** Claude Code's default cap on a tool result, in tokens; the hosts that
 *  publish a number are all in this range. */
const HOST_TOKEN_CAP = 25_000;

/** Compact JSON of this shape measures out at roughly three bytes to the
 *  token — identifiers and punctuation tokenize worse than prose. */
const BYTES_PER_TOKEN = 3;

/**
 * The most any single tool result may carry: the host's own cap, with head
 * room for the transport framing around the payload and for a tokenizer that
 * does worse than the average on a given answer.
 *
 * DERIVED, not picked. A budget above the host's cap defeats the one guarantee
 * this module makes — the host truncates the overflow mid-JSON, and an agent
 * is left holding a document it cannot parse, from a module that promised it
 * never would.
 */
export const RESULT_BUDGET_BYTES = Math.round(HOST_TOKEN_CAP * BYTES_PER_TOKEN * 0.87);

/** Elide to slightly under, so the wrapper keys still fit. */
const ELISION_TARGET_BYTES = RESULT_BUDGET_BYTES - 2_000;

const MAX_ELISION_ROUNDS = 500;

const DEFAULT_HINT =
  "this answer was elided to fit the tool-output budget — ask a narrower question " +
  "(one key, one node, a smaller depth) and call again.";

/**
 * What an elided array LOOKS like, said once and appended to whichever hint
 * the tool supplied. A model that meets `{truncated, shown, omitted, …}`
 * without being told what it is reads it as data the config contained.
 */
const ELIDED_ARRAY_SHAPE =
  "An elided array is replaced by `{truncated, shown, omitted, omittedFrom, items}`: `items` " +
  "holds the FIRST and the LAST elements of the original array, `omitted` counts the ones " +
  "dropped between them, and `omittedFrom` is the index in `items` where they were.";

/** How much of a shrinking array's allowance the TAIL window may claim. */
const TAIL_SHARE = 0.25;

/** What one array lost, across every round that shrank it. */
interface Elision {
  /** Elements dropped in total. */
  omitted: number;
  /** Where the gap sits among the elements that remain. */
  from: number;
}

function stringify(value: unknown): string {
  return JSON.stringify(value) ?? "null";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The biggest array anywhere in the payload that is still worth shrinking —
 *  `skip` holds the ones a round could not shrink any further. */
function largestArray(value: unknown, skip: Set<unknown[]>): unknown[] | null {
  let best: unknown[] | null = null;
  let bestSize = 0;
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      const size = byteLength(stringify(node));
      if (node.length > 1 && size > bestSize && !skip.has(node)) {
        best = node;
        bestSize = size;
      }
      for (const item of node) {
        visit(item);
      }
      return;
    }
    if (isRecord(node)) {
      for (const item of Object.values(node)) {
        visit(item);
      }
    }
  };
  visit(value);
  return best;
}

/** Rewrites every shortened array into a self-describing wrapper, so the
 *  omission is a fact in the document rather than a missing element. */
function applyElisions(value: unknown, elided: Map<unknown[], Elision>): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => applyElisions(item, elided));
    const elision = elided.get(value);
    return elision
      ? {
          truncated: true,
          shown: items.length,
          omitted: elision.omitted,
          omittedFrom: elision.from,
          items,
        }
      : items;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, applyElisions(item, elided)]),
    );
  }
  return value;
}

/**
 * Drops whole top-level keys, biggest first — the last resort for a payload
 * with no array big enough to elide (one enormous object).
 *
 * It measures against the hard cap, not the elision target: the array pass
 * aims a little under, and a key is far too blunt an instrument to reach for
 * over the few hundred bytes the wrapper adds.
 */
function dropLargestKeys(payload: Record<string, unknown>): string[] {
  const dropped: string[] = [];
  while (byteLength(stringify(payload)) > RESULT_BUDGET_BYTES - 1_000) {
    const entries = Object.entries(payload);
    if (entries.length === 0) {
      break;
    }
    const [key] = entries.reduce((a, b) =>
      byteLength(stringify(a[1])) >= byteLength(stringify(b[1])) ? a : b,
    );
    delete payload[key];
    dropped.push(key);
  }
  return dropped;
}

/**
 * Everything but the first and the last element, so the next round can work
 * inside them. Both ends survive on purpose: `ELIDED_ARRAY_SHAPE` promises
 * the caller exactly that, and the tail is where a merged `packageRules`
 * array keeps the repo's own rules — the floor case must not be the one
 * branch that breaks the promise.
 */
function collapseToEnds(array: unknown[]): Elision | null {
  const removed = array.length - 2;
  if (removed <= 0) {
    return null;
  }
  array.splice(1, removed);
  return { omitted: removed, from: 1 };
}

/**
 * Keeps a HEAD window and a TAIL window of the array — as much of each as
 * `allowance` affords — and removes the span between them. Returns null when
 * the array has nothing to give back.
 *
 * Two properties earn the bookkeeping:
 *
 * - Measured, not counted. An array's bytes are never spread evenly across it,
 *   so "keep half" either throws away a document to save nothing (a preset
 *   tree's fat child is last) or saves nothing at all (it is first).
 * - A tail window AT ALL, because relevance is not spread evenly either. A
 *   merged `packageRules` array is the presets' rules first and the repo's OWN
 *   rules last, so a head-only truncation drops precisely the rules the person
 *   asking wrote — `get_resolved_config` kept rules 0–329 of 714 and lost the
 *   caller's own rule at index 713, with no parameter that could ask for it.
 */
function shrinkArray(array: unknown[], allowance: number): Elision | null {
  const sizes = array.map((item) => byteLength(stringify(item)) + 1);
  const first = sizes[0] ?? 0;

  if (sizes.some((size) => size > allowance)) {
    // An element that alone blows the whole allowance IS the answer — a preset
    // tree is one enormous child next to a dozen small ones. Truncating AROUND
    // it returns the leaves and drops the trunk, so this array gives nothing
    // back and the next round elides INSIDE the big element instead.
    //
    // Unless the allowance will not even cover the array's FIRST element: then
    // nothing here fits, and "give nothing back" is how the pass stalls —
    // `removed === 0` marks the array exhausted, no array can shrink, and the
    // blunt key-dropping below inherits the whole problem. That is how a
    // simulate answer came back holding 2 of 713 rules and no merge trace at
    // all, on a third of the budget. First-and-last is the honest floor.
    return allowance >= first ? null : collapseToEnds(array);
  }

  const last = array.length - 1;
  // The tail is measured first, so a long head cannot eat the room it needs.
  const tailAllowance = Math.max(0, Math.floor(allowance * TAIL_SHARE));
  let used = 0;
  let tail = 0;
  while (tail < last) {
    const size = sizes[last - tail] ?? 0;
    if (used + size > tailAllowance) {
      break;
    }
    used += size;
    tail += 1;
  }

  let head = 0;
  while (head < array.length - tail) {
    const size = sizes[head] ?? 0;
    // The first element is always kept: the shape of an answer is part of the
    // answer.
    if (head > 0 && used + size > allowance) {
      break;
    }
    used += size;
    head += 1;
  }

  const removed = array.length - head - tail;
  if (removed <= 0) {
    return null;
  }
  array.splice(head, removed);
  return { omitted: removed, from: head };
}

function elideToBudget(compact: string, hint: string | undefined): Record<string, unknown> {
  const clone = JSON.parse(compact) as unknown;
  const elided = new Map<unknown[], Elision>();
  // Arrays that cannot give anything back — one oversized element is all they
  // hold. The next round looks inside it instead.
  const exhausted = new Set<unknown[]>();
  for (let round = 0; round < MAX_ELISION_ROUNDS; round += 1) {
    const size = byteLength(stringify(clone));
    if (size <= ELISION_TARGET_BYTES) {
      break;
    }
    const largest = largestArray(clone, exhausted);
    if (!largest) {
      break;
    }
    // What this array may still weigh once the payload fits.
    const allowance = byteLength(stringify(largest)) - (size - ELISION_TARGET_BYTES);
    const shrunk = shrinkArray(largest, allowance);
    if (!shrunk) {
      exhausted.add(largest);
      continue;
    }
    const before = elided.get(largest);
    // `from` is an index into what REMAINS, so the latest round's is the one
    // that describes the array a caller reads; the counts accumulate.
    elided.set(largest, { omitted: (before?.omitted ?? 0) + shrunk.omitted, from: shrunk.from });
  }
  const body = applyElisions(clone, elided);
  const payload = isRecord(body) ? { ...body } : { result: body };
  const droppedKeys = dropLargestKeys(payload);
  const base = hint ?? DEFAULT_HINT;
  return {
    truncated: true,
    hint: elided.size > 0 ? `${base} ${ELIDED_ARRAY_SHAPE}` : base,
    ...(droppedKeys.length > 0 ? { omittedKeys: droppedKeys } : {}),
    ...payload,
  };
}

/**
 * Whether a payload survives {@link serializeResult} whole.
 *
 * For projections that would rather degrade SEMANTICALLY than be collapsed to
 * first-and-last: `get_provenance` on `packageRules` measures its own answer
 * and drops to shorter digest lines, keeping the attribution complete, instead
 * of handing the elider an array of 727 large objects it can only cut to two.
 * Purely additive — the elision itself is untouched.
 */
export function fitsBudget(payload: unknown): boolean {
  return byteLength(stringify(payload)) <= ELISION_TARGET_BYTES;
}

/**
 * `hint` is the narrowing a caller should apply if this particular tool's
 * answer had to be elided — naming the parameter beats "output truncated".
 */
export function serializeResult(payload: unknown, hint?: string): string {
  const compact = stringify(payload);
  const size = byteLength(compact);
  if (size <= PRETTY_LIMIT_BYTES) {
    return JSON.stringify(payload, null, 2) ?? "null";
  }
  if (size <= RESULT_BUDGET_BYTES) {
    return compact;
  }
  return stringify(elideToBudget(compact, hint));
}

/** Deliberately un-annotated: an interface here would not satisfy the SDK's
 *  `CallToolResult` index signature, an inferred object type does. */
export function textResult(payload: unknown, hint?: string) {
  return { content: [{ type: "text" as const, text: serializeResult(payload, hint) }] };
}
