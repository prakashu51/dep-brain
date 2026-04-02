import type { AnalysisResult } from "../core/analyzer.js";

export function renderConsoleReport(result: AnalysisResult): string {
  const lines: string[] = [];

  lines.push(`Project Health: ${result.score}/100`);
  lines.push("");
  lines.push(`${result.duplicates.length} duplicate dependencies`);
  lines.push(`${result.unused.length} unused packages`);
  lines.push(`${result.outdated.length} outdated libraries`);
  lines.push(`${result.risks.length} risky dependencies`);

  if (result.suggestions.length > 0) {
    lines.push("");
    lines.push("Suggestions:");
    for (const suggestion of result.suggestions) {
      lines.push(`- ${suggestion}`);
    }
  }

  return lines.join("\n");
}
