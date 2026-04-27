import type { AnalysisResult } from "../core/analyzer.js";

export function renderSarifReport(result: AnalysisResult): string {
  const rules = [
    {
      id: "dep-brain-unused",
      shortDescription: { text: "Unused Dependency" },
      fullDescription: { text: "A dependency was detected but does not appear to be used in the source code." },
      helpUri: "https://github.com/prakashu51/dep-brain"
    },
    {
      id: "dep-brain-duplicate",
      shortDescription: { text: "Duplicate Dependency" },
      fullDescription: { text: "Multiple versions of the same dependency exist in the lockfile." },
      helpUri: "https://github.com/prakashu51/dep-brain"
    },
    {
      id: "dep-brain-outdated",
      shortDescription: { text: "Outdated Dependency" },
      fullDescription: { text: "A newer version of the dependency is available." },
      helpUri: "https://github.com/prakashu51/dep-brain"
    },
    {
      id: "dep-brain-risk",
      shortDescription: { text: "Risky Dependency" },
      fullDescription: { text: "A dependency exhibits supply-chain risk signals." },
      helpUri: "https://github.com/prakashu51/dep-brain"
    }
  ];

  const results: any[] = [];

  const mapLevel = (priority: string) => {
    switch (priority) {
      case "high": return "error";
      case "medium": return "warning";
      case "low": return "note";
      default: return "none";
    }
  };

  for (const item of result.unused) {
    results.push({
      ruleId: "dep-brain-unused",
      level: mapLevel(item.recommendation.priority),
      message: {
        text: `[Unused] ${item.name}\n\n${item.recommendation.summary}\nReasons:\n- ${item.recommendation.reasons.join('\n- ')}`
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: item.package ? `packages/${item.package}/package.json` : "package.json"
            }
          }
        }
      ]
    });
  }

  for (const item of result.duplicates) {
    results.push({
      ruleId: "dep-brain-duplicate",
      level: mapLevel(item.recommendation.priority),
      message: {
        text: `[Duplicate] ${item.name} (${item.versions.join(", ")})\n\n${item.recommendation.summary}`
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: "package-lock.json"
            }
          }
        }
      ]
    });
  }

  for (const item of result.outdated) {
    results.push({
      ruleId: "dep-brain-outdated",
      level: mapLevel(item.recommendation.priority),
      message: {
        text: `[Outdated] ${item.name}: ${item.current} -> ${item.latest} (${item.updateType})\n\n${item.recommendation.summary}`
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: item.package ? `packages/${item.package}/package.json` : "package.json"
            }
          }
        }
      ]
    });
  }

  for (const item of result.risks) {
    results.push({
      ruleId: "dep-brain-risk",
      level: mapLevel(item.recommendation.priority),
      message: {
        text: `[Risk] ${item.name} (Trust: ${item.trustScore})\n\n${item.recommendation.summary}\nReasons:\n- ${item.recommendation.reasons.join('\n- ')}`
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: item.package ? `packages/${item.package}/package.json` : "package.json"
            }
          }
        }
      ]
    });
  }

  const sarif = {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "Dependency Brain",
            informationUri: "https://github.com/prakashu51/dep-brain",
            rules
          }
        },
        results
      }
    ]
  };

  return JSON.stringify(sarif, null, 2);
}