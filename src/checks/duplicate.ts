import type { DuplicateDependency } from "../core/analyzer.js";
import type { DependencyGraph } from "../core/graph-builder.js";
import type { CheckResult } from "../core/types.js";

export async function findDuplicateDependencies(
  graph: DependencyGraph
): Promise<DuplicateDependency[]> {
  return Object.entries(graph.lockPackages)
    .map(([name, instances]) => ({
      name,
      versions: Array.from(new Set(instances.map((instance) => instance.version))).sort(),
      instances
    }))
    .filter((dependency) => dependency.versions.length > 1)
    .sort((left, right) => left.name.localeCompare(right.name));
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
      meta: {
        name: item.name,
        versions: item.versions,
        instances: item.instances
      }
    }))
  };
}
