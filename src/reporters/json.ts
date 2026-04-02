import type { AnalysisResult } from "../core/analyzer.js";

export function renderJsonReport(result: AnalysisResult): string {
  return JSON.stringify(result, null, 2);
}
