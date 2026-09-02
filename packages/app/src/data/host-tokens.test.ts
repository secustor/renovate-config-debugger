import { describe, expect, it } from "vitest";
import { HOST_TOKENS, platformForHost } from "./host-tokens";

/**
 * The own-key accessor over the host table. A pasted repo reference supplies
 * the host, so an inherited `Object.prototype` member must not read as a known
 * host — that lookup gates the "Unknown host …" notice in `use-repo-load.ts`.
 */
describe("platformForHost", () => {
  it("maps every shipped host to its platform", () => {
    for (const descriptor of HOST_TOKENS) {
      expect(platformForHost(descriptor.host)).toBe(descriptor.id);
    }
  });

  it.for(["constructor", "toString", "valueOf", "__proto__", "example.com"] as const)(
    "%s is not a known host",
    (host) => {
      expect(platformForHost(host)).toBeUndefined();
    },
  );
});
