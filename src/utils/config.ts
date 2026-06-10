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
  plugins: {
    enabled: string[];
    paths: string[];
  };
  risk: {
    transitiveBloatThreshold: number;
    typosquattingDistanceThreshold: number;
    staleReleaseDays: number;
    agingReleaseDays: number;
    lowDownloadThreshold: number;
    lowTrustWeightThreshold: number;
    mediumTrustWeightThreshold: number;
    osv: {
      enabled: boolean;
      severityThreshold: "low" | "medium" | "high" | "critical";
      includeDevDependencies: boolean;
    };
  };
  dashboard: {
    outputPath: string;
  };
  notifications: {
    enabled: boolean;
    on: "always" | "failure" | "never";
    slackWebhookEnv: string;
    discordWebhookEnv: string;
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
  runtimeTrace: {
    outputPath: string;
  };
  ownership?: {
    owners: Record<string, string[]>;
  };
}

export interface DepBrainConfigOverrides {
  ignore?: Partial<DepBrainConfig["ignore"]>;
  policy?: Partial<DepBrainConfig["policy"]>;
  report?: Partial<DepBrainConfig["report"]>;
  plugins?: Partial<DepBrainConfig["plugins"]>;
  risk?: Partial<DepBrainConfig["risk"]>;
  dashboard?: Partial<DepBrainConfig["dashboard"]>;
  notifications?: Partial<DepBrainConfig["notifications"]>;
  scoring?: Partial<DepBrainConfig["scoring"]>;
  scan?: Partial<DepBrainConfig["scan"]>;
  runtimeTrace?: Partial<DepBrainConfig["runtimeTrace"]>;
  ownership?: Partial<DepBrainConfig["ownership"]>;
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
  plugins: {
    enabled: [],
    paths: []
  },
  risk: {
    transitiveBloatThreshold: 50,
    typosquattingDistanceThreshold: 2,
    staleReleaseDays: 730,
    agingReleaseDays: 365,
    lowDownloadThreshold: 1000,
    lowTrustWeightThreshold: 6,
    mediumTrustWeightThreshold: 3,
    osv: {
      enabled: false,
      severityThreshold: "high",
      includeDevDependencies: false
    }
  },
  dashboard: {
    outputPath: "depbrain-dashboard.html"
  },
  notifications: {
    enabled: false,
    on: "failure",
    slackWebhookEnv: "DEPBRAIN_SLACK_WEBHOOK_URL",
    discordWebhookEnv: "DEPBRAIN_DISCORD_WEBHOOK_URL"
  },
  scoring: {
    duplicateWeight: 5,
    outdatedWeight: 3,
    unusedWeight: 4,
    riskWeight: 10
  },
  scan: {
    excludePaths: ["node_modules", "dist", "build", "coverage", ".git"]
  },
  runtimeTrace: {
    outputPath: "depbrain-runtime.json"
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
    plugins: {
      enabled: normalizeStringArray(
        loaded.plugins?.enabled,
        defaultConfig.plugins.enabled
      ),
      paths: normalizeStringArray(
        loaded.plugins?.paths,
        defaultConfig.plugins.paths
      )
    },
    risk: {
      transitiveBloatThreshold: normalizeNumber(
        loaded.risk?.transitiveBloatThreshold,
        defaultConfig.risk.transitiveBloatThreshold
      ),
      typosquattingDistanceThreshold: normalizeNumber(
        loaded.risk?.typosquattingDistanceThreshold,
        defaultConfig.risk.typosquattingDistanceThreshold
      ),
      staleReleaseDays: normalizeNumber(
        loaded.risk?.staleReleaseDays,
        defaultConfig.risk.staleReleaseDays
      ),
      agingReleaseDays: normalizeNumber(
        loaded.risk?.agingReleaseDays,
        defaultConfig.risk.agingReleaseDays
      ),
      lowDownloadThreshold: normalizeNumber(
        loaded.risk?.lowDownloadThreshold,
        defaultConfig.risk.lowDownloadThreshold
      ),
      lowTrustWeightThreshold: normalizeNumber(
        loaded.risk?.lowTrustWeightThreshold,
        defaultConfig.risk.lowTrustWeightThreshold
      ),
      mediumTrustWeightThreshold: normalizeNumber(
        loaded.risk?.mediumTrustWeightThreshold,
        defaultConfig.risk.mediumTrustWeightThreshold
      ),
      osv: {
        enabled: normalizeBoolean(
          loaded.risk?.osv?.enabled,
          defaultConfig.risk.osv.enabled
        ),
        severityThreshold: normalizeSeverityThreshold(
          loaded.risk?.osv?.severityThreshold,
          defaultConfig.risk.osv.severityThreshold
        ),
        includeDevDependencies: normalizeBoolean(
          loaded.risk?.osv?.includeDevDependencies,
          defaultConfig.risk.osv.includeDevDependencies
        )
      }
    },
    dashboard: {
      outputPath: normalizeString(
        loaded.dashboard?.outputPath,
        defaultConfig.dashboard.outputPath
      )
    },
    notifications: {
      enabled: normalizeBoolean(
        loaded.notifications?.enabled,
        defaultConfig.notifications.enabled
      ),
      on: normalizeNotificationTrigger(
        loaded.notifications?.on,
        defaultConfig.notifications.on
      ),
      slackWebhookEnv: normalizeString(
        loaded.notifications?.slackWebhookEnv,
        defaultConfig.notifications.slackWebhookEnv
      ),
      discordWebhookEnv: normalizeString(
        loaded.notifications?.discordWebhookEnv,
        defaultConfig.notifications.discordWebhookEnv
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
    },
    runtimeTrace: {
      outputPath: normalizeString(
        loaded.runtimeTrace?.outputPath,
        defaultConfig.runtimeTrace.outputPath
      )
    },
    ownership: loaded.ownership && typeof loaded.ownership === "object"
      ? {
          owners: normalizeOwners(loaded.ownership.owners)
        }
      : undefined
  };
}

function normalizeOwners(value: unknown): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return result;
  }
  for (const [key, val] of Object.entries(value)) {
    if (Array.isArray(val)) {
      result[key] = val.filter((item): item is string => typeof item === "string");
    }
  }
  return result;
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

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function normalizeNotificationTrigger(
  value: unknown,
  fallback: DepBrainConfig["notifications"]["on"]
): DepBrainConfig["notifications"]["on"] {
  return value === "always" || value === "failure" || value === "never"
    ? value
    : fallback;
}

function normalizeSeverityThreshold(
  value: unknown,
  fallback: DepBrainConfig["risk"]["osv"]["severityThreshold"]
): DepBrainConfig["risk"]["osv"]["severityThreshold"] {
  return value === "low" || value === "medium" || value === "high" || value === "critical"
    ? value
    : fallback;
}
