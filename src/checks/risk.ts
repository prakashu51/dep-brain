import type { DependencyGraph } from "../core/graph-builder.js";
import type { RiskDependency } from "../core/analyzer.js";
import { getPackageMetadata } from "../utils/npm-api.js";

const TWO_YEARS_IN_DAYS = 365 * 2;

export async function findRiskDependencies(
  graph: DependencyGraph
): Promise<RiskDependency[]> {
  const names = Object.keys({
    ...graph.dependencies,
    ...graph.devDependencies
  });

  const results = await Promise.all(
    names.map(async (name) => {
      const metadata = await getPackageMetadata(name);
      const reasons: string[] = [];

      if (!metadata) {
        return null;
      }

      if (metadata.daysSincePublish !== null && metadata.daysSincePublish > TWO_YEARS_IN_DAYS) {
        reasons.push("No release in over 2 years");
      }

      if (metadata.downloads !== null && metadata.downloads < 1000) {
        reasons.push("Low weekly download volume");
      }

      if (!metadata.repository) {
        reasons.push("Missing repository metadata");
      }

      if (reasons.length === 0) {
        return null;
      }

      return { name, reasons };
    })
  );

  return results
    .filter((item): item is RiskDependency => item !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}
