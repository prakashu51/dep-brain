import path from "node:path";
import {
  runDuplicateCheck
} from "../checks/duplicate.js";
import { runOutdatedCheck } from "../checks/outdated.js";
import { runRiskCheck } from "../checks/risk.js";
import { runUnusedCheck } from "../checks/unused.js";
import {
  loadDepBrainConfig,
  type DepBrainConfig,
  type DepBrainConfigOverrides
} from "../utils/config.js";
import { findWorkspacePackages } from "../utils/workspaces.js";
import { buildDependencyGraph } from "./graph-builder.js";
import { calculateHealthScore } from "./scorer.js";
import { buildAnalysisContext } from "./context.js";
import type { CheckResult, Issue } from "./types.js";

export interface AnalysisOptions {
  rootDir?: string;
  configPath?: string;
  config?: DepBrainConfigOverrides;
}

export interface DuplicateInstance {
  path: string;
  version: string;
}

export interface Recommendation {
  action: "remove" | "consolidate" | "upgrade" | "review";
  priority: "high" | "medium" | "low";
  safety: "safe" | "caution" | "unknown";
  summary: string;
  reasons: string[];
}

export interface RiskFactors {
  daysSincePublish: number | null;
  downloads: number | null;
  maintainersCount: number | null;
  versionCount: number | null;
  recentReleaseCount: number | null;
  hasRepository: boolean;
  dependencyType: "dependencies" | "devDependencies" | "unknown";
}

export type TrustScore = "high" | "medium" | "low";

export interface DuplicateDependency {
  name: string;
  versions: string[];
  instances: DuplicateInstance[];
  confidence: number;
  reasonCodes: string[];
  explanation: string[];
  recommendation: Recommendation;
}

export interface UnusedDependency {
  name: string;
  section: "dependencies" | "devDependencies";
  package?: string;
  confidence: number;
  reasonCodes: string[];
  explanation: string[];
  recommendation: Recommendation;
}

export interface OutdatedDependency {
  name: string;
  current: string;
  latest: string;
  updateType: "major" | "minor" | "patch" | "unknown";
  package?: string;
  confidence: number;
  reasonCodes: string[];
  explanation: string[];
  recommendation: Recommendation;
}

export interface RiskDependency {
  name: string;
  reasons: string[];
  package?: string;
  confidence: number;
  reasonCodes: string[];
  explanation: string[];
  trustScore: TrustScore;
  riskFactors: RiskFactors;
  recommendation: Recommendation;
}

export interface TopIssue {
  kind: "unused" | "duplicate" | "outdated" | "risk";
  name: string;
  package?: string;
  priority: "high" | "medium" | "low";
  confidence: number;
  summary: string;
  trustScore?: TrustScore;
  recommendation: Recommendation;
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
  topIssues: TopIssue[];
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
  topIssues: TopIssue[];
}

export const OUTPUT_VERSION = "1.3";

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
  const duplicateCheck = await runDuplicateCheck(rootGraph);
  const filteredDuplicateIssues = filterIssues(
    duplicateCheck.issues,
    "duplicates",
    config
  );
  const duplicates = mapDuplicateIssues(filteredDuplicateIssues);

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
    topIssues: buildTopIssues({ duplicates, unused, outdated, risks }),
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
      unused: overrides.ignore?.unused ?? base.ignore.unused,
      prefixes: overrides.ignore?.prefixes ?? base.ignore.prefixes,
      patterns: overrides.ignore?.patterns ?? base.ignore.patterns
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
    },
    scan: {
      excludePaths:
        overrides.scan?.excludePaths ?? base.scan.excludePaths
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
  const context = await buildAnalysisContext(rootDir, config);
  const results = await runChecks(context);
  const issueGroups = normalizeIssues(results, config);

  const duplicates = mapDuplicateIssues(issueGroups.duplicates);
  const unused = mapUnusedIssues(issueGroups.unused);
  const outdated = mapOutdatedIssues(issueGroups.outdated);
  const risks = mapRiskIssues(issueGroups.risks);

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
    topIssues: buildTopIssues({
      duplicates,
      unused: scopedUnused,
      outdated: scopedOutdated,
      risks: scopedRisks
    }),
    config
  };
}

