/**
 * SessionStart — install the toolchain and the workspace deps once per
 * session (startup, resume, clear, compact), so the first command a session
 * runs isn't the one that discovers node_modules is missing or stale.
 */
import { provision } from "./utils/provision.ts";

const ok = await provision();
if (!ok) {
  process.exit(1);
}
