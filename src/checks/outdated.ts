import type { OutdatedDependency } from "../core/analyzer.js";
import type { DependencyGraph } from "../core/graph-builder.js";
import type { CheckResult } from "../core/types.js";
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
        updateType: classifyUpdateType(normalized, latest),
        confidence: 0.97,
        reasonCodes: [
          "latest_registry_version_newer",
          `update_type_${classifyUpdateType(normalized, latest)}`
        ],
        explanation: [
          "The npm registry reports a newer published version than the one declared in this project.",
          `The change is classified as a ${classifyUpdateType(normalized, latest)} update.`
        ]
      };
    })
  );

  return results
    .filter((item): item is OutdatedDependency => item !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function runOutdatedCheck(
  graph: DependencyGraph
): Promise<CheckResult> {
  const outdated = await findOutdatedDependencies(graph);

  return {
    name: "outdated",
    summary: `${outdated.length} outdated dependencies found`,
    issues: outdated.map((item) => ({
      id: `outdated:${item.name}`,
      message: `${item.name} ${item.current} -> ${item.latest}`,
      severity: item.updateType === "major" ? "critical" : "warning",
      confidence: item.confidence,
      reasonCodes: item.reasonCodes,
      explanation: item.explanation,
      meta: {
        name: item.name,
        current: item.current,
        latest: item.latest,
        updateType: item.updateType
      }
    }))
  };
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
