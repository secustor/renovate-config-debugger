import type { ReactNode } from "react";
import type { OptionIndex } from "@renovate-config-debugger/engine";
import { OptionDocsProvider } from "@/components/option-docs";
import { RunViewContext, type RunView } from "@/app/run-view-context";

/**
 * Roadmap 086: the app's two page-level providers, composed once. Its own
 * component so App's JSX keeps the depth the ratchet allows — the provider
 * nesting is plumbing, not layout, and it should not cost the layout a level.
 */
export function AppProviders({
  optionIndex,
  runView,
  children,
}: {
  optionIndex: OptionIndex | null;
  runView: RunView;
  children: ReactNode;
}) {
  return (
    <OptionDocsProvider index={optionIndex}>
      <RunViewContext.Provider value={runView}>{children}</RunViewContext.Provider>
    </OptionDocsProvider>
  );
}
