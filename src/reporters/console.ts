import type { AnalysisResult } from "../core/analyzer.js";

export function renderConsoleReport(result: AnalysisResult): string {
  const lines: string[] = [];

  if (result.topIssues.length > 0) {
    lines.push("Top Issues:");
    for (const item of result.topIssues) {
      lines.push(
        `- [${item.priority.toUpperCase()}] ${item.kind} ${item.name}${item.package ? ` [${item.package}]` : ""}${item.trustScore ? ` | trust ${item.trustScore.toUpperCase()}` : ""} | confidence ${Math.round(item.confidence * 100)}% | ${item.summary}`
      );
    }
    lines.push("");
  }

  lines.push(`Project Health: ${result.score}/100`);
  lines.push(`Path: ${result.rootDir}`);
  lines.push(`Policy: ${result.policy.passed ? "PASS" : "FAIL"}`);
  lines.push(
    `Score Breakdown: base ${result.scoreBreakdown.baseScore} - dup ${result.scoreBreakdown.duplicates} - outdated ${result.scoreBreakdown.outdated} - unused ${result.scoreBreakdown.unused} - risk ${result.scoreBreakdown.risks}`
  );
  lines.push("");
  lines.push(summaryLine("Duplicates", result.duplicates.length));
  lines.push(summaryLine("Unused", result.unused.length));
  lines.push(summaryLine("Outdated", result.outdated.length));
  lines.push(summaryLine("Risks", result.risks.length));

  if (result.packages && result.packages.length > 0) {
    lines.push("");
    lines.push("Packages:");
    for (const pkg of result.packages) {
      lines.push(
        `- ${pkg.name}: ${pkg.score}/100, D:${pkg.ownershipSummary.duplicates} U:${pkg.ownershipSummary.unused} O:${pkg.ownershipSummary.outdated} R:${pkg.ownershipSummary.risks}`
      );
    }
  }

  appendSection(
    lines,
    "Duplicate dependencies",
    result.duplicates.map((item) =>
      formatEntry(
        `${item.name}: ${item.versions.join(", ")}${item.rootCause.length > 0 ? ` | via ${item.rootCause.join("; ")}` : ""}`,
        item.confidence,
        item.explanation,
        item.recommendation
      )
    )
  );

  appendSection(
    lines,
    "Unused dependencies",
    result.unused.map((item) =>
      formatEntry(
        item.package
          ? `${item.name} (${item.section}) [${item.package}]`
          : `${item.name} (${item.section})`,
        item.confidence,
        item.explanation,
        item.recommendation
      )
    )
  );

  appendSection(
    lines,
    "Outdated dependencies",
    result.outdated.map(
      (item) =>
        formatEntry(
          item.package
            ? `${item.name}: ${item.current} -> ${item.latest} [${item.updateType}] [${item.package}]`
            : `${item.name}: ${item.current} -> ${item.latest} [${item.updateType}]`,
          item.confidence,
          item.explanation,
          item.recommendation
        )
    )
  );

  appendSection(
    lines,
    "Risky dependencies",
    result.risks.map((item) =>
      formatEntry(
        item.package
          ? `${item.name}: ${item.reasons.join("; ")} [${item.package}] [trust ${item.trustScore.toUpperCase()}]`
          : `${item.name}: ${item.reasons.join("; ")} [trust ${item.trustScore.toUpperCase()}]`,
        item.confidence,
        item.explanation,
        item.recommendation
      )
    )
  );

  appendSection(lines, "Policy reasons", result.policy.reasons);

  if (result.suggestions.length > 0) {
    lines.push("");
    lines.push("Suggestions:");
    for (const suggestion of result.suggestions) {
      lines.push(`- ${suggestion}`);
    }
  }

  return lines.join("\n");
}

function summaryLine(label: string, count: number): string {
  const indicator = count === 0 ? "OK" : "WARN";
  return `${indicator} ${label}: ${count}`;
}

function appendSection(
  lines: string[],
  title: string,
  entries: string[]
): void {
  if (entries.length === 0) {
    return;
  }

  lines.push("");
  lines.push(`${title}:`);
  for (const entry of entries.slice(0, 10)) {
    lines.push(`- ${entry}`);
  }
}

function formatEntry(
  label: string,
  confidence: number,
  explanation: string[],
  recommendation?: AnalysisResult["unused"][number]["recommendation"]
): string {
  const reasonSummary =
    explanation.length > 0 ? ` | why: ${explanation.join("; ")}` : "";
  const recommendationSummary = recommendation
    ? ` | next: ${recommendation.summary}`
    : "";

  return `${label} | confidence ${Math.round(confidence * 100)}%${recommendationSummary}${reasonSummary}`;
}
