import path from "node:path";
import { readJsonFile } from "./file-parser.js";
import { resolveWithinRoot } from "./path.js";

export interface DepBrainConfig {
  ignore: {
    dependencies: string[];
    devDependencies: string[];
    duplicates: string[];
    outdated: string[];
    risks: string[];
    unused: string[];
    prefixes: string[];
    patterns: string[];
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
  scoring: {
    duplicateWeight: number;
    outdatedWeight: number;
    unusedWeight: number;
    riskWeight: number;
  };
  scan: {
    excludePaths: string[];
  };
}

export interface DepBrainConfigOverrides {
  ignore?: Partial<DepBrainConfig["ignore"]>;
  policy?: Partial<DepBrainConfig["policy"]>;
  report?: Partial<DepBrainConfig["report"]>;
  scoring?: Partial<DepBrainConfig["scoring"]>;
  scan?: Partial<DepBrainConfig["scan"]>;
}

export const defaultConfig: DepBrainConfig = {
  ignore: {
    dependencies: [],
    devDependencies: [],
    duplicates: [],
    outdated: [],
    risks: [],
    unused: [],
    prefixes: [],
    patterns: []
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
  },
  scoring: {
    duplicateWeight: 5,
    outdatedWeight: 3,
    unusedWeight: 4,
    riskWeight: 10
  },
  scan: {
    excludePaths: ["node_modules", "dist", "build", "coverage", ".git"]
  }
};

export async function loadDepBrainConfig(
  rootDir: string,
  configPath?: string
): Promise<DepBrainConfig> {
  const resolvedPath = resolveWithinRoot(
    rootDir,
    configPath ?? "depbrain.config.json"
  );

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
      ),
      prefixes: normalizeStringArray(
        loaded.ignore?.prefixes,
        defaultConfig.ignore.prefixes
      ),
      patterns: normalizeStringArray(
        loaded.ignore?.patterns,
        defaultConfig.ignore.patterns
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
    },
    scoring: {
      duplicateWeight: normalizeNumber(
        loaded.scoring?.duplicateWeight,
        defaultConfig.scoring.duplicateWeight
      ),
      outdatedWeight: normalizeNumber(
        loaded.scoring?.outdatedWeight,
        defaultConfig.scoring.outdatedWeight
      ),
      unusedWeight: normalizeNumber(
        loaded.scoring?.unusedWeight,
        defaultConfig.scoring.unusedWeight
      ),
      riskWeight: normalizeNumber(
        loaded.scoring?.riskWeight,
        defaultConfig.scoring.riskWeight
      )
    },
    scan: {
      excludePaths: normalizeStringArray(
        loaded.scan?.excludePaths,
        defaultConfig.scan.excludePaths
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
