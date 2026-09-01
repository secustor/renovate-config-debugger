import type { AdvancedZoneProps } from "./AdvancedZone";
import { AddHostForm } from "./AddHostForm";
import { CustomHostRow, GithubHostRow, HostTokenRow } from "./HostRows";
import { isValidToken } from "@/lib/input-schemas";

/**
 * The credentials this browser tab is carrying, one row per host — the shape
 * `hostRules` has in a real config, which is the vocabulary a reader who needs
 * this at all already has.
 */
export function CredentialsList({
  hostTokens,
  customHostRules,
  displayPlatform,
  oauthConfigured,
  signedIn,
  authUser,
  onSignIn,
  onSignOut,
}: Pick<
  AdvancedZoneProps,
  | "hostTokens"
  | "customHostRules"
  | "displayPlatform"
  | "oauthConfigured"
  | "signedIn"
  | "authUser"
  | "onSignIn"
  | "onSignOut"
>) {
  const github = hostTokens.find((host) => host.id === "github");
  const others = hostTokens.filter((host) => host.id !== "github");
  // A host that has a canonical row here must never also become a rule — the
  // add form routes it to that row's token instead.
  const canonical = new Map(hostTokens.map((host) => [host.host, host] as const));
  return (
    <div className="host-list">
      {github ? (
        <GithubHostRow
          host={github}
          isPlatform={displayPlatform === "github"}
          oauthConfigured={oauthConfigured}
          signedIn={signedIn}
          avatarUrl={authUser?.avatarUrl}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
        />
      ) : null}
      {others
        .filter((host) => host.value !== "")
        .map((host) => (
          <HostTokenRow key={host.id} host={host} />
        ))}
      {customHostRules.rules.map((rule) => (
        <CustomHostRow
          key={rule.host}
          rule={rule}
          onRemove={() => customHostRules.removeRule(rule.host)}
        />
      ))}
      <AddHostForm
        onAdd={(host, hostType, token) => {
          const match = canonical.get(host);
          if (match) {
            match.onChange(token);
            return;
          }
          customHostRules.addRule(host, hostType, token);
        }}
      />
      {/* Roadmap 030: the "header injection" rule (control characters, incl.
          CR/LF, or an unreasonable length) — a token failing this was never
          written to storage (see `useHostTokens`). */}
      {hostTokens
        .filter((host) => host.value && !isValidToken(host.value))
        .map((host) => (
          <p className="layer-editor-error" key={host.id}>
            {host.label} token contains characters that can&apos;t be sent in a request header, or
            is too long — it was not saved.
          </p>
        ))}
    </div>
  );
}
