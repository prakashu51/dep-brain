import type { DependencyGraph } from "../core/graph-builder.js";
import type {
  Recommendation,
  RiskDependency,
  RiskFactors,
  TrustScore
} from "../core/analyzer.js";
import type { CheckResult } from "../core/types.js";
import {
  getPackageMetadata,
  type PackageMetadata
} from "../utils/npm-api.js";

const TWO_YEARS_IN_DAYS = 365 * 2;
const ONE_YEAR_IN_DAYS = 365;

export interface RiskCheckOptions {
  resolvePackageMetadata?: (name: string) => Promise<PackageMetadata | null>;
}

export async function findRiskDependencies(
  graph: DependencyGraph,
  options: RiskCheckOptions = {}
): Promise<RiskDependency[]> {
  const resolvePackageMetadata =
    options.resolvePackageMetadata ?? getPackageMetadata;
  const names = Object.keys({
    ...graph.dependencies,
    ...graph.devDependencies
  });

  const results = await mapWithConcurrency(names, 8, async (name) => {
      const metadata = await resolvePackageMetadata(name);
      if (!metadata) {
        return null;
      }

      const dependencyType = graph.dependencies[name]
        ? "dependencies"
        : graph.devDependencies[name]
          ? "devDependencies"
          : "unknown";
      const assessment = assessRisk(metadata, dependencyType);

      if (!shouldReportRisk(assessment.trustScore, dependencyType)) {
        return null;
      }

      return {
        name,
        reasons: assessment.reasons,
        confidence: assessment.confidence,
        reasonCodes: assessment.reasonCodes,
        explanation: assessment.reasons,
        trustScore: assessment.trustScore,
        riskFactors: assessment.riskFactors,
        recommendation: buildRiskRecommendation(
          assessment.reasons,
          assessment.confidence,
          assessment.trustScore
        )
      };
    });

  return results
    .filter((item): item is RiskDependency => item !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
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
  graph: DependencyGraph
): Promise<CheckResult> {
  const risks = await findRiskDependencies(graph);

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
        riskFactors: item.riskFactors
      }
    }))
  };
}

function assessRisk(
  metadata: PackageMetadata,
  dependencyType: RiskFactors["dependencyType"]
): {
  confidence: number;
  trustScore: TrustScore;
  reasons: string[];
  reasonCodes: string[];
  riskFactors: RiskFactors;
} {
  const reasons: string[] = [];
  const reasonCodes: string[] = [];
  let weight = 0;

  if (metadata.daysSincePublish !== null && metadata.daysSincePublish > TWO_YEARS_IN_DAYS) {
    reasons.push("No release in over 2 years");
    reasonCodes.push("stale_release");
    weight += 3;
  } else if (
    metadata.daysSincePublish !== null &&
    metadata.daysSincePublish > ONE_YEAR_IN_DAYS
  ) {
    reasons.push("No release in over 12 months");
    reasonCodes.push("aging_release");
    weight += 2;
  }

  if (metadata.downloads !== null && metadata.downloads < 1000) {
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
  const trustScore = weight >= 6 ? "low" : weight >= 3 ? "medium" : "high";

  return {
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
      dependencyType
    }
  };
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

function buildRiskRecommendation(
  reasons: string[],
  confidence: number,
  trustScore: TrustScore
): Recommendation {
  return {
    action: "review",
    priority: trustScore === "low" || confidence >= 0.8 ? "high" : "medium",
    safety: "caution",
    summary:
      trustScore === "low"
        ? "Low trust package; review whether to replace, pin, or monitor it closely."
        : "Review package trust signals and decide whether to keep, replace, or monitor it.",
    reasons
  };
}
