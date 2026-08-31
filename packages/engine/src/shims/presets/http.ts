/**
 * Browser shim for renovate/dist/config/presets/http/index.js.
 * A generic `http`-hosted preset is not fetched in the browser (arbitrary
 * endpoints rarely serve CORS, and the transport is out of scope for 010), but
 * manual injection still lets the user supply its content by hand.
 */
import { makeInjectableGetPreset } from "./host-transport";
import { makeUnsupportedGetPreset } from "./unsupported";

const fallback = makeUnsupportedGetPreset("http");

// The helper's `presetName = "default"` fallback is unreachable here: upstream's
// `config/presets/parse.js` always hands an http preset `presetName: ""`, and a
// destructuring default does not fire on an empty string.
export const getPreset = makeInjectableGetPreset("http", (repo) => fallback({ repo }));
