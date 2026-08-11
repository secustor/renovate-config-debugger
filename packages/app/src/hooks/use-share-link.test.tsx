import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import type { TraceResult } from "@renovate-config-debugger/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as ShareModule from "@/lib/share";
import type { DecodeResult, SharePayload } from "@/lib/share";
import { type ShareLinkHost, type SimRequest, useShareLink } from "./use-share-link";

/**
 * Roadmap 068 review — the attribution invariant the decode path is
 * responsible for: a simulation may only ever be attributed to the config the
 * link that requested it produced. Two links, one of which fails to run, is
 * the shape that broke it twice (a failed link's request landing on the NEXT
 * link's result; a failed link losing `autoSimulate` for good), so that is
 * what these drive — through the real hash bookkeeping, with only the codec
 * and the engine's version probe stubbed.
 */

const { payloads } = vi.hoisted(() => ({ payloads: new Map<string, SharePayload>() }));

// The token IS the map key here: what the decoder does with base64url+deflate
// is `share.test.ts`'s subject, not this one's. Everything else in `@/lib/share`
// stays real — `readShareToken`, `decideHashChangeAction` and the run policy
// are exactly what decides whether these decodes happen at all.
vi.mock("@/lib/share", async (importOriginal) => {
  const actual = await importOriginal<typeof ShareModule>();
  return {
    ...actual,
    decodeShareResult: (token: string): Promise<DecodeResult> => {
      const found = payloads.get(token);
      return Promise.resolve(
        found ? { ok: true, payload: found } : { ok: false, reason: "damaged" },
      );
    },
  };
});

// The real one dynamically imports the engine chunk purely to read its version
// string; the decode path only uses it for the drift notice.
vi.mock("@/platform/run", () => ({
  getRenovateVersion: () => Promise.resolve("0.0.0"),
}));

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(() => {
  cleanup();
  payloads.clear();
  history.replaceState(null, "", "/");
});

function traceResult(): TraceResult {
  return {
    events: [],
    finalConfig: { packageRules: [] },
    errors: [],
    warnings: [],
    renovateVersion: "0.0.0",
    stageStatus: {
      global: "ok",
      inherit: "ok",
      parse: "ok",
      migrate: "ok",
      massage: "ok",
      validate: "ok",
      preset: "ok",
      merge: "ok",
    },
    visitedPresets: { merged: [], unmerged: [] },
    platformContext: { platform: "github", endpoint: "https://api.github.com" },
    usedInjections: [],
  };
}

/** What the pipeline returns for a config the parser refuses (engine
 *  `pipeline.ts`): a real, resolved `TraceResult` — `run()` does not throw —
 *  with every later stage skipped and no effective config. */
function parseErrorResult(): TraceResult {
  const ran = traceResult();
  return {
    ...ran,
    finalConfig: undefined,
    errors: [{ topic: "Config error", message: "Invalid JSON (parsing failed)" }],
    stageStatus: {
      ...ran.stageStatus,
      parse: "error",
      migrate: "skipped",
      massage: "skipped",
      validate: "skipped",
      preset: "skipped",
      merge: "skipped",
    },
  };
}

function payload(config: string, sim?: SharePayload["sim"]): SharePayload {
  return { v: 2, renovate: "0.0.0", config, fileName: "renovate.json", sim };
}

const SIM: SharePayload["sim"] = { form: { depName: "react" }, autoSimulate: true };

const noop = () => undefined;

function makeHost(onRun: ShareLinkHost["onRun"]): ShareLinkHost {
  return {
    onRun,
    loadConfigText: noop,
    setFileName: noop,
    setPlatform: noop,
    setEndpoint: noop,
    setGlobalText: noop,
    setInheritedText: noop,
    setPlatformOverride: noop,
    setAdvancedOpen: noop,
    setHostSectionOpen: noop,
    setNotice: noop,
    setSignedIn: noop,
    setAuthUser: noop,
    applyUntrustedGuard: noop,
    pendingViewRef: { current: null },
    // Equal, so a hashchange never has unsaved edits to confirm away.
    contentRef: { current: "" },
    loadedContentRef: { current: "" },
    buildShareState: () =>
      Promise.resolve({
        config: "",
        fileName: "renovate.json",
        platform: "github",
        endpoint: "https://api.github.com",
        renovate: "0.0.0",
      }),
  };
}

