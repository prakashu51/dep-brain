import type { OutdatedDependency } from "../core/analyzer.js";
import type { DependencyGraph } from "../core/graph-builder.js";
import { getLatestVersion } from "../utils/npm-api.js";

export async function findOutdatedDependencies(
  graph: DependencyGraph
): Promise<OutdatedDependency[]> {
  const combined = {
    ...graph.dependencies,
    ...graph.devDependencies
  };

  const results = await Promise.all(
    Object.entries(combined).map(async ([name, current]) => {
      const normalized = current.replace(/^[~^]/, "");
      const latest = await getLatestVersion(name);

      if (!latest || latest === normalized) {
        return null;
      }

      return {
        name,
        current,
        latest
      };
    })
  );

  return results
    .filter((item): item is OutdatedDependency => item !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}
