/**
 * Roadmap 045/048 — the inherited-config layer as one hook: the 008 layer's own
 * text and parse, the probe-target form fields (repo, file, and the auto-load
 * checkbox) with their null-until-touched edit state, the `inheritConfig*`
 * policy read live off the pasted global config, and the probe itself — the one
 * fetch that resolves an org's inherited config the way a real `inheritConfig`
 * run does.
 *
 * The pieces are one concept because they are one derivation chain: the global
 * config decides the policy, the policy plus the repo reference decide the
 * fields, the fields decide what the probe fetches, and the probe's outcome
 * plus the same policy decide what the layer's note says.
 *
 * App.tsx keeps the load sequence: it owns `onLoadRepo`, and calls the returned
 * `probeInheritedConfig` at the same point it always did — after the repo
 * config arrives, before the run that processes it. Everything the cluster acts
 * on but does not own comes in through {@link InheritedConfigLayerHost}.
 *
 * Roadmap 076: the layer's EDITOR moved to the pipeline's inherited-config
 * stage card, so the three points where a probe used to open two nested
 * disclosures now call one `revealInheritedStage` instead. Where that lands is
 * App's business, not this cluster's.
 */
import { useMemo, useState } from "react";
import type { RepoPlatform } from "@renovate-config-debugger/engine";
import {
  inheritFieldValues,
  type InheritLayerState,
  inheritLayerState,
  inheritPolicyOf,
  type InheritProbeOutcome,
  inheritProbeTarget,
  type InheritTarget,
  isProbeTargetResolved,
} from "@/lib/inherit-probe";
import { isValidRepoRefPart, type LayerParseResult, parseLayerJson } from "@/lib/input-schemas";
import { loadRepoFile } from "@/platform/run";

/** The two live values the cluster derives from, and the one way a probe says
 *  "the result of that fetch is over there". */
export interface InheritedConfigLayerHost {
  /** The pasted global config, parsed (008). The `inheritConfig*` family is
   *  read off it live, so pasting or editing it re-frames the layer at once. */
  globalConfig: Record<string, unknown> | undefined;
  /** The repo field's raw text in the load form — the target's owner while the
   *  user is still typing one. */
  repoInput: string;
  /**
   * Roadmap 076: selects the inherited-config stage, whose card is where the
   * layer is edited since the layers left the Advanced zone (design turn 18d).
   * It used to be a pair of `setOpen(true)` calls — the zone, then the section
   * inside it — because that is where the layer lived; the reveal is one act
   * now, and App decides what "reveal" means.
   */
  revealInheritedStage: () => void;
}

export interface InheritedConfigLayer {
  inheritedText: string;
  inheritedParse: LayerParseResult;
  applyInheritedText: (text: string) => void;
  inheritAuto: boolean;
  inheritFields: InheritTarget;
  inheritState: InheritLayerState | null;
  onInheritAutoFieldChange: (value: boolean) => void;
  onInheritRepoFieldChange: (value: string) => void;
  onInheritFileFieldChange: (value: string) => void;
  probeInheritedConfig: (args: {
    platform: RepoPlatform;
    endpoint: string;
    /** The repo slug that was actually loaded — the templating authority. */
    loadedRepo: string;
    suppressTokens: boolean;
  }) => Promise<Record<string, unknown> | undefined>;
}

