// Enforces the design-token discipline established in packages/app/src/index.css
// (commits d35c866 + d0a34d2): color-bearing declarations must go through a
// var() token from the :root palette, never a raw literal. This config has ONE
// job — token enforcement. No stylelint-config-standard here; the repo's
// formatter (oxfmt) already owns style/formatting concerns.
export default {
  plugins: ["stylelint-declaration-strict-value", "stylelint-value-no-unknown-custom-properties"],
  rules: {
    // Bans raw hex/named colors and inline light-dark() on color-bearing
    // properties — they must reference a var() token instead.
    //
    // `ignoreFunctions: false` is deliberate, not an oversight: the plugin's
    // default (`true`) treats ANY value that is a single wrapping function
    // call as exempt — which would ALSO exempt a raw `light-dark(#fff, #000)`,
    // since it parses as one function call. That is exactly the loophole this
    // rule exists to close, so function calls are re-enabled for scrutiny and
    // the one legitimate function shape (color-mix of a var() token) is
    // allowed explicitly below instead.
    "scale-unlimited/declaration-strict-value": [
      // `border-radius` joined the colour properties once the radius scale was
      // tokenized: four values accounted for 88 of the stylesheet's radius
      // declarations, and nothing guarded them — this rule's enforcement was
      // colour-only, which is exactly how they drifted to four in the first
      // place. The genuine one-offs are allow-listed below rather than
      // tokenized, so they read as a short, deliberate exception list instead
      // of as silent drift.
      ["/color$/", "background", "fill", "stroke", "border-radius"],
      {
        ignoreFunctions: false,
        ignoreValues: [
          // Radius values that are not part of the scale and should not be:
          // `0` and `50%` are geometry (a square corner, a circle), and the
          // four pixel one-offs each serve a single element.
          "0",
          "50%",
          "2px",
          "3px",
          "5px",
          "10px",
          // Non-color keywords every color-bearing property may legitimately
          // carry.
          "transparent",
          "currentColor",
          "inherit",
          "none",
          // color-mix(...) expressions that blend a var() token — the app's
          // hover-darken and translucent-stripe pattern (e.g. `color-mix(in
          // srgb, var(--accent) 88%, #000)`). The var() IS the token; the
          // blend target/opacity is incidental to the mix, not a color
          // literal standing alone. Inline light-dark(...) is deliberately
          // NOT allowed here — that is exactly what this rule bans outside
          // :root.
          "/^color-mix\\(/",
        ],
        message:
          'Use a var() design token instead of a raw value for "${property}" — see the :root token block in packages/app/src/index.css.',
      },
    ],
    // Catches var(--tyop)-style typos: every var() reference must resolve to
    // a declared custom property — in the same file (component-local tokens),
    // or in the :root token block, which lives in index.css while the
    // consuming rules live in the split styles/ files (050's deferred split).
    "csstools/value-no-unknown-custom-properties": [
      true,
      { importFrom: ["packages/app/src/index.css"] },
    ],
  },
};
