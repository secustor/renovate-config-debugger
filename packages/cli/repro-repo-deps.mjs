import { createServer } from "vite";

const root =
  "/Users/secustor/repos/secustor/renovate-config-debugger/default/.claude/worktrees/ghost-row-repo-deps";
const configFile = `${root}/packages/cli/vite.config.ts`;

const server = await createServer({
  configFile,
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, watch: null },
});

try {
  const engine = await server.ssrLoadModule(`${root}/packages/engine/src/index.ts`);
  const req = { platform: "github", repo: "renovatebot/github-action" };
  const tree = await engine.fetchRepoTree(req);
  console.log("tree paths:", tree.paths.length, "truncated:", tree.truncated);
  const candidates = tree.paths.filter(
    (p) =>
      !/(^|\/)(node_modules|bower_components)\//.test(p) &&
      engine.matchManagersForFile(p, { among: engine.EXTRACTABLE_MANAGERS }).length > 0,
  );
  console.log("candidates:", candidates);
  for (const path of candidates.slice(0, 10)) {
    let content = null;
    try {
      content = await engine.fetchRepoFile({ ...req, path });
    } catch (err) {
      console.log(path, "FETCH THREW:", err.message);
      continue;
    }
    if (content === null) {
      console.log(path, "-> content null");
      continue;
    }
    const outcome = await engine.extractDeps({ fileName: path, content });
    if (outcome.ok) {
      console.log(path, "-> OK", outcome.file.manager, outcome.file.deps.length, "deps");
    } else {
      console.log(path, "-> FAIL", outcome.reason, "|", outcome.message);
    }
  }
} finally {
  await server.close();
}
