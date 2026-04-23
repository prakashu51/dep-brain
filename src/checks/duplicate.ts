import type { DuplicateDependency, Recommendation } from "../core/analyzer.js";
import type { DependencyGraph } from "../core/graph-builder.js";
import type { CheckResult } from "../core/types.js";

export async function findDuplicateDependencies(
  graph: DependencyGraph
): Promise<DuplicateDependency[]> {
  return Object.entries(graph.lockPackages)
    .map(([name, instances]) => ({
      name,
      versions: Array.from(new Set(instances.map((instance) => instance.version))).sort(),
      instances,
      workspaceUsage: [],
      rootCause: [],
      confidence: 0.98,
      reasonCodes: [
        "multiple_lockfile_versions",
        "multiple_installation_paths"
      ],
      explanation: [
        `Multiple versions of ${name} were found in the lockfile.`,
        "The package is installed from more than one dependency path."
      ],
      recommendation: buildDuplicateRecommendation(
        Array.from(new Set(instances.map((instance) => instance.version))).sort(),
        instances.length
      )
    }))
    .filter((dependency) => dependency.versions.length > 1)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function buildDuplicateRecommendation(
  versions: string[],
  instanceCount: number
): Recommendation {
  const targetVersion = versions[versions.length - 1];

  return {
    action: "consolidate",
    priority: versions.length >= 3 ? "high" : "medium",
    safety: "caution",
    summary: targetVersion
      ? `Consolidate toward ${targetVersion}; ${instanceCount} installation paths are affected.`
      : "Consolidate duplicate versions to a single target version.",
    reasons: [
      "Multiple versions of the same package were detected in the lockfile.",
      "Consolidating versions can reduce drift and simplify upgrades."
    ]
  };
}

export async function runDuplicateCheck(
  graph: DependencyGraph
): Promise<CheckResult> {
  const duplicates = await findDuplicateDependencies(graph);

  return {
    name: "duplicate",
    summary: `${duplicates.length} duplicate dependencies found`,
    issues: duplicates.map((item) => ({
      id: `duplicate:${item.name}`,
      message: `${item.name} has ${item.versions.length} versions`,
      severity: "warning",
      confidence: item.confidence,
      reasonCodes: item.reasonCodes,
      explanation: item.explanation,
      meta: {
        name: item.name,
        versions: item.versions,
        instances: item.instances
      }
    }))
  };
}
