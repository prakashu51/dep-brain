import type { AnalysisResult } from "../core/analyzer.js";

export function renderMarkdownReport(result: AnalysisResult): string {
  const lines: string[] = [];

  lines.push(`# Dependency Brain Report`);
  lines.push("");
  lines.push(`- **Project Health:** ${result.score}/100`);
  lines.push(`- **Path:** ${result.rootDir}`);
  lines.push(`- **Policy:** ${result.policy.passed ? "PASS" : "FAIL"}`);
  lines.push(
    `- **Score Breakdown:** base ${result.scoreBreakdown.baseScore} - dup ${result.scoreBreakdown.duplicates} - outdated ${result.scoreBreakdown.outdated} - unused ${result.scoreBreakdown.unused} - risk ${result.scoreBreakdown.risks}`
  );
  lines.push("");

  if (result.packages && result.packages.length > 0) {
    lines.push("## Packages");
    for (const pkg of result.packages) {
      lines.push(
        `- ${pkg.name}: ${pkg.score}/100 (D:${pkg.duplicates.length} U:${pkg.unused.length} O:${pkg.outdated.length} R:${pkg.risks.length})`
      );
    }
    lines.push("");
  }

  lines.push("## Summary");
  lines.push(`- Duplicates: ${result.duplicates.length}`);
  lines.push(`- Unused: ${result.unused.length}`);
  lines.push(`- Outdated: ${result.outdated.length}`);
  lines.push(`- Risks: ${result.risks.length}`);
  lines.push("");

  appendSection(
    lines,
    "Duplicate dependencies",
    result.duplicates.map((item) => `${item.name}: ${item.versions.join(", ")}`)
  );

  appendSection(
    lines,
    "Unused dependencies",
    result.unused.map((item) =>
      item.package
        ? `${item.name} (${item.section}) [${item.package}]`
        : `${item.name} (${item.section})`
    )
  );

  appendSection(
    lines,
    "Outdated dependencies",
    result.outdated.map((item) =>
      item.package
        ? `${item.name}: ${item.current} -> ${item.latest} [${item.updateType}] [${item.package}]`
        : `${item.name}: ${item.current} -> ${item.latest} [${item.updateType}]`
    )
  );

  appendSection(
    lines,
    "Risky dependencies",
    result.risks.map((item) =>
      item.package
        ? `${item.name}: ${item.reasons.join("; ")} [${item.package}]`
        : `${item.name}: ${item.reasons.join("; ")}`
    )
  );

  appendSection(lines, "Policy reasons", result.policy.reasons);

  if (result.suggestions.length > 0) {
    lines.push("## Suggestions");
    for (const suggestion of result.suggestions) {
      lines.push(`- ${suggestion}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function appendSection(lines: string[], title: string, items: string[]): void {
  if (items.length === 0) {
    return;
  }

  lines.push(`## ${title}`);
  for (const item of items) {
    lines.push(`- ${item}`);
  }
  lines.push("");
}
