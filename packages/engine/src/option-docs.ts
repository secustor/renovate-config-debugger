import { getOptions } from "./renovate-adapter";

/** UI-friendly view of one entry of renovate's option metadata. */
export interface OptionDoc {
  name: string;
  description: string;
  type: string;
  subType?: string;
  default?: unknown;
  allowedValues?: string[];
  supportedManagers?: string[];
  supportedPlatforms?: string[];
  /** Only configurable on the self-hosted/global level */
  globalOnly?: boolean;
  experimental?: boolean;
  experimentalDescription?: string;
  deprecationMsg?: string;
  advancedUse?: boolean;
  /** Option names (or ".", managers, update types) this option may appear under */
  parents?: string[];
  /** Deep link into the renovate documentation */
  url: string;
}

export interface OptionIndex {
  options: ReadonlyMap<string, OptionDoc>;
  /**
   * Option names whose object/array-item children are themselves renovate
   * options (packageRules, hostRules, major, npm, …) — derived from the
   * `parents` declarations. Keys of objects nested under anything else
   * (constraints, customEnvVariables, …) are free-form.
   */
  containers: ReadonlySet<string>;
}

let cached: OptionIndex | undefined;

/** Builds (once) an index of renovate's own option metadata for hover docs. */
export function getOptionIndex(): OptionIndex {
  if (cached) {
    return cached;
  }
  const options = new Map<string, OptionDoc>();
  const containers = new Set<string>();
  for (const option of getOptions()) {
    const page = option.globalOnly ? "self-hosted-configuration" : "configuration-options";
    options.set(option.name, {
      name: option.name,
      description: option.description,
      type: option.type,
      subType: "subType" in option ? option.subType : undefined,
      default: option.default,
      allowedValues: option.allowedValues,
      supportedManagers: option.supportedManagers,
      supportedPlatforms: option.supportedPlatforms,
      globalOnly: option.globalOnly,
      experimental: option.experimental,
      experimentalDescription: option.experimentalDescription,
      deprecationMsg: option.deprecationMsg,
      advancedUse: option.advancedUse,
      parents: option.parents,
      url: `https://docs.renovatebot.com/${page}/#${option.name.toLowerCase()}`,
    });
    for (const parent of option.parents ?? []) {
      if (parent !== ".") {
        containers.add(parent);
      }
    }
  }
  cached = { options, containers };
  return cached;
}
