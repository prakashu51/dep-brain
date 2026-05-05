import type { AnalysisResult, TopIssue } from "../core/analyzer.js";

export function renderDashboardReport(result: AnalysisResult): string {
  const topIssues = result.topIssues.map(renderTopIssue).join("");
  const suggestions = result.suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Dependency Brain Dashboard</title>",
    "<style>",
    "body{font-family:Arial,sans-serif;margin:0;color:#172033;background:#f6f8fb}",
    "main{max-width:1120px;margin:0 auto;padding:32px}",
    "header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:24px}",
    "h1{font-size:28px;margin:0 0 8px}",
    "h2{font-size:18px;margin:0 0 12px}",
    ".muted{color:#637083;font-size:13px}",
    ".score{font-size:48px;font-weight:700}",
    ".grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:20px}",
    ".panel{background:#fff;border:1px solid #dce3ee;border-radius:8px;padding:16px}",
    ".metric{font-size:28px;font-weight:700;margin-top:4px}",
    ".pass{color:#167a43}.fail{color:#b42318}",
    "ol,ul{margin:0;padding-left:20px}",
    "li{margin:8px 0}",
    ".issue{margin-bottom:10px}",
    ".kind{font-size:12px;text-transform:uppercase;color:#637083}",
    "@media(max-width:760px){main{padding:20px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}header{display:block}.score{font-size:40px}}",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    "<header>",
    "<div>",
    "<h1>Dependency Brain Dashboard</h1>",
    `<div class="muted">${escapeHtml(result.rootDir)}</div>`,
    "</div>",
    `<div class="${result.policy.passed ? "pass" : "fail"} score">${result.score}/100</div>`,
    "</header>",
    '<section class="grid">',
    renderMetric("Duplicates", result.duplicates.length),
    renderMetric("Unused", result.unused.length),
    renderMetric("Outdated", result.outdated.length),
    renderMetric("Risks", result.risks.length),
    "</section>",
    '<section class="panel">',
    "<h2>Policy</h2>",
    `<p class="${result.policy.passed ? "pass" : "fail"}">${result.policy.passed ? "Passed" : "Failed"}</p>`,
    result.policy.reasons.length > 0
      ? `<ul>${result.policy.reasons.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : '<p class="muted">No policy failures.</p>',
    "</section>",
    '<section class="panel">',
    "<h2>Top Issues</h2>",
    topIssues.length > 0 ? `<ol>${topIssues}</ol>` : '<p class="muted">No actionable issues found.</p>',
    "</section>",
    '<section class="panel">',
    "<h2>Suggestions</h2>",
    suggestions.length > 0 ? `<ul>${suggestions}</ul>` : '<p class="muted">No suggestions.</p>',
    "</section>",
    "</main>",
    "</body>",
    "</html>"
  ].join("\n");
}

function renderMetric(label: string, value: number): string {
  return `<div class="panel"><div class="muted">${escapeHtml(label)}</div><div class="metric">${value}</div></div>`;
}

function renderTopIssue(item: TopIssue): string {
  return [
    '<li class="issue">',
    `<div class="kind">${escapeHtml(item.kind)} ${escapeHtml(item.priority)}</div>`,
    `<strong>${escapeHtml(item.name)}</strong>`,
    `<div>${escapeHtml(item.recommendation.summary)}</div>`,
    "</li>"
  ].join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
