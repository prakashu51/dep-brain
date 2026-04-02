import type { DuplicateDependency } from "../core/analyzer.js";
import type { DependencyGraph } from "../core/graph-builder.js";

export async function findDuplicateDependencies(
  graph: DependencyGraph
): Promise<DuplicateDependency[]> {
  return Object.entries(graph.lockPackages)
    .filter(([, versions]) => versions.size > 1)
    .map(([name, versions]) => ({
      name,
      versions: Array.from(versions).sort()
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
