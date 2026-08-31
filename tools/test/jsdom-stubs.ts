/**
 * The browser APIs jsdom does not implement, stubbed to the answer the app
 * only needs to be given ("no" / do nothing). Six suites carried their own copy
 * of these object literals, two of them with the same comment.
 *
 * Called explicitly from a suite's `beforeAll` rather than installed globally
 * by the jsdom projects' setup file: `stubMatchMedia` PARAMETERIZES the answer
 * (StageRail's reduced-motion tests want `true`), and a blanket stub would
 * silently decide for the suites whose subject is what the app asks matchMedia.
 *
 * Under `tools/test` like the other harnesses: test scaffolding can never ride
 * into the production build.
 */

/** `matchMedia`, answering `matches` to every query. */
export function stubMatchMedia(matches = false): void {
  window.matchMedia = (query: string) =>
    ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

/** A `ResizeObserver` that never fires — enough for the windowing the preset
 *  tree does, which keeps its last known size when nothing reports one. */
export function stubResizeObserver(): void {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/** The two scroll calls jsdom leaves unimplemented and throws on. */
export function stubScrollApis(): void {
  window.scrollTo = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
}