function shouldIgnorePackage(
  name: string,
  bucket: "dependencies" | "devDependencies" | "unused" | "duplicates" | "outdated" | "risks",
  config: DepBrainConfig
): boolean {
  if (config.ignore[bucket].includes(name)) {
    return true;
  }

  if (config.ignore.prefixes.some((prefix) => name.startsWith(prefix))) {
    return true;
  }

  return config.ignore.patterns.some((pattern) => {
    try {
      const regex = new RegExp(pattern);
      return regex.test(name);
    } catch {
      return false;
    }
  });
}

async function runChecks(context: {
  graph: import("./graph-builder.js").DependencyGraph;
  rootDir: string;
  sourceText: string;
  projectFiles: string[];
  fileEntries: { path: string; content: string }[];
  hasTypeScriptConfig: boolean;
}): Promise<CheckResult[]> {
  const checks = [
    {
      name: "duplicate",
      run: () => runDuplicateCheck(context.graph)
    },
    {
      name: "unused",
      run: () => runUnusedCheck(context)
    },
    {
      name: "outdated",
      run: () => runOutdatedCheck(context.graph)
    },
    {
      name: "risk",
      run: () => runRiskCheck(context.graph)
    }
  ];

  const results: CheckResult[] = [];
  for (const check of checks) {
    results.push(await check.run());
  }

  return results;
}

function normalizeIssues(results: CheckResult[], config: DepBrainConfig): {
  duplicates: Issue[];
  unused: Issue[];
  outdated: Issue[];
  risks: Issue[];
} {
  const map = new Map<string, Issue[]>();
  for (const result of results) {
    map.set(result.name, result.issues);
  }

  return {
    duplicates: filterIssues(map.get("duplicate") ?? [], "duplicates", config),
    unused: filterIssues(map.get("unused") ?? [], "unused", config),
    outdated: filterIssues(map.get("outdated") ?? [], "outdated", config),
    risks: filterIssues(map.get("risk") ?? [], "risks", config)
  };
}

function filterIssues(
  issues: Issue[],
  bucket: "dependencies" | "devDependencies" | "unused" | "duplicates" | "outdated" | "risks",
  config: DepBrainConfig
): Issue[] {
  return issues.filter((issue) => {
    const name = typeof issue.meta?.name === "string" ? issue.meta.name : issue.package ?? "";
    if (!name) {
      return true;
    }
    if (bucket === "unused") {
      const section =
        issue.meta?.section === "devDependencies" ? "devDependencies" : "dependencies";
      if (shouldIgnorePackage(name, section, config)) {
        return false;
      }
    }
    return !shouldIgnorePackage(name, bucket, config);
  });
}

function mapDuplicateIssues(issues: Issue[]): DuplicateDependency[] {
  return issues.map((issue) => ({
    name: String(issue.meta?.name ?? issue.package ?? "unknown"),
    versions: Array.isArray(issue.meta?.versions) ? (issue.meta?.versions as string[]) : [],
    instances: Array.isArray(issue.meta?.instances)
      ? (issue.meta?.instances as { path: string; version: string }[])
      : [],
    confidence: normalizeConfidence(issue.confidence),
    reasonCodes: normalizeStringArray(issue.reasonCodes),
    explanation: normalizeStringArray(issue.explanation),
    recommendation: buildDuplicateRecommendation(issue)
  }));
}

function mapUnusedIssues(issues: Issue[]): UnusedDependency[] {
  return issues.map((issue) => ({
    name: String(issue.meta?.name ?? issue.package ?? "unknown"),
    section:
      issue.meta?.section === "devDependencies" ? "devDependencies" : "dependencies",
    confidence: normalizeConfidence(issue.confidence),
    reasonCodes: normalizeStringArray(issue.reasonCodes),
    explanation: normalizeStringArray(issue.explanation),
    recommendation: buildUnusedRecommendation(issue)
  }));
}

