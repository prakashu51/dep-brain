import type { OutdatedDependency } from "../core/analyzer.js";
import type { DependencyGraph } from "../core/graph-builder.js";
import { getLatestVersion } from "../utils/npm-api.js";

export interface OutdatedOptions {
  resolveLatestVersion?: (name: string) => Promise<string | null>;
}

export async function findOutdatedDependencies(
  graph: DependencyGraph,
  options: OutdatedOptions = {}
): Promise<OutdatedDependency[]> {
  const resolveLatestVersion = options.resolveLatestVersion ?? getLatestVersion;
  const combined = {
    ...graph.dependencies,
    ...graph.devDependencies
  };

  const results = await Promise.all(
    Object.entries(combined).map(async ([name, current]) => {
      const normalized = normalizeVersion(current);
      const latest = await resolveLatestVersion(name);

      if (!latest || latest === normalized) {
        return null;
      }

      return {
        name,
        current,
        latest,
        updateType: classifyUpdateType(normalized, latest)
      };
    })
  );

  return results
    .filter((item): item is OutdatedDependency => item !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeVersion(versionRange: string): string {
  return versionRange.trim().replace(/^[~^><=\s]+/, "");
}

function classifyUpdateType(
  currentVersion: string,
  latestVersion: string
): "major" | "minor" | "patch" | "unknown" {
  const current = parseVersion(currentVersion);
  const latest = parseVersion(latestVersion);

  if (!current || !latest) {
    return "unknown";
  }

  if (latest[0] !== current[0]) {
    return "major";
  }

  if (latest[1] !== current[1]) {
    return "minor";
  }

  if (latest[2] !== current[2]) {
    return "patch";
  }

  return "unknown";
}

function parseVersion(version: string): [number, number, number] | null {
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);

  if (!match) {
    return null;
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
