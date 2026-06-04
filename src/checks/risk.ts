import type { DependencyGraph } from "../core/graph-builder.js";
import type {
  Recommendation,
  RiskDependency,
  RiskFactors,
  RiskTransitiveDependency,
  TrustScore,
  VulnerabilityRisk
} from "../core/analyzer.js";
import type { CheckResult } from "../core/types.js";
import {
  getPackageMetadata,
  type PackageMetadata
} from "../utils/npm-api.js";
import type { DepBrainConfig } from "../utils/config.js";
import { getOsvVulnerabilities } from "../utils/osv.js";

export interface RiskCheckOptions {
  resolvePackageMetadata?: (name: string) => Promise<PackageMetadata | null>;
  resolveVulnerabilities?: (name: string) => Promise<VulnerabilityRisk[]>;
  thresholds?: DepBrainConfig["risk"];
}

interface PackageAssessment {
  name: string;
  confidence: number;
  trustScore: TrustScore;
  reasons: string[];
  reasonCodes: string[];
  riskFactors: RiskFactors;
}

export async function findRiskDependencies(
  graph: DependencyGraph,
  options: RiskCheckOptions = {}
): Promise<RiskDependency[]> {
  const resolvePackageMetadata =
    options.resolvePackageMetadata ?? getPackageMetadata;
  const resolveVulnerabilities =
    options.resolveVulnerabilities ?? getOsvVulnerabilities;
  const thresholds = options.thresholds;
  const allNames = Object.keys({
    ...graph.dependencies,
    ...graph.devDependencies,
    ...(graph.lockPackages ?? {})
  });

  const assessments = new Map<string, PackageAssessment>();
  const results = await mapWithConcurrency(allNames, 8, async (name) => {
    const metadata = await resolvePackageMetadata(name);
    if (!metadata) {
      return null;
    }

    const dependencyType = graph.dependencies[name]
      ? "dependencies"
      : graph.devDependencies[name]
        ? "devDependencies"
        : "unknown";

    const vulnerabilities = await resolveRiskVulnerabilities(
      name,
      dependencyType,
      thresholds,
      resolveVulnerabilities
    );

    const assessment = assessRisk(metadata, dependencyType, thresholds, 0, vulnerabilities);
    return {
      name,
      assessment
    };
  });

  for (const result of results) {
    if (result) {
      assessments.set(result.name, result.assessment);
    }
  }

  const directNames = Object.keys({
    ...graph.dependencies,
    ...graph.devDependencies
  }).sort((left, right) => left.localeCompare(right));

  const risks = directNames
    .map((name) => buildDirectRiskEntry(name, graph, assessments, thresholds))
    .filter((item): item is RiskDependency => item !== null);

  return risks.sort((left, right) => left.name.localeCompare(right.name));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

export async function runRiskCheck(
  graph: DependencyGraph,
  options: RiskCheckOptions = {}
): Promise<CheckResult> {
  const risks = await findRiskDependencies(graph, options);

  return {
    name: "risk",
    summary: `${risks.length} risky dependencies found`,
    issues: risks.map((item) => ({
      id: `risk:${item.name}`,
      message: `${item.name}: ${item.reasons.join("; ")}`,
      severity:
        item.trustScore === "low"
          ? "critical"
          : item.trustScore === "medium"
            ? "warning"
            : "info",
      confidence: item.confidence,
      reasonCodes: item.reasonCodes,
      explanation: item.explanation,
      meta: {
        name: item.name,
        reasons: item.reasons,
        trustScore: item.trustScore,
        riskFactors: item.riskFactors,
        transitiveRiskScore: item.transitiveRiskScore,
      riskyTransitiveDeps: item.riskyTransitiveDeps
      }
    }))
  };
}

async function resolveRiskVulnerabilities(
  name: string,
  dependencyType: RiskFactors["dependencyType"],
  thresholds: DepBrainConfig["risk"] | undefined,
  resolveVulnerabilities: (name: string) => Promise<VulnerabilityRisk[]>
): Promise<VulnerabilityRisk[]> {
  if (!thresholds?.osv.enabled) {
    return [];
  }

  if (dependencyType === "devDependencies" && !thresholds.osv.includeDevDependencies) {
    return [];
  }

  const vulnerabilities = await resolveVulnerabilities(name);
  return vulnerabilities.filter((item) =>
    severityRank(item.severity) >= severityRank(thresholds.osv.severityThreshold)
  );
}

function buildDirectRiskEntry(
  name: string,
  graph: DependencyGraph,
  assessments: Map<string, PackageAssessment>,
  thresholds?: DepBrainConfig["risk"]
): RiskDependency | null {
  const dependencyType = graph.dependencies[name]
    ? "dependencies"
    : graph.devDependencies[name]
      ? "devDependencies"
      : "unknown";
  const selfAssessment = assessments.get(name) ?? buildUnknownAssessment(name, dependencyType);
  const transitive = collectTransitiveRisks(name, graph, assessments);

  const reasonCodes = [...selfAssessment.reasonCodes];
  const reasons = [...selfAssessment.reasons];
  const explanation = [...selfAssessment.reasons];

  if (transitive.riskyTransitiveDeps.length > 0) {
    reasons.push(
      `Introduces ${transitive.riskyTransitiveDeps.length} risky transitive dependenc${transitive.riskyTransitiveDeps.length === 1 ? "y" : "ies"}`
    );
    reasonCodes.push("risky_transitive_dependencies");
    explanation.push(
      `Transitive paths: ${transitive.riskyTransitiveDeps
        .flatMap((item) => item.introducedByPaths)
        .slice(0, 3)
        .join("; ")}`
    );
  }

  if (transitive.transitiveDependencyCount > (thresholds?.transitiveBloatThreshold ?? 50)) {
    reasons.push("Large transitive dependency tree");
    reasonCodes.push("dependency_bloat");
    explanation.push(
      `${name} introduces ${transitive.transitiveDependencyCount} transitive dependencies.`
    );
  }

  const transitiveRiskScore = transitive.riskyTransitiveDeps.reduce(
    (total, item) => total + trustScoreWeight(item.trustScore),
    0
  );
  const combinedConfidence = Math.min(
    0.99,
    Math.max(
      selfAssessment.confidence,
      transitive.riskyTransitiveDeps.reduce(
        (maxConfidence, item) => Math.max(maxConfidence, item.confidence),
        0.5
      )
    )
  );
  const trustScore = combineTrustScores(
    selfAssessment.trustScore,
    transitive.highestTrustScore
  );
  const shouldReport =
    shouldReportRisk(selfAssessment.trustScore, dependencyType) ||
    transitive.riskyTransitiveDeps.length > 0 ||
    transitive.transitiveDependencyCount > (thresholds?.transitiveBloatThreshold ?? 50);

  if (!shouldReport || reasons.length === 0) {
    return null;
  }

  return {
    name,
    reasons,
    confidence: combinedConfidence,
    reasonCodes: dedupeStrings(reasonCodes),
    explanation: dedupeStrings(explanation),
    trustScore,
    riskFactors: {
      ...selfAssessment.riskFactors,
      dependencyType,
      transitiveDependencyCount: transitive.transitiveDependencyCount,
      riskyTransitiveCount: transitive.riskyTransitiveDeps.length
    },
    transitiveRiskScore,
    riskyTransitiveDeps: transitive.riskyTransitiveDeps,
    recommendation: buildRiskRecommendation(
      reasons,
      combinedConfidence,
      trustScore,
      transitive.riskyTransitiveDeps.length
    )
  };
}

function collectTransitiveRisks(
  directName: string,
  graph: DependencyGraph,
  assessments: Map<string, PackageAssessment>
): {
  transitiveDependencyCount: number;
  riskyTransitiveDeps: RiskTransitiveDependency[];
  highestTrustScore: TrustScore;
} {
  const visited = new Set<string>();
  const queue = (graph.lockDependencies?.[directName] ?? []).map((name) => ({
    name,
    path: [directName, name]
  }));
  const riskyByName = new Map<string, RiskTransitiveDependency>();
  let highestTrustScore: TrustScore = "high";

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.name)) {
      continue;
    }

    visited.add(current.name);
    const assessment = assessments.get(current.name);
    if (assessment && shouldReportRisk(assessment.trustScore, assessment.riskFactors.dependencyType)) {
      highestTrustScore = combineTrustScores(highestTrustScore, assessment.trustScore);
      const existing = riskyByName.get(current.name);
      const pathTrace = current.path.join(" -> ");

      if (existing) {
        existing.introducedByPaths.push(pathTrace);
      } else {
        riskyByName.set(current.name, {
          name: current.name,
          trustScore: assessment.trustScore,
          confidence: assessment.confidence,
          reasons: assessment.reasons,
          introducedByPaths: [pathTrace]
        });
      }
    }

    const nextDependencies = graph.lockDependencies?.[current.name] ?? [];
    for (const dependency of nextDependencies) {
      if (!visited.has(dependency)) {
        queue.push({
          name: dependency,
          path: [...current.path, dependency]
        });
      }
    }
  }

  return {
    transitiveDependencyCount: visited.size,
    riskyTransitiveDeps: Array.from(riskyByName.values())
      .map((item) => ({
        ...item,
        introducedByPaths: dedupeStrings(item.introducedByPaths).slice(0, 3)
      }))
      .sort((left, right) =>
        trustScoreWeight(right.trustScore) - trustScoreWeight(left.trustScore) ||
        right.confidence - left.confidence ||
        left.name.localeCompare(right.name)
      ),
    highestTrustScore
  };
}