export function useInheritedConfigLayer(host: InheritedConfigLayerHost): InheritedConfigLayer {
  const { globalConfig, repoInput, revealInheritedStage } = host;
  // 008 layer input (JSON text; empty = layer off).
  const [inheritedText, setInheritedText] = useState("");
  // Roadmap 045: the form's second row. Corrected 2026-07-26 — this was
  // default-ON on the (wrong) claim that the public Mend-hosted app runs with
  // `inheritConfig` enabled. It does not: the option itself defaults to
  // `false`, AND Mend currently disables it in their hosted app too, to avoid
  // "wasting millions of API calls per week" until they ship a smarter,
  // dynamic approach (self-hosted-configuration docs, #inheritconfig). A
  // default-on checkbox would model a run that mostly does not happen, so it
  // starts OFF. `null` until the user touches it, so it can still track a live
  // derivation — here, a pasted global config's own `inheritConfig: true` —
  // the same null-until-touched idiom `inheritRepoEdit`/`inheritFileEdit` use
  // below; once touched, the user's choice wins for the session even if the
  // global config later changes or is cleared. See
  // roadmap/045-auto-load-inherited-config.md's "Correction (2026-07-26)".
  const [inheritAutoEdit, setInheritAutoEdit] = useState<boolean | null>(null);
  const [inheritRepoEdit, setInheritRepoEdit] = useState<string | null>(null);
  const [inheritFileEdit, setInheritFileEdit] = useState<string | null>(null);
  // What the last probe did (008 layer origin / miss). Cleared by any hand edit
  // of the layer, which is what makes an auto-loaded layer become a pasted one.
  const [inheritProbe, setInheritProbe] = useState<InheritProbeOutcome | null>(null);

  const inheritedParse = useMemo(() => parseLayerJson(inheritedText), [inheritedText]);
  // Roadmap 045: the `inheritConfig*` family of the pasted global config — the
  // probe target's overrides, and the two flags that decide what a hit (2c) and
  // a miss (2b) MEAN under that config. Derived live, so pasting or editing the
  // global config after a probe re-frames the layer immediately.
  const inheritPolicy = useMemo(() => inheritPolicyOf(globalConfig ?? null), [globalConfig]);
  // Roadmap 045, corrected 2026-07-26: the checkbox tracks the pasted global
  // config's `inheritConfig: true` until the user flips it by hand — the same
  // derivation-until-touched rule as `inheritFields` below, just for a
  // checkbox instead of a text field, so there is no "clear to go back to the
  // default" gesture: any explicit toggle (on OR off) is the user's from then
  // on, session-scoped, and survives the global config changing or clearing.
  const inheritAuto = inheritAutoEdit ?? inheritPolicy.explicitlyEnabled;
  const inheritFields = useMemo(
    () =>
      inheritFieldValues({
        repoInput,
        globalConfig: globalConfig ?? null,
        edits: { repo: inheritRepoEdit, file: inheritFileEdit },
      }),
    [repoInput, globalConfig, inheritRepoEdit, inheritFileEdit],
  );
  const inheritState = useMemo(
    () => inheritLayerState(inheritProbe, inheritPolicy),
    [inheritProbe, inheritPolicy],
  );

  /**
   * Roadmap 045: the inherited layer's text changing by any route OTHER than a
   * probe — the user typing in it, a share link carrying one — drops the probe's
   * origin metadata, so the layer is the ordinary pasted layer from then on.
   * That is also what keeps share links honest: the origin line is never in the
   * payload, and a link's inherited layer is content, never a fetch on open.
   */
  function applyInheritedText(text: string) {
    setInheritedText(text);
    setInheritProbe(null);
  }

  /** Roadmap 045: a probe-target field the user typed in is theirs from then on;
   *  clearing it hands it back to the derivation (an empty target is not a
   *  target, so the empty string can only mean "use the default again"). */
  function onInheritRepoFieldChange(value: string) {
    setInheritRepoEdit(value === "" ? null : value);
  }

  function onInheritFileFieldChange(value: string) {
    setInheritFileEdit(value === "" ? null : value);
  }

  /** Roadmap 045, corrected 2026-07-26: any hand-toggle of the checkbox — on or
   *  off — is the user's for the session; see `inheritAuto` above. */
  function onInheritAutoFieldChange(value: boolean) {
    setInheritAutoEdit(value);
  }

  /**
   * Roadmap 045 — resolves the org's inherited config the way a real
   * `inheritConfig` run does: ONE exact file (`inheritConfigFileName`) out of
   * ONE exact repository (`inheritConfigRepoName`, templated against the repo
   * that was just loaded), through the same browser transports and platform
   * context the repo load itself used. No location probing chain: Renovate has
   * no such chain here, and inventing one would model a bot that doesn't exist.
   *
   * Deliberately NOT given the form's branch/tag: `inheritConfigRepoName` is a
   * different repository, and a real run reads its default branch.
   *
   * Returns the inherited-config object the run that follows should use — the
   * probe's when it found one, otherwise whatever the layer already held, so a
   * miss never destroys a layer the user pasted.
   */
  async function probeInheritedConfig(args: {
    platform: RepoPlatform;
    endpoint: string;
    /** The repo slug that was actually loaded — the templating authority. */
    loadedRepo: string;
    suppressTokens: boolean;
  }): Promise<Record<string, unknown> | undefined> {
    const target = inheritProbeTarget(inheritFields, args.loadedRepo);
    if (
      !isProbeTargetResolved(target) ||
      !isValidRepoRefPart(target.repo) ||
      !isValidRepoRefPart(target.file)
    ) {
      setInheritProbe({
        status: "unreachable",
        target,
        detail: "that is not a repository and file name.",
      });
      return inheritedParse.config;
    }
    try {
      const raw = await loadRepoFile(
        {
          platform: args.platform,
          repo: target.repo,
          path: target.file,
          endpoint: args.endpoint || undefined,
        },
        { suppressTokens: args.suppressTokens },
      );
      if (raw === null) {
        // Exactly what a real run does with `inheritConfigStrict` off: carry on
        // without the layer. The note says so (and says the opposite when the
        // pasted global config sets strict).
        setInheritProbe({ status: "missing", target });
        if (inheritPolicy.strict) {
          revealInheritedStage();
        }
        return inheritedParse.config;
      }
      // The layer is a text input (008), so the file's own text goes in
      // verbatim — including its formatting, which the user may now edit. Set
      // directly rather than through `applyInheritedText`: this text DOES have
      // an origin, and that is the one thing that path exists to forget.
      setInheritedText(raw);
      setInheritProbe({ status: "loaded", target });
      revealInheritedStage();
      return parseLayerJson(raw).config;
    } catch (err) {
      const e = err as { err?: { message?: string } };
      const detail = e?.err?.message ?? (err instanceof Error ? err.message : String(err));
      setInheritProbe({ status: "unreachable", target, detail: `${detail}.` });
      if (inheritPolicy.strict) {
        revealInheritedStage();
      }
      return inheritedParse.config;
    }
  }

  return {
    inheritedText,
    inheritedParse,
    applyInheritedText,
    inheritAuto,
    inheritFields,
    inheritState,
    onInheritAutoFieldChange,
    onInheritRepoFieldChange,
    onInheritFileFieldChange,
    probeInheritedConfig,
  };
}
