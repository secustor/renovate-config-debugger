import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import rule from "./use-transient-value.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { lang: "ts" } },
});

ruleTester.run("use-transient-value", rule, {
  valid: [
    // already using the hooks
    "function C() { const [copied, flash] = useTransientFlag(1500); }",
    // ---- both of these are real sites in this repo, and neither is a receipt.
    // A DEBOUNCE only ever SCHEDULES the set (`PresetTree`'s filter box):
    "function C() { const id = setTimeout(() => setQuery(rawQuery), 150); }",
    // …and so does a close-delay (`hover-card-hooks`): nothing set `anchor`
    // in this block, so there is no receipt to clear.
    "function hide() { window.clearTimeout(t.current); t.current = window.setTimeout(() => setAnchor(null), 250); }",
    // a timeout that does real work
    "function C() { setToast('x'); setTimeout(() => { void refetch(); }, 1000); }",
    // the scheduled setter is a DIFFERENT one from the direct set
    "function C() { setToast('x'); setTimeout(() => setOther(null), 100); }",
    // a direct set with no scheduled clear at all
    "function C() { setToast('x'); log('shown'); }",
  ],
  invalid: [
    // `RuleSimulator`'s pin receipt
    {
      code: "function pin() { setJustPinned(true); window.clearTimeout(t.current); t.current = window.setTimeout(() => setJustPinned(false), 2000); }",
      errors: [{ messageId: "useTransientValue" }],
    },
    // `use-app-messages`' toast
    {
      code: "function showToast(m) { setToast(m); window.clearTimeout(t.current); t.current = window.setTimeout(() => setToast(null), TOAST_MS); }",
      errors: [{ messageId: "useTransientValue" }],
    },
    // `ShareButton`, the bare form with no held handle — the leak this closes
    {
      code: "function share() { setCopied(true); setTimeout(() => setCopied(false), 1500); }",
      errors: [{ messageId: "useTransientValue" }],
    },
    // block-bodied callback
    {
      code: "function share() { setPopUrl(url); setTimeout(() => { setPopUrl(null); }, 2600); }",
      errors: [{ messageId: "useTransientValue" }],
    },
  ],
});