function assessRisk(
  metadata: PackageMetadata,
  dependencyType: RiskFactors["dependencyType"],
  thresholds: DepBrainConfig["risk"] | undefined,
  transitiveDependencyCount: number,
  vulnerabilities: VulnerabilityRisk[] = []
): PackageAssessment {
  const reasons: string[] = [];
  const reasonCodes: string[] = [];
  let weight = 0;
  const staleReleaseDays = thresholds?.staleReleaseDays ?? 730;
  const agingReleaseDays = thresholds?.agingReleaseDays ?? 365;
  const lowDownloadThreshold = thresholds?.lowDownloadThreshold ?? 1000;
  const lowTrustWeightThreshold = thresholds?.lowTrustWeightThreshold ?? 6;
  const mediumTrustWeightThreshold = thresholds?.mediumTrustWeightThreshold ?? 3;

  if (vulnerabilities.length > 0) {
    const highestSeverity = vulnerabilities
      .map((item) => item.severity)
      .sort((left, right) => severityRank(right) - severityRank(left))[0];
    reasons.push(
      `${vulnerabilities.length} OSV vulnerabilit${vulnerabilities.length === 1 ? "y" : "ies"} found (${highestSeverity})`
    );
    reasonCodes.push("osv_vulnerability");
    weight += highestSeverity === "critical" || highestSeverity === "high" ? 6 : 3;
  }

  if (metadata.daysSincePublish !== null && metadata.daysSincePublish > staleReleaseDays) {
    reasons.push(`No release in over ${formatDays(staleReleaseDays)}`);
    reasonCodes.push("stale_release");
    weight += 3;
  } else if (
    metadata.daysSincePublish !== null &&
    metadata.daysSincePublish > agingReleaseDays
  ) {
    reasons.push(`No release in over ${formatDays(agingReleaseDays)}`);
    reasonCodes.push("aging_release");
    weight += 2;
  }

  if (metadata.downloads !== null && metadata.downloads < lowDownloadThreshold) {
    reasons.push("Low weekly download volume");
    reasonCodes.push("low_download_volume");
    weight += 2;
  }

  if (!metadata.repository) {
    reasons.push("Missing repository metadata");
    reasonCodes.push("missing_repository_metadata");
    weight += 2;
  }

  if (metadata.maintainersCount !== null && metadata.maintainersCount <= 1) {
    reasons.push("Single maintainer package");
    reasonCodes.push("single_maintainer");
    weight += 2;
  }

  if (
    reasons.length > 0 &&
    metadata.recentReleaseCount !== null &&
    metadata.recentReleaseCount === 0
  ) {
    reasons.push("No releases published in the last 30 days");
    reasonCodes.push("no_recent_release");
    weight += 1;
  }

  if (metadata.versionCount !== null && metadata.versionCount <= 3) {
    reasons.push("Very limited published version history");
    reasonCodes.push("limited_version_history");
    weight += 1;
  }

  const confidence =
    reasons.length === 0 ? 0.5 : Math.min(0.99, 0.52 + weight * 0.07);
  const trustScore =
    weight >= lowTrustWeightThreshold
      ? "low"
      : weight >= mediumTrustWeightThreshold
        ? "medium"
        : "high";

  return {
    name: "",
    confidence,
    trustScore,
    reasons,
    reasonCodes,
    riskFactors: {
      daysSincePublish: metadata.daysSincePublish,
      downloads: metadata.downloads,
      maintainersCount: metadata.maintainersCount,
      versionCount: metadata.versionCount,
      recentReleaseCount: metadata.recentReleaseCount,
      hasRepository: Boolean(metadata.repository),
      dependencyType,
      transitiveDependencyCount,
      riskyTransitiveCount: 0,
      vulnerabilities
    }
  };
}

