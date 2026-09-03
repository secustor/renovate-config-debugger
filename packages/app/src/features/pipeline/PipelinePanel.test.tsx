import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
// jsdom has no `matchMedia`, and the rail's `prefersReducedMotion` calls it on mount.
import { stubMatchMedia } from "@tools/test/jsdom-stubs";
import { CONNECT_OFFER, EMPTY_VIEW } from "@tools/test/repo-deps";
import { traceResult } from "@tools/test/trace-result";
import type { StageStatus } from "@renovate-config-debugger/engine";
import { PipelinePanel } from "./PipelinePanel";

/**
 * The migrate stage card's empty note is a CLAIM about the config ("already
 * uses current option names"), so it may only be made for a migrate that ran
 * and rewrote nothing — a skipped or errored stage has no steps either, and
 * StageDiff is saying the opposite two rows above it.
 */

function renderMigrate(migrate: StageStatus) {
  const result = traceResult({ stageStatus: { ...traceResult().stageStatus, migrate } });
  return render(
    <PipelinePanel
      phase="config"
      onSelectPhase={vi.fn()}
      extract={EMPTY_VIEW}
      repoConnect={CONNECT_OFFER}
      onRetryExtract={vi.fn()}
      onOpenDependencies={vi.fn()}
      result={result}
      selectedStage="migrate"
      onSelectStage={vi.fn()}
      deferredStage="migrate"
      effectiveKeys={0}
      migrateSteps={[]}
      migrateStepperMounted={false}
      finalMigrated={undefined}
      migrationStepIndex={0}
      onMigrationStepChange={vi.fn()}
      globalText=""
      onGlobalTextChange={vi.fn()}
      inheritedText=""
      onInheritedTextChange={vi.fn()}
      globalParse={{}}
      inheritedParse={{}}
      inheritState={null}
    />,
  );
}

const NOTE = "already uses current option names";

describe("the migrate stage's no-rewrites note", () => {
  beforeEach(() => {
    stubMatchMedia(false);
  });

  it("is made for a migrate that ran and rewrote nothing", () => {
    const view = renderMigrate("ok");
    expect(view.container.textContent).toContain(NOTE);
  });

  it("is withheld when the stage was skipped because parsing failed", () => {
    const view = renderMigrate("skipped");
    expect(view.container.textContent).not.toContain(NOTE);
    expect(view.container.textContent).toContain("skipped");
  });

  it("is withheld when the stage itself errored", () => {
    const view = renderMigrate("error");
    expect(view.container.textContent).not.toContain(NOTE);
  });
});
