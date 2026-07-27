import { type Dispatch, Fragment, type SetStateAction } from "react";
import { Term } from "@/components/glossary";
import { SummaryDrawer } from "./SummaryDrawer";
import { MANAGER_LIST_ID } from "./datalist-ids";
import { Field } from "./Field";
import type { FormState } from "./form";

/** Roadmap 047: the "More about this update" drawer's computed abstract — the
 *  values it currently holds, so a wrong quick-fill is catchable without
 *  opening it, and `sourceUrl`'s scent (015's decisive matcher) survives its
 *  demotion out of the primary grid. */
function MoreFieldsSummary({ form }: { form: FormState }) {
  const shown: [string, string][] = [
    ["manager", form.manager],
    ["depType", form.depType],
    ["packageFile", form.packageFile],
    ["sourceUrl", form.sourceUrl],
  ];
  return (
    <>
      {shown.map(([key, value], i) => (
        <Fragment key={key}>
          {i > 0 ? " · " : null}
          {key} <span className="stat">{value.trim() === "" ? "—" : value.trim()}</span>
        </Fragment>
      ))}
      {" · versioning, lock files, categories, age…"}
    </>
  );
}

function MoreFieldsGrid({
  form,
  setForm,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
}) {
  return (
    <div className="sim-form">
      <Field
        label="manager"
        value={form.manager}
        onChange={(v) => setForm({ ...form, manager: v })}
        placeholder="(unset) — type to search"
        datalistId={MANAGER_LIST_ID}
      />
      {/* Roadmap 015/047: sourceUrl was the decisive matcher in two of the
          persona study's three problems — it sits first among the text
          fields here, and the drawer's summary line always shows its
          value, so demoting it costs no scent. */}
      <Field
        label={<Term id="simSourceUrl">sourceUrl</Term>}
        value={form.sourceUrl}
        onChange={(v) => setForm({ ...form, sourceUrl: v })}
        placeholder="https://github.com/facebook/react — the DEPENDENCY's repo"
      />
      <Field
        label="depName"
        value={form.depName}
        onChange={(v) => setForm({ ...form, depName: v })}
        placeholder="= packageName"
      />
      <Field
        label="depType"
        value={form.depType}
        onChange={(v) => setForm({ ...form, depType: v })}
        placeholder="dependencies"
      />
      <Field
        label="packageFile"
        value={form.packageFile}
        onChange={(v) => setForm({ ...form, packageFile: v })}
        placeholder="package.json"
      />
      <Field
        label="versioning"
        value={form.versioning}
        onChange={(v) => setForm({ ...form, versioning: v })}
        placeholder="semver"
      />
      <Field
        label="currentVersion"
        value={form.currentVersion}
        onChange={(v) => setForm({ ...form, currentVersion: v })}
      />
      <Field
        label="lockedVersion"
        value={form.lockedVersion}
        onChange={(v) => setForm({ ...form, lockedVersion: v })}
      />
      <Field
        label="lockFiles (comma-separated)"
        value={form.lockFiles}
        onChange={(v) => setForm({ ...form, lockFiles: v })}
        placeholder="package-lock.json"
      />
      <Field
        label="registryUrls (comma-separated)"
        value={form.registryUrls}
        onChange={(v) => setForm({ ...form, registryUrls: v })}
        placeholder="https://registry.npmjs.org"
      />
      <Field
        label="categories (comma-separated)"
        value={form.categories}
        onChange={(v) => setForm({ ...form, categories: v })}
        placeholder="js"
      />
      <Field
        label={<Term id="simRepository">repository</Term>}
        value={form.repository}
        onChange={(v) => setForm({ ...form, repository: v })}
        placeholder="your-org/your-repo — the repo Renovate runs in"
      />
      <Field
        label="baseBranch"
        value={form.baseBranch}
        onChange={(v) => setForm({ ...form, baseBranch: v })}
        placeholder="main"
      />
      <Field
        label="currentVersionTimestamp"
        value={form.currentVersionTimestamp}
        onChange={(v) => setForm({ ...form, currentVersionTimestamp: v })}
        placeholder="2024-01-01T00:00:00.000Z"
      />
    </div>
  );
}

/** Roadmap 047: everything a quick-fill pre-fills, and everything 015 kept
 *  behind "More fields", in ONE drawer whose summary line shows what it
 *  holds. */
export function MoreFieldsDrawer({
  form,
  setForm,
  open,
  onToggle,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  return (
    <SummaryDrawer
      className="sim-drawer"
      title="More about this update"
      summary={<MoreFieldsSummary form={form} />}
      open={open}
      onToggle={onToggle}
    >
      <MoreFieldsGrid form={form} setForm={setForm} />
    </SummaryDrawer>
  );
}
