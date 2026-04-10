import path from "node:path";
import { findDuplicateDependencies } from "../checks/duplicate.js";
import { findOutdatedDependencies } from "../checks/outdated.js";
import { findRiskDependencies } from "../checks/risk.js";
import { findUnusedDependencies } from "../checks/unused.js";
import {
  loadDepBrainConfig,
  type DepBrainConfig,
  type DepBrainConfigOverrides
} from "../utils/config.js";
import { findWorkspacePackages } from "../utils/workspaces.js";
import { buildDependencyGraph } from "./graph-builder.js";
import { calculateHealthScore } from "./scorer.js";

export interface AnalysisOptions {
  rootDir?: string;
  configPath?: string;
  config?: DepBrainConfigOverrides;
}

export interface DuplicateInstance {
  path: string;
  version: string;
}

export interface DuplicateDependency {
  name: string;
  versions: string[];
  instances: DuplicateInstance[];
}

export interface UnusedDependency {
  name: string;
  section: "dependencies" | "devDependencies";
  package?: string;
}

export interface OutdatedDependency {
  name: string;
  current: string;
  latest: string;
  updateType: "major" | "minor" | "patch" | "unknown";
  package?: string;
}

export interface RiskDependency {
  name: string;
  reasons: string[];
  package?: string;
}

export interface AnalysisResult {
  outputVersion: string;
  rootDir: string;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  policy: PolicyResult;
  duplicates: DuplicateDependency[];
  unused: UnusedDependency[];
  outdated: OutdatedDependency[];
  risks: RiskDependency[];
  suggestions: string[];
  config: DepBrainConfig;
  packages?: PackageAnalysisResult[];
}

export interface PolicyResult {
  passed: boolean;
  reasons: string[];
}

export interface PackageAnalysisResult {
  name: string;
  rootDir: string;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  policy: PolicyResult;
  duplicates: DuplicateDependency[];
  unused: UnusedDependency[];
  outdated: OutdatedDependency[];
  risks: RiskDependency[];
  suggestions: string[];
}

export const OUTPUT_VERSION = "1.0";

export interface ScoreBreakdown {
  baseScore: number;
  duplicates: number;
  outdated: number;
  unused: number;
  risks: number;
  weights: {
    duplicateWeight: number;
    outdatedWeight: number;
    unusedWeight: number;
    riskWeight: number;
  };
}

export async function analyzeProject(
  options: AnalysisOptions = {}
): Promise<AnalysisResult> {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const loadedConfig = await loadDepBrainConfig(rootDir, options.configPath);
  const config = mergeConfig(loadedConfig, options.config);
  const workspaces = await findWorkspacePackages(rootDir);

  if (workspaces.length === 0) {
    return analyzeSingleProject(rootDir, config);
  }

  const rootGraph = await buildDependencyGraph(rootDir);
  const rawDuplicates = await findDuplicateDependencies(rootGraph);
  const duplicates = rawDuplicates.filter(
    (item) => !config.ignore.duplicates.includes(item.name)
  );

  const packages: PackageAnalysisResult[] = [];
  for (const workspace of workspaces) {
    const result = await analyzeSingleProject(workspace.rootDir, config, {
      packageName: workspace.name
    });
    packages.push({ ...result, name: workspace.name });
  }

  const unused = packages.flatMap((pkg) =>
    pkg.unused.map((item) => ({ ...item, package: pkg.name }))
  );
  const outdated = packages.flatMap((pkg) =>
    pkg.outdated.map((item) => ({ ...item, package: pkg.name }))
  );
  const risks = packages.flatMap((pkg) =>
    pkg.risks.map((item) => ({ ...item, package: pkg.name }))
  );

  const score = calculateHealthScore({
    duplicates: duplicates.length,
    unused: unused.length,
    outdated: outdated.length,
    risks: risks.length,
    duplicateWeight: config.scoring.duplicateWeight,
    outdatedWeight: config.scoring.outdatedWeight,
    unusedWeight: config.scoring.unusedWeight,
    riskWeight: config.scoring.riskWeight
  });

  const scoreBreakdown = buildScoreBreakdown(
    {
      duplicates: duplicates.length,
      unused: unused.length,
      outdated: outdated.length,
      risks: risks.length
    },
    config
  );

  const suggestions = [
    ...packages.flatMap((pkg) =>
      pkg.suggestions.map((suggestion) => `[${pkg.name}] ${suggestion}`)
    )
  ].slice(0, config.report.maxSuggestions);

  const policy = evaluatePolicy(
    {
      score,
      duplicates: duplicates.length,
      unused: unused.length,
      outdated: outdated.length,
      risks: risks.length
    },
    config
  );

  return {
    outputVersion: OUTPUT_VERSION,
    rootDir,
    score,
    scoreBreakdown,
    policy,
    duplicates,
    unused,
    outdated,
    risks,
    suggestions,
    config,
    packages
  };
}

