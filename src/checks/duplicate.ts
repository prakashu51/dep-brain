import type { DuplicateDependency } from "../core/analyzer.js";
import type { DependencyGraph } from "../core/graph-builder.js";

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
