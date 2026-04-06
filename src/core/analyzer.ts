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
}

export interface OutdatedDependency {
  name: string;
  current: string;
  latest: string;
  updateType: "major" | "minor" | "patch" | "unknown";
}

export interface RiskDependency {
  name: string;
  reasons: string[];
}

export interface AnalysisResult {
  rootDir: string;
  score: number;
  policy: PolicyResult;
  duplicates: DuplicateDependency[];
  unused: UnusedDependency[];
  outdated: OutdatedDependency[];
  risks: RiskDependency[];
  suggestions: string[];
  config: DepBrainConfig;
}

export interface PolicyResult {
  passed: boolean;
  reasons: string[];
}

export async function analyzeProject(
  options: AnalysisOptions = {}
): Promise<AnalysisResult> {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const loadedConfig = await loadDepBrainConfig(rootDir, options.configPath);
  const config = mergeConfig(loadedConfig, options.config);
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
    risks: risks.length
  });

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

  return {
    rootDir,
    score,
    policy,
    duplicates,
    unused,
    outdated,
    risks,
    suggestions,
    config
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