function buildUnknownAssessment(
  name: string,
  dependencyType: RiskFactors["dependencyType"]
): PackageAssessment {
  return {
    name,
    confidence: 0.5,
    trustScore: "high",
    reasons: [],
    reasonCodes: [],
    riskFactors: {
      daysSincePublish: null,
      downloads: null,
      maintainersCount: null,
      versionCount: null,
      recentReleaseCount: null,
      hasRepository: false,
      dependencyType,
      transitiveDependencyCount: 0,
      riskyTransitiveCount: 0,
      vulnerabilities: []
    }
  };
}

function formatDays(days: number): string {
  if (days === 730) {
    return "2 years";
  }
  if (days === 365) {
    return "12 months";
  }
  return `${days} days`;
}

function shouldReportRisk(
  trustScore: TrustScore,
  dependencyType: RiskFactors["dependencyType"]
): boolean {
  if (trustScore === "high") {
    return false;
  }

  if (dependencyType === "devDependencies" && trustScore !== "low") {
    return false;
  }

  return true;
}

function severityRank(value: VulnerabilityRisk["severity"]): number {
  if (value === "critical") {
    return 4;
  }
  if (value === "high") {
    return 3;
  }
  if (value === "medium") {
    return 2;
  }
  if (value === "low") {
    return 1;
  }
  return 0;
}

function buildRiskRecommendation(
  reasons: string[],
  confidence: number,
  trustScore: TrustScore,
  riskyTransitiveCount: number
): Recommendation {
  return {
    action: "review",
    priority:
      trustScore === "low" || confidence >= 0.8 || riskyTransitiveCount >= 2
        ? "high"
        : "medium",
    safety: "caution",
    summary:
      riskyTransitiveCount > 0
        ? `Review this direct dependency and its transitive chain before upgrading or keeping it.`
        : trustScore === "low"
          ? "Low trust package; review whether to replace, pin, or monitor it closely."
          : "Review package trust signals and decide whether to keep, replace, or monitor it.",
    reasons
  };
}

function trustScoreWeight(value: TrustScore): number {
  if (value === "low") {
    return 3;
  }
  if (value === "medium") {
    return 2;
  }
  return 1;
}

function combineTrustScores(left: TrustScore, right: TrustScore): TrustScore {
  return trustScoreWeight(left) >= trustScoreWeight(right) ? left : right;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
