/**
 * Roadmap 075 (iteration 6): the pin model — what a pin carries into a share
 * link, what it accepts back out of one, and how it names itself.
 */
import { describe, expect, test } from "vitest";
import { EMPTY_FORM } from "./form";
import { MAX_PINS, pinContext, pinFormFromShareFields, pinName, pinsFromShareFields } from "./pins";
import { pinShareFields } from "./pins";

function ids(): () => string {
  let n = 0;
  return () => `pin-${++n}`;
}

test("a pin's share fields are its non-empty descriptor fields, and they round-trip", () => {
  const form = { ...EMPTY_FORM, packageName: "react", currentValue: "17.0.0", newValue: "18.0.0" };
  const fields = pinShareFields(form);
  expect(fields).toEqual({ packageName: "react", currentValue: "17.0.0", newValue: "18.0.0" });
  expect(pinFormFromShareFields(fields)).toEqual(form);
});

test("a field a link invented is dropped — a link may not add form fields", () => {
  const form = pinFormFromShareFields({ packageName: "react", nonsense: "x" });
  expect(form).toEqual({ ...EMPTY_FORM, packageName: "react" });
  expect("nonsense" in form).toBe(false);
});

describe("the pins a link installs", () => {
  test("keeps the descriptors that identify something and drops the rest", () => {
    const pins = pinsFromShareFields(
      [{ packageName: "react" }, { nothing: "useful" }, { depName: "lodash" }],
      ids(),
    );
    expect(pins.map((pin) => pin.form.packageName || pin.form.depName)).toEqual([
      "react",
      "lodash",
    ]);
    expect(pins.map((pin) => pin.id)).toEqual(["pin-1", "pin-2"]);
  });

  test("never installs more than the cap, however many the link carries", () => {
    const many = Array.from({ length: MAX_PINS + 5 }, (_, i) => ({ packageName: `pkg-${i}` }));
    expect(pinsFromShareFields(many, ids())).toHaveLength(MAX_PINS);
  });
});

describe("how a pin names itself", () => {
  test("packageName leads, depName stands in, and neither is an honest label", () => {
    expect(pinName({ ...EMPTY_FORM, packageName: "react", depName: "react-dom" })).toBe("react");
    expect(pinName({ ...EMPTY_FORM, depName: "react-dom" })).toBe("react-dom");
    expect(pinName(EMPTY_FORM)).toBe("(no package name)");
  });

  test("the muted line prefers the run's own updateType over the stored one", () => {
    const form = { ...EMPTY_FORM, manager: "npm", updateType: "patch" };
    expect(pinContext(form, "minor")).toBe("npm · minor");
    expect(pinContext(form, "")).toBe("npm · patch");
    // A descriptor that names only a datasource still reads as something.
    expect(pinContext({ ...EMPTY_FORM, datasource: "docker" }, "major")).toBe("docker · major");
  });
});