function Harness({ host, seen }: { host: ShareLinkHost; seen: { current: SimRequest | null } }) {
  const { simRequest } = useShareLink(null, host);
  useEffect(() => {
    seen.current = simRequest;
  }, [simRequest, seen]);
  return null;
}

/** Opens `#config=<token>` the way a second link arrives over a running
 *  session: the address bar changes and nothing reloads. */
async function openLink(token: string) {
  const from = window.location.href;
  history.replaceState(null, "", `/#config=${token}`);
  await act(async () => {
    window.dispatchEvent(
      new HashChangeEvent("hashchange", { oldURL: from, newURL: window.location.href }),
    );
  });
}

function mount(onRun: ShareLinkHost["onRun"]) {
  const seen: { current: SimRequest | null } = { current: null };
  render(<Harness host={makeHost(onRun)} seen={seen} />);
  return seen;
}

describe("useShareLink", () => {
  it("attributes a link's request to the run that link produced", async () => {
    payloads.set("A", payload('{"a":1}', SIM));
    const ran = traceResult();
    const onRun = vi.fn<ShareLinkHost["onRun"]>().mockResolvedValue(ran);
    history.replaceState(null, "", "/#config=A");

    const seen = mount(onRun);
    await waitFor(() => expect(seen.current).not.toBeNull());

    expect(seen.current?.ranResult).toBe(ran);
    expect(seen.current?.autoSimulate).toBe(true);
  });

  it("attributes nothing to a run that produced no effective config", async () => {
    // The link ships a config with a syntax error: the pipeline stops at parse
    // and returns the trace it has, so the run neither throws nor produces
    // anything to simulate against. Naming that trace pinned the descriptor to
    // an object no later run can equal — the recipient fixed the JSON, ran, and
    // got an empty simulator form with no auto-simulation and no message. The
    // request has to still be applicable to the run that fixes it, which is
    // what a null `ranResult` means (`useShareLinkRequest` holds it).
    payloads.set("A", payload("{oops", SIM));
    const onRun = vi.fn<ShareLinkHost["onRun"]>().mockResolvedValue(parseErrorResult());
    history.replaceState(null, "", "/#config=A");

    const seen = mount(onRun);
    await waitFor(() => expect(seen.current).not.toBeNull());

    expect(seen.current?.ranResult).toBeNull();
    expect(seen.current?.autoSimulate).toBe(true);
  });

  it("never leaves a failed link's request standing for the next link's run", async () => {
    // Link A asks for a simulation and its run throws, so nothing consumes the
    // descriptor. Link B is a different config that asks for no simulation at
    // all — a decode carrying no `sim` is a statement about what belongs on
    // screen, so B's result must not inherit A's dependency. That pair is one
    // no sender ever put in a link.
    payloads.set("A", payload('{"a":1}', SIM));
    payloads.set("B", payload('{"b":2}'));
    const onRun = vi
      .fn<ShareLinkHost["onRun"]>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(traceResult());
    history.replaceState(null, "", "/#config=A");

    const seen = mount(onRun);
    await waitFor(() => expect(onRun).toHaveBeenCalledTimes(1));

    await openLink("B");
    await waitFor(() => expect(onRun).toHaveBeenCalledTimes(2));
    await act(async () => undefined);

    expect(seen.current).toBeNull();
  });

  it("keeps autoSimulate alive when a link's own run fails over a running session", async () => {
    // The other half: the nonce is consumed once, so a link disarmed here is
    // disarmed for good — the sender's intent lost because the recipient's
    // config had a typo in it. The descriptor stays armed and unattributed
    // (`ranResult` null), for the run the user gets after fixing it.
    payloads.set("A", payload('{"a":1}'));
    payloads.set("C", payload('{"c":3}', SIM));
    const onRun = vi
      .fn<ShareLinkHost["onRun"]>()
      .mockResolvedValueOnce(traceResult())
      .mockResolvedValueOnce(null);
    history.replaceState(null, "", "/#config=A");

    const seen = mount(onRun);
    await waitFor(() => expect(onRun).toHaveBeenCalledTimes(1));

    await openLink("C");
    await waitFor(() => expect(seen.current).not.toBeNull());

    expect(onRun).toHaveBeenCalledTimes(2);
    expect(seen.current?.autoSimulate).toBe(true);
    expect(seen.current?.ranResult).toBeNull();
  });
});
