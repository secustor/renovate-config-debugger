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
      ["/color$/", "background", "fill", "stroke"],
      {
        ignoreFunctions: false,
        ignoreValues: [
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
          'Use a var() design token instead of a raw color value for "${property}" — see the :root token block in packages/app/src/index.css.',
      },
    ],
    // Catches var(--tyop)-style typos: every var() reference must resolve to
    // a custom property declared somewhere in the same file (the :root token
    // block below).
    "csstools/value-no-unknown-custom-properties": true,
  },
};
