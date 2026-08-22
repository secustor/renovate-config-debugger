import type { Dispatch, SetStateAction } from "react";
import { Term } from "@/components/glossary";
import { MANAGER_LIST_ID } from "./datalist-ids";
import { Field } from "./Field";
import { FieldGroup } from "./FieldGroup";
import { countSet, GROUP_KEYS } from "./field-groups";
import type { FormState } from "./form";
import { MultiValueInput } from "./MultiValueInput";

interface GroupProps {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  open: boolean;
  onToggle: () => void;
}

/** Every label wears the glossary hover: these are Renovate's own descriptor
 *  fields, and the card is where "which matcher reads this" is answered
 *  without leaving the form. It is the app's richer form of the design's
 *  `title` tooltips, and it is keyboard-reachable, which a title is not. */
function RepoGroup({
  form,
  setForm,
  open,
  onToggle,
  managerNames,
}: GroupProps & { managerNames: readonly string[] | null }) {
  return (
    <FieldGroup
      title="Where it lives in your repo"
      count={countSet(form, GROUP_KEYS.repo)}
      open={open}
      onToggle={onToggle}
    >
      <Field
        label={<Term id="manager">manager</Term>}
        value={form.manager}
        onChange={(v) => setForm({ ...form, manager: v })}
        placeholder={
          managerNames === null
            ? "(unset) — type to search"
            : `(unset) — type to search ${managerNames.length} managers`
        }
        datalistId={MANAGER_LIST_ID}
      />
      <Field
        label={<Term id="simPackageFile">packageFile</Term>}
        value={form.packageFile}
        onChange={(v) => setForm({ ...form, packageFile: v })}
        placeholder="package.json"
      />
      <Field
        label={<Term id="simDepType">depType</Term>}
        value={form.depType}
        onChange={(v) => setForm({ ...form, depType: v })}
        placeholder="dependencies"
      />
      <Field
        label={<Term id="simDepName">depName</Term>}
        value={form.depName}
        onChange={(v) => setForm({ ...form, depName: v })}
        placeholder="= packageName"
      />
    </FieldGroup>
  );
}

function SourceGroup({ form, setForm, open, onToggle }: GroupProps) {
  return (
    <FieldGroup
      title="Where it comes from"
      count={countSet(form, GROUP_KEYS.source)}
      open={open}
      onToggle={onToggle}
    >
      {/* Roadmap 015/047: sourceUrl was the decisive matcher in two of the
          persona study's three problems, so it leads its group — and the
          group's own question ("where it comes from") is the scent the old
          drawer's summary line had to spell out. */}
      <Field
        label={<Term id="simSourceUrl">sourceUrl</Term>}
        value={form.sourceUrl}
        onChange={(v) => setForm({ ...form, sourceUrl: v })}
        placeholder="https://github.com/lodash/lodash"
      />
      <MultiValueInput
        name="registryUrls"
        label={<Term id="simRegistryUrls">registryUrls</Term>}
        value={form.registryUrls}
        onChange={(v) => setForm({ ...form, registryUrls: v })}
        placeholder="add URL, press ⏎"
      />
      <Field
        label={<Term id="simRepository">repository</Term>}
        value={form.repository}
        onChange={(v) => setForm({ ...form, repository: v })}
        placeholder="your-org/your-repo"
      />
      <Field
        label={<Term id="simBaseBranch">baseBranch</Term>}
        value={form.baseBranch}
        onChange={(v) => setForm({ ...form, baseBranch: v })}
        placeholder="main"
      />
    </FieldGroup>
  );
}

function VersioningGroup({ form, setForm, open, onToggle }: GroupProps) {
  return (
    <FieldGroup
      title="Versioning details"
      count={countSet(form, GROUP_KEYS.versioning)}
      open={open}
      onToggle={onToggle}
    >
      <Field
        label={<Term id="simVersioning">versioning</Term>}
        value={form.versioning}
        onChange={(v) => setForm({ ...form, versioning: v })}
        placeholder="semver"
      />
      <Field
        label={<Term id="simCurrentVersion">currentVersion</Term>}
        value={form.currentVersion}
        onChange={(v) => setForm({ ...form, currentVersion: v })}
      />
      <Field
        label={<Term id="simLockedVersion">lockedVersion</Term>}
        value={form.lockedVersion}
        onChange={(v) => setForm({ ...form, lockedVersion: v })}
      />
      <MultiValueInput
        name="lockFiles"
        label={<Term id="simLockFiles">lockFiles</Term>}
        value={form.lockFiles}
        onChange={(v) => setForm({ ...form, lockFiles: v })}
        placeholder="add file, press ⏎"
      />
      <MultiValueInput
        name="categories"
        label={<Term id="simCategories">categories</Term>}
        value={form.categories}
        onChange={(v) => setForm({ ...form, categories: v })}
        placeholder="add category, press ⏎"
      />
      <Field
        label={<Term id="simCurrentVersionTimestamp">currentVersionTimestamp</Term>}
        value={form.currentVersionTimestamp}
        onChange={(v) => setForm({ ...form, currentVersionTimestamp: v })}
        placeholder="2024-01-01T00:00:00.000Z"
      />
    </FieldGroup>
  );
}

/** Roadmap 079: everything the sentence doesn't say, in three named groups —
 *  one open at a time, the index owned by the caller. */
export function FieldGroups({
  form,
  setForm,
  managerNames,
  openGroup,
  onOpenGroupChange,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  managerNames: readonly string[] | null;
  /** -1 = all closed, which is how the form opens. */
  openGroup: number;
  onOpenGroupChange: (index: number) => void;
}) {
  const toggle = (index: number) => onOpenGroupChange(openGroup === index ? -1 : index);
  return (
    <div className="sim-groups">
      <RepoGroup
        form={form}
        setForm={setForm}
        managerNames={managerNames}
        open={openGroup === 0}
        onToggle={() => toggle(0)}
      />
      <SourceGroup
        form={form}
        setForm={setForm}
        open={openGroup === 1}
        onToggle={() => toggle(1)}
      />
      <VersioningGroup
        form={form}
        setForm={setForm}
        open={openGroup === 2}
        onToggle={() => toggle(2)}
      />
    </div>
  );
}
