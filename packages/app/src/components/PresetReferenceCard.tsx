import type { PresetReferenceFacts, PresetViaStep } from "@/lib/preset-reference";
import { nf, plural } from "@/lib/format";
import { HoverCardJump } from "./HoverCardJump";

/**
 * Roadmap 081: the standard preset hover card — one card behind every preset
 * token in the app, saying the three things a reference cannot say by itself.
 *
 * 1. HOW the reader got here: the real ancestry, as layer chips, ending in
 *    "this preset". The chain never repeats the token's own name — the name is
 *    the thing being pointed at, and echoing it inside its own card wastes the
 *    line that should carry the part the token cannot show.
 * 2. WHAT it drags in: direct extends, the whole subtree, and how deep the
 *    deepest chain under it runs.
 * 3. WHERE to see it: the link into the Presets tab, which is the destination
 *    this card is a preview of.
 *
 * Split into a component per line, and not for tidiness: `react/jsx-max-depth`
 * is 3, and the chain alone is a row of chips with separators between them.
 */

/** One ancestor, plus the arrow that leads out of it. */
function ViaStep({ step }: { step: PresetViaStep }) {
  return (
    <>
      <span className={step.kind === "repo" ? "pill pill-accent" : "pill pill-preset"}>
        {step.label}
      </span>
      <span className="preset-ref-arrow" aria-hidden="true">
        →
      </span>
    </>
  );
}

function ViaChain({ via }: { via: PresetViaStep[] }) {
  return (
    <div className="preset-ref-via">
      <span className="preset-ref-lead">via</span>
      {via.map((step) => (
        <ViaStep key={step.nodeId} step={step} />
      ))}
      <span className="preset-ref-self">this preset</span>
    </div>
  );
}

/** The rule and the numbers under it. */
function NestingCounts({ facts }: { facts: PresetReferenceFacts }) {
  if (facts.directExtends === 0) {
    // "extends 0 presets directly, 0 after nesting" is three numbers to say
    // one thing, and it is the commonest case in the tree by far.
    return (
      <div className="preset-ref-counts">
        extends <strong>nothing</strong> — a leaf of the expansion
      </div>
    );
  }
  return (
    <div className="preset-ref-counts">
      extends <strong>{plural(facts.directExtends, "preset")}</strong> directly,{" "}
      <strong>{nf.format(facts.totalNested)}</strong> after nesting
      {facts.deepestChain > 1 ? ` · deepest chain ${plural(facts.deepestChain, "level")}` : ""}
    </div>
  );
}

/** The way into the tree — `HoverCardJump` owns the close-then-jump sequence. */
function FullTreeLink({ nodeId, onSelect }: { nodeId: string; onSelect: (id: string) => void }) {
  return (
    <div className="preset-ref-link">
      <HoverCardJump label="show the full tree →" onJump={() => onSelect(nodeId)} />
    </div>
  );
}

export function PresetReferenceCard({
  facts,
  onSelect,
}: {
  facts: PresetReferenceFacts;
  /** Absent where the app has no preset navigation wired — the card then
   *  states the facts and offers nothing it cannot deliver. */
  onSelect?: (nodeId: string) => void;
}) {
  return (
    <div className="preset-ref-body">
      <ViaChain via={facts.via} />
      <NestingCounts facts={facts} />
      {onSelect ? <FullTreeLink nodeId={facts.nodeId} onSelect={onSelect} /> : null}
    </div>
  );
}