function mergeConfig(
  base: DepBrainConfig,
  overrides: DepBrainConfigOverrides | undefined
): DepBrainConfig {
  if (!overrides) {
    return base;
  }

  return {
    ignore: {
      dependencies: overrides.ignore?.dependencies ?? base.ignore.dependencies,
      devDependencies:
        overrides.ignore?.devDependencies ?? base.ignore.devDependencies,
      duplicates: overrides.ignore?.duplicates ?? base.ignore.duplicates,
      outdated: overrides.ignore?.outdated ?? base.ignore.outdated,
      risks: overrides.ignore?.risks ?? base.ignore.risks,
      unused: overrides.ignore?.unused ?? base.ignore.unused
    },
    policy: {
      minScore: overrides.policy?.minScore ?? base.policy.minScore,
      failOnDuplicates:
        overrides.policy?.failOnDuplicates ?? base.policy.failOnDuplicates,
      failOnOutdated:
        overrides.policy?.failOnOutdated ?? base.policy.failOnOutdated,
      failOnRisks: overrides.policy?.failOnRisks ?? base.policy.failOnRisks,
      failOnUnused: overrides.policy?.failOnUnused ?? base.policy.failOnUnused
    },
    report: {
      maxSuggestions:
        overrides.report?.maxSuggestions ?? base.report.maxSuggestions
    },
    scoring: {
      duplicateWeight:
        overrides.scoring?.duplicateWeight ?? base.scoring.duplicateWeight,
      outdatedWeight:
        overrides.scoring?.outdatedWeight ?? base.scoring.outdatedWeight,
      unusedWeight:
        overrides.scoring?.unusedWeight ?? base.scoring.unusedWeight,
      riskWeight: overrides.scoring?.riskWeight ?? base.scoring.riskWeight
    }
  };
}

function evaluatePolicy(
  summary: {
    score: number;
    duplicates: number;
    unused: number;
    outdated: number;
    risks: number;
  },
  config: DepBrainConfig
): PolicyResult {
  const reasons: string[] = [];

  if (summary.score < config.policy.minScore) {
    reasons.push(
      `Score ${summary.score} is below minimum ${config.policy.minScore}`
    );
  }

  if (config.policy.failOnDuplicates && summary.duplicates > 0) {
    reasons.push(`Found ${summary.duplicates} duplicate dependencies`);
  }

  if (config.policy.failOnUnused && summary.unused > 0) {
    reasons.push(`Found ${summary.unused} unused dependencies`);
  }

  if (config.policy.failOnOutdated && summary.outdated > 0) {
    reasons.push(`Found ${summary.outdated} outdated dependencies`);
  }

  if (config.policy.failOnRisks && summary.risks > 0) {
    reasons.push(`Found ${summary.risks} risky dependencies`);
  }

  return {
    passed: reasons.length === 0,
    reasons
  };
}

async function analyzeSingleProject(
  rootDir: string,
  config: DepBrainConfig,
  options: { packageName?: string } = {}
): Promise<AnalysisResult> {
  const graph = await buildDependencyGraph(rootDir);

  const [rawDuplicates, rawUnused, rawOutdated, rawRisks] = await Promise.all([
    findDuplicateDependencies(graph),
    findUnusedDependencies(rootDir, graph),
    findOutdatedDependencies(graph),
    findRiskDependencies(graph)
  ]);

  const duplicates = rawDuplicates.filter(
    (item) => !config.ignore.duplicates.includes(item.name)
  );
  const unused = rawUnused.filter(
    (item) =>
      !config.ignore.unused.includes(item.name) &&
      !config.ignore[item.section].includes(item.name)
  );
  const outdated = rawOutdated.filter(
    (item) => !config.ignore.outdated.includes(item.name)
  );
  const risks = rawRisks.filter((item) => !config.ignore.risks.includes(item.name));

  const score = calculateHealthScore({
    duplicates: duplicates.length,
    unused: unused.length,
    outdated: outdated.length,
    risks: risks.length,
    duplicateWeight: config.scoring.duplicateWeight,
    outdatedWeight: config.scoring.outdatedWeight,
    unusedWeight: config.scoring.unusedWeight,
    riskWeight: config.scoring.riskWeight
  });

  const scoreBreakdown = buildScoreBreakdown(
    {
      duplicates: duplicates.length,
      unused: unused.length,
      outdated: outdated.length,
      risks: risks.length
    },
    config
  );

  const suggestions = [
    ...unused.map((item) => `Remove ${item.name} from ${item.section}`),
    ...duplicates.map(
      (item) => `Consider consolidating ${item.name} to one version`
    ),
    ...outdated.map(
      (item) =>
        `Review ${item.name}: ${item.current} -> ${item.latest} (${item.updateType})`
    )
  ].slice(0, config.report.maxSuggestions);

  const policy = evaluatePolicy(
    {
      score,
      duplicates: duplicates.length,
      unused: unused.length,
      outdated: outdated.length,
      risks: risks.length
    },
    config
  );

  const scopedUnused =
    options.packageName && options.packageName.trim().length > 0
      ? unused.map((item) => ({ ...item, package: options.packageName }))
      : unused;
  const scopedOutdated =
    options.packageName && options.packageName.trim().length > 0
      ? outdated.map((item) => ({ ...item, package: options.packageName }))
      : outdated;
  const scopedRisks =
    options.packageName && options.packageName.trim().length > 0
      ? risks.map((item) => ({ ...item, package: options.packageName }))
      : risks;

  return {
    outputVersion: OUTPUT_VERSION,
    rootDir,
    score,
    scoreBreakdown,
    policy,
    duplicates,
    unused: scopedUnused,
    outdated: scopedOutdated,
    risks: scopedRisks,
    suggestions,
    config
  };
}

function buildScoreBreakdown(
  counts: {
    duplicates: number;
    outdated: number;
    unused: number;
    risks: number;
  },
  config: DepBrainConfig
): ScoreBreakdown {
  return {
    baseScore: 100,
    duplicates: counts.duplicates * config.scoring.duplicateWeight,
    outdated: counts.outdated * config.scoring.outdatedWeight,
    unused: counts.unused * config.scoring.unusedWeight,
    risks: counts.risks * config.scoring.riskWeight,
    weights: {
      duplicateWeight: config.scoring.duplicateWeight,
      outdatedWeight: config.scoring.outdatedWeight,
      unusedWeight: config.scoring.unusedWeight,
      riskWeight: config.scoring.riskWeight
    }
  };
}
