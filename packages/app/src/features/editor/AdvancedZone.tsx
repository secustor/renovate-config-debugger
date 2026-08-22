import type { CustomHostRules, HostTokenField } from "@/hooks/use-host-tokens";
import type { StoredUser } from "@/platform/oauth";
import { CredentialsList } from "./CredentialsList";
import { credentialsLine } from "./credentials-summary";
import { HostAccessSection } from "./HostAccessSection";

/**
 * Roadmap 040/076 — the footer drawer under the editor.
 *
 * 040 made it the single collapsed home of everything a typical repo user never
 * touches. 076 (design turn 18e/18d) narrows that to what it is actually good
 * at: **hosts & credentials**. The two self-hosted config layers moved to the
 * pipeline stage nodes that report on them (`StageLayerEditor`), and what is
 * left is the fetch context — which host `local>` presets resolve against — and
 * a `hostRules`-shaped list of the credentials this tab is carrying.
 *
 * Its shape is Proposal F's (`Proposal F - Integrated Shell.dc.html`): a
 * one-line bar at the FOOT of the config pane — caret, title, and the
 * credentials line (`github.com ✓` / `github.com anonymous · +N`) pinned right
 * — whose panel opens UPWARD, above the bar, so the bar never moves. The
 * `<details>` keeps DOM order (summary first, for the accessibility tree) and
 * the flip is `flex-direction: column-reverse` on the open drawer, which is why
 * the panel is one wrapper div rather than loose children.
 *
 * It still owns no state that outlives it: the drawer and the host section are
 * controlled by App (an untrusted-endpoint guard opens the host section so the
 * field it tells the user to review is actually on screen). The two disclosures
 * INSIDE the credentials list — reveal the GitHub PAT input, open the add-host
 * form — are local, because nothing outside ever needs to open them.
 */

/** The zone's whole prop contract. Exported because the two sections it is made
 *  of (`HostAccessSection`, `CredentialsList`) take `Pick`s of it — they render
 *  the zone's own props, so the contract is stated once, here. */
export interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostSectionOpen: boolean;
  onHostSectionOpenChange: (open: boolean) => void;
  displayPlatform: string;
  displayEndpoint: string;
  onPlatformChange: (value: string) => void;
  onEndpointChange: (value: string) => void;
  reflectGlobal: boolean;
  globalPlatform: string | undefined;
  globalEndpoint: string | undefined;
  platformOverride: boolean;
  hasGlobalContext: boolean;
  onUseGlobalValues: () => void;
  usesLocal: boolean;
  platform: string;
  /** Whether OAuth sign-in is configured — the github.com row is a sign-in
   *  offer where it is, and a token field where it is not (009). */
  oauthConfigured: boolean;
  signedIn: boolean;
  /** Roadmap 077 (Proposal F): the signed-in github.com row shows WHO is
   *  signed in — the same avatar the header trigger wears. Cosmetic and
   *  allowed to be null (the profile fetch may fail); the row then keeps its
   *  plain "signed in ✓". */
  authUser: StoredUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
  hostTokens: HostTokenField[];
  /** Roadmap 076: the credentials for hosts `hostTokens` does not name — the
   *  list plus its add/remove, passed as one prop because the three are one
   *  hook's return and never travel apart. */
  customHostRules: CustomHostRules;
  /** Roadmap 076: takes the reader to the global-config stage on the Pipeline
   *  tab, where the two merge layers are edited now. Always a live link: the
   *  zone is shell-only (ConfigColumn renders it once a result exists), so the
   *  pipeline it points at is always there. */
  onShowPipelineLayers: () => void;
}

/** The panel's opening line (Proposal F verbatim): what the drawer is FOR, and
 *  the one sentence that says where the two merge layers went. */
function AdvancedIntro({ onShowPipelineLayers }: Pick<Props, "onShowPipelineLayers">) {
  return (
    <p className="advanced-intro">
      Credentials for fetching presets and dependency data. Self-hosted bot layers (global,
      inherited) live on the{" "}
      <button type="button" className="digest-link" onClick={onShowPipelineLayers}>
        Pipeline track
      </button>
      .
    </p>
  );
}

/** The drawer's collapsed bar: the title, and the credentials line pinned
 *  right — `github.com ✓` / `github.com anonymous`, ` · +N` for other hosts. */
function AdvancedSummary({ line }: { line: string }) {
  return (
    <summary>
      Advanced — hosts &amp; credentials
      <span className="advanced-context">{line}</span>
    </summary>
  );
}

export function AdvancedZone({
  open,
  onOpenChange,
  hostSectionOpen,
  onHostSectionOpenChange,
  displayPlatform,
  displayEndpoint,
  onPlatformChange,
  onEndpointChange,
  reflectGlobal,
  globalPlatform,
  globalEndpoint,
  platformOverride,
  hasGlobalContext,
  onUseGlobalValues,
  usesLocal,
  platform,
  oauthConfigured,
  signedIn,
  authUser,
  onSignIn,
  onSignOut,
  hostTokens,
  customHostRules,
  onShowPipelineLayers,
}: Props) {
  const line = credentialsLine({
    tokens: hostTokens,
    signedIn: oauthConfigured && signedIn,
    platform: displayPlatform,
    endpoint: displayEndpoint,
    customHostCount: customHostRules.rules.length,
  });
  return (
    <details
      className="advanced-zone"
      open={open}
      onToggle={(e) => onOpenChange(e.currentTarget.open)}
    >
      <AdvancedSummary line={line} />

      {/* One wrapper on purpose: the open drawer is `column-reverse`, so the
          panel renders ABOVE the summary bar — loose children would each be
          reversed against one another. */}
      <div className="advanced-drawer-body">
        <AdvancedIntro onShowPipelineLayers={onShowPipelineLayers} />

        <HostAccessSection
          open={hostSectionOpen}
          onOpenChange={onHostSectionOpenChange}
          displayPlatform={displayPlatform}
          displayEndpoint={displayEndpoint}
          onPlatformChange={onPlatformChange}
          onEndpointChange={onEndpointChange}
          reflectGlobal={reflectGlobal}
          globalPlatform={globalPlatform}
          globalEndpoint={globalEndpoint}
          platformOverride={platformOverride}
          hasGlobalContext={hasGlobalContext}
          onUseGlobalValues={onUseGlobalValues}
          usesLocal={usesLocal}
          platform={platform}
        />

        <CredentialsList
          hostTokens={hostTokens}
          customHostRules={customHostRules}
          displayPlatform={displayPlatform}
          oauthConfigured={oauthConfigured}
          signedIn={signedIn}
          authUser={authUser}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
        />
      </div>
    </details>
  );
}
