/**
 * The jsdom projects' setup file (see `vitest.config.ts`).
 *
 * Beside the config rather than under `tools/test` with the fixture harnesses:
 * it imports `@testing-library/react`, which is this package's devDependency
 * and does not resolve from outside it.
 *
 * vitest runs without `globals`, so React Testing Library's automatic cleanup
 * never registers itself — without this the previous test's DOM stays mounted
 * and the next `getBy*` sees two of everything. Forty-seven suites used to
 * register `afterEach(cleanup)` themselves, most of them re-stating this
 * paragraph; the two jsdom projects declare it once here instead. The "unit"
 * project is node-env and renders nothing, which is why this is per-project
 * rather than global.
 *
 * A suite with teardown of its own keeps its own `afterEach` — this one runs
 * alongside it.
 */
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