function mapOutdatedIssues(issues: Issue[]): OutdatedDependency[] {
  return issues.map((issue) => ({
    name: String(issue.meta?.name ?? issue.package ?? "unknown"),
    current: String(issue.meta?.current ?? ""),
    latest: String(issue.meta?.latest ?? ""),
    updateType:
      issue.meta?.updateType === "major" || issue.meta?.updateType === "minor" || issue.meta?.updateType === "patch"
        ? issue.meta.updateType
        : "unknown",
    confidence: normalizeConfidence(issue.confidence),
    reasonCodes: normalizeStringArray(issue.reasonCodes),
    explanation: normalizeStringArray(issue.explanation),
    recommendation: buildOutdatedRecommendation(issue)
  }));
}

function mapRiskIssues(issues: Issue[]): RiskDependency[] {
  return issues.map((issue) => ({
    name: String(issue.meta?.name ?? issue.package ?? "unknown"),
    reasons: Array.isArray(issue.meta?.reasons) ? (issue.meta?.reasons as string[]) : [],
    confidence: normalizeConfidence(issue.confidence),
    reasonCodes: normalizeStringArray(issue.reasonCodes),
    explanation: normalizeStringArray(issue.explanation),
    trustScore: normalizeTrustScore(issue.meta?.trustScore),
    riskFactors: normalizeRiskFactors(issue.meta?.riskFactors),
    recommendation: buildRiskRecommendation(issue)
  }));
}

function buildUnusedRecommendation(issue: Issue): Recommendation {
  const confidence = normalizeConfidence(issue.confidence);
  const section =
    issue.meta?.section === "devDependencies" ? "devDependencies" : "dependencies";
  const safety =
    section === "devDependencies" || confidence >= 0.88
      ? "safe"
      : confidence >= 0.7
        ? "caution"
        : "unknown";

  return {
    action: "remove",
    priority: confidence >= 0.88 ? "high" : "medium",
    safety,
    summary:
      safety === "safe"
        ? `Safe to remove from ${section}.`
        : safety === "caution"
          ? `Likely removable from ${section}, but review before deleting.`
          : `Potentially removable from ${section}, but evidence is limited.`,
    reasons: normalizeStringArray(issue.explanation)
  };
}

function buildDuplicateRecommendation(issue: Issue): Recommendation {
  const versions = Array.isArray(issue.meta?.versions) ? (issue.meta.versions as string[]) : [];
  const targetVersion = versions[versions.length - 1];
  const instances = Array.isArray(issue.meta?.instances) ? issue.meta.instances.length : 0;

  return {
    action: "consolidate",
    priority: versions.length >= 3 ? "high" : "medium",
    safety: "caution",
    summary: targetVersion
      ? `Consolidate toward ${targetVersion}; ${instances} installation paths are affected.`
      : "Consolidate duplicate versions to a single target version.",
    reasons: normalizeStringArray(issue.explanation)
  };
}

function buildOutdatedRecommendation(issue: Issue): Recommendation {
  const updateType =
    issue.meta?.updateType === "major" ||
    issue.meta?.updateType === "minor" ||
    issue.meta?.updateType === "patch"
      ? issue.meta.updateType
      : "unknown";

  const priority =
    updateType === "major" ? "high" : updateType === "minor" ? "medium" : "low";
  const safety =
    updateType === "patch" ? "safe" : updateType === "minor" ? "caution" : "unknown";

  return {
    action: "upgrade",
    priority,
    safety,
    summary:
      updateType === "major"
        ? "New major version available; review breaking changes before upgrading."
        : updateType === "minor"
          ? "New minor version available; review release notes before upgrading."
          : updateType === "patch"
            ? "Routine patch update available."
            : "Newer version available; review upgrade impact.",
    reasons: normalizeStringArray(issue.explanation)
  };
}

