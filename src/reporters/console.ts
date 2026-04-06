import type { AnalysisResult } from "../core/analyzer.js";

export function renderConsoleReport(result: AnalysisResult): string {
  const lines: string[] = [];

  lines.push(`Project Health: ${result.score}/100`);
  lines.push(`Path: ${result.rootDir}`);
  lines.push("");
  lines.push(summaryLine("Duplicates", result.duplicates.length));
  lines.push(summaryLine("Unused", result.unused.length));
  lines.push(summaryLine("Outdated", result.outdated.length));
  lines.push(summaryLine("Risks", result.risks.length));

  appendSection(
    lines,
    "Duplicate dependencies",
    result.duplicates.map(
      (item) => `${item.name}: ${item.versions.join(", ")}`
    )
  );

  appendSection(
    lines,
    "Unused dependencies",
    result.unused.map((item) => `${item.name} (${item.section})`)
  );

  appendSection(
    lines,
    "Outdated dependencies",
    result.outdated.map(
      (item) => `${item.name}: ${item.current} -> ${item.latest} [${item.updateType}]`
    )
  );

  appendSection(
    lines,
    "Risky dependencies",
    result.risks.map((item) => `${item.name}: ${item.reasons.join("; ")}`)
  );

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
