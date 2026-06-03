import type { AnalysisResult } from "../core/analyzer.js";

export function renderMarkdownReport(result: AnalysisResult): string {
  const lines: string[] = [];

  lines.push(`# Dependency Brain Report`);
  lines.push("");
  if (result.topIssues.length > 0) {
    lines.push("## Top Issues");
    for (const item of result.topIssues) {
      lines.push(
        `- **${item.priority.toUpperCase()}** ${item.kind} \`${item.name}\`${item.package ? ` [${item.package}]` : ""}${item.trustScore ? ` | trust ${item.trustScore.toUpperCase()}` : ""} | confidence ${Math.round(item.confidence * 100)}% | ${item.summary}`
      );
    }
    lines.push("");
  }

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
        `- ${pkg.name}: ${pkg.score}/100 (D:${pkg.ownershipSummary.duplicates} U:${pkg.ownershipSummary.unused} O:${pkg.ownershipSummary.outdated} R:${pkg.ownershipSummary.risks})`
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

  if (result.newFindings) {
    lines.push("## New Findings");
    lines.push(`- Duplicates: ${result.newFindings.counts.duplicates}`);
    lines.push(`- Unused: ${result.newFindings.counts.unused}`);
    lines.push(`- Outdated: ${result.newFindings.counts.outdated}`);
    lines.push(`- Risks: ${result.newFindings.counts.risks}`);
    lines.push("");
  }

  if (result.fixPlan) {
    lines.push("## Fix Plan");
    lines.push(`- Package manager: ${result.fixPlan.packageManager}`);
    lines.push(`- Commands: ${result.fixPlan.commands.length}`);
    lines.push(`- Skipped: ${result.fixPlan.skipped.length}`);
    for (const command of result.fixPlan.commands.slice(0, 5)) {
      lines.push(`- \`${command}\``);
    }
    lines.push("");
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
    result.outdated.map((item) =>
      formatEntry(
        item.package
          ? `${item.name}: ${item.current} -> ${item.latest} [${item.updateType}] [${item.package}]${formatOutdatedAdviceSuffix(item)}`
          : `${item.name}: ${item.current} -> ${item.latest} [${item.updateType}]${formatOutdatedAdviceSuffix(item)}`,
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
          ? `${item.name}: ${item.reasons.join("; ")} [${item.package}] [trust ${item.trustScore.toUpperCase()}]${formatTransitiveRiskSuffix(item)}`
          : `${item.name}: ${item.reasons.join("; ")} [trust ${item.trustScore.toUpperCase()}]${formatTransitiveRiskSuffix(item)}`,
        item.confidence,
        item.explanation,
        item.recommendation
      )
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

function formatTransitiveRiskSuffix(item: AnalysisResult["risks"][number]): string {
  if (item.riskyTransitiveDeps.length === 0) {
    return "";
  }

  const names = item.riskyTransitiveDeps.slice(0, 3).map((entry) => entry.name).join(", ");
  return ` [transitive score ${item.transitiveRiskScore}] [via ${names}]`;
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

function formatOutdatedAdviceSuffix(item: AnalysisResult["outdated"][number]): string {
  if (!item.advice.recommendedTarget) {
    return "";
  }

  const steps =
    item.advice.intermediateSteps.length > 1
      ? ` steps ${item.advice.intermediateSteps.join(" -> ")}`
      : "";
  return ` [advice ${item.advice.risk.toUpperCase()} target ${item.advice.recommendedTarget}${steps}]`;
}
