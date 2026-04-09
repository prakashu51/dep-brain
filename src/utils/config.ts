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
      dependencies: normalizeStringArray(
        loaded.ignore?.dependencies,
        defaultConfig.ignore.dependencies
      ),
      devDependencies:
        normalizeStringArray(
          loaded.ignore?.devDependencies,
          defaultConfig.ignore.devDependencies
        ),
      duplicates: normalizeStringArray(
        loaded.ignore?.duplicates,
        defaultConfig.ignore.duplicates
      ),
      outdated: normalizeStringArray(
        loaded.ignore?.outdated,
        defaultConfig.ignore.outdated
      ),
      risks: normalizeStringArray(
        loaded.ignore?.risks,
        defaultConfig.ignore.risks
      ),
      unused: normalizeStringArray(
        loaded.ignore?.unused,
        defaultConfig.ignore.unused
      )
    },
    policy: {
      minScore: normalizeNumber(
        loaded.policy?.minScore,
        defaultConfig.policy.minScore
      ),
      failOnDuplicates:
        normalizeBoolean(
          loaded.policy?.failOnDuplicates,
          defaultConfig.policy.failOnDuplicates
        ),
      failOnOutdated:
        normalizeBoolean(
          loaded.policy?.failOnOutdated,
          defaultConfig.policy.failOnOutdated
        ),
      failOnRisks: normalizeBoolean(
        loaded.policy?.failOnRisks,
        defaultConfig.policy.failOnRisks
      ),
      failOnUnused:
        normalizeBoolean(
          loaded.policy?.failOnUnused,
          defaultConfig.policy.failOnUnused
        )
    },
    report: {
      maxSuggestions: normalizeNumber(
        loaded.report?.maxSuggestions,
        defaultConfig.report.maxSuggestions
      )
    }
  };
}

function normalizeStringArray(
  value: unknown,
  fallback: string[]
): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value.filter((item): item is string => typeof item === "string");
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