function buildRiskRecommendation(issue: Issue): Recommendation {
  const reasons = normalizeStringArray(issue.explanation);
  const confidence = normalizeConfidence(issue.confidence);
  const trustScore = normalizeTrustScore(issue.meta?.trustScore);

  return {
    action: "review",
    priority: trustScore === "low" || confidence >= 0.79 ? "high" : "medium",
    safety: "caution",
    summary:
      trustScore === "low"
        ? "Low trust package; review whether to replace, pin, or monitor it closely."
        : "Review package trust signals and decide whether to keep, replace, or monitor it.",
    reasons
  };
}

function buildTopIssues(input: {
  duplicates: DuplicateDependency[];
  unused: UnusedDependency[];
  outdated: OutdatedDependency[];
  risks: RiskDependency[];
}): TopIssue[] {
  const issues: TopIssue[] = [
    ...input.unused.map((item) => ({
      kind: "unused" as const,
      name: item.name,
      package: item.package,
      priority: item.recommendation.priority,
      confidence: item.confidence,
      summary: item.recommendation.summary,
      recommendation: item.recommendation
    })),
    ...input.duplicates.map((item) => ({
      kind: "duplicate" as const,
      name: item.name,
      priority: item.recommendation.priority,
      confidence: item.confidence,
      summary: item.recommendation.summary,
      recommendation: item.recommendation
    })),
    ...input.outdated.map((item) => ({
      kind: "outdated" as const,
      name: item.name,
      package: item.package,
      priority: item.recommendation.priority,
      confidence: item.confidence,
      summary: item.recommendation.summary,
      recommendation: item.recommendation
    })),
    ...input.risks.map((item) => ({
      kind: "risk" as const,
      name: item.name,
      package: item.package,
      priority: item.recommendation.priority,
      confidence: item.confidence,
      summary: item.recommendation.summary,
      trustScore: item.trustScore,
      recommendation: item.recommendation
    }))
  ];

  return issues
    .sort((left, right) =>
      comparePriority(right.priority, left.priority) ||
      compareTrustScore(right.trustScore, left.trustScore) ||
      right.confidence - left.confidence
    )
    .slice(0, 5);
}

function comparePriority(left: TopIssue["priority"], right: TopIssue["priority"]): number {
  const rank = { high: 3, medium: 2, low: 1 };
  return rank[left] - rank[right];
}

function compareTrustScore(
  left: TopIssue["trustScore"] | undefined,
  right: TopIssue["trustScore"] | undefined
): number {
  const rank = { low: 3, medium: 2, high: 1, undefined: 0 };
  return rank[left ?? "undefined"] - rank[right ?? "undefined"];
}

function normalizeConfidence(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.5;
  }

  return Math.min(0.99, Math.max(0, Number(value.toFixed(2))));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function normalizeTrustScore(value: unknown): TrustScore {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "medium";
}

function normalizeRiskFactors(value: unknown): RiskFactors {
  if (!value || typeof value !== "object") {
    return {
      daysSincePublish: null,
      downloads: null,
      maintainersCount: null,
      versionCount: null,
      recentReleaseCount: null,
      hasRepository: false,
      dependencyType: "unknown"
    };
  }

  const factors = value as Partial<RiskFactors>;
  return {
    daysSincePublish:
      typeof factors.daysSincePublish === "number" ? factors.daysSincePublish : null,
    downloads: typeof factors.downloads === "number" ? factors.downloads : null,
    maintainersCount:
      typeof factors.maintainersCount === "number" ? factors.maintainersCount : null,
    versionCount: typeof factors.versionCount === "number" ? factors.versionCount : null,
    recentReleaseCount:
      typeof factors.recentReleaseCount === "number" ? factors.recentReleaseCount : null,
    hasRepository: factors.hasRepository === true,
    dependencyType:
      factors.dependencyType === "dependencies" || factors.dependencyType === "devDependencies"
        ? factors.dependencyType
        : "unknown"
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
