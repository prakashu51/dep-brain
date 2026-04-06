import path from "node:path";
import { readJsonFile } from "./file-parser.js";

export interface DepBrainConfig {
  ignore: {
    dependencies: string[];
    devDependencies: string[];
    duplicates: string[];
    outdated: string[];
    risks: string[];
    unused: string[];
  };
  policy: {
    minScore: number;
    failOnDuplicates: boolean;
    failOnOutdated: boolean;
    failOnRisks: boolean;
    failOnUnused: boolean;
  };
  report: {
    maxSuggestions: number;
  };
}

export interface DepBrainConfigOverrides {
  ignore?: Partial<DepBrainConfig["ignore"]>;
  policy?: Partial<DepBrainConfig["policy"]>;
  report?: Partial<DepBrainConfig["report"]>;
}

export const defaultConfig: DepBrainConfig = {
  ignore: {
    dependencies: [],
    devDependencies: [],
    duplicates: [],
    outdated: [],
    risks: [],
    unused: []
  },
  policy: {
    minScore: 0,
    failOnDuplicates: false,
    failOnOutdated: false,
    failOnRisks: false,
    failOnUnused: false
  },
  report: {
    maxSuggestions: 5
  }
};

export async function loadDepBrainConfig(
  rootDir: string,
  configPath?: string
): Promise<DepBrainConfig> {
  const resolvedPath = path.resolve(rootDir, configPath ?? "depbrain.config.json");

  try {
    const loaded = await readJsonFile<Partial<DepBrainConfig>>(resolvedPath);
    return normalizeConfig(loaded);
  } catch {
    return defaultConfig;
  }
}

function normalizeConfig(loaded: Partial<DepBrainConfig>): DepBrainConfig {
  return {
    ignore: {
      dependencies: loaded.ignore?.dependencies ?? defaultConfig.ignore.dependencies,
      devDependencies:
        loaded.ignore?.devDependencies ?? defaultConfig.ignore.devDependencies,
      duplicates: loaded.ignore?.duplicates ?? defaultConfig.ignore.duplicates,
      outdated: loaded.ignore?.outdated ?? defaultConfig.ignore.outdated,
      risks: loaded.ignore?.risks ?? defaultConfig.ignore.risks,
      unused: loaded.ignore?.unused ?? defaultConfig.ignore.unused
    },
    policy: {
      minScore: loaded.policy?.minScore ?? defaultConfig.policy.minScore,
      failOnDuplicates:
        loaded.policy?.failOnDuplicates ?? defaultConfig.policy.failOnDuplicates,
      failOnOutdated:
        loaded.policy?.failOnOutdated ?? defaultConfig.policy.failOnOutdated,
      failOnRisks: loaded.policy?.failOnRisks ?? defaultConfig.policy.failOnRisks,
      failOnUnused:
        loaded.policy?.failOnUnused ?? defaultConfig.policy.failOnUnused
    },
    report: {
      maxSuggestions:
        loaded.report?.maxSuggestions ?? defaultConfig.report.maxSuggestions
    }
  };
}
