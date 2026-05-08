import type { AnalysisResult, TopIssue } from "../core/analyzer.js";

export function renderDashboardReport(result: AnalysisResult): string {
  const topIssues = result.topIssues.map(renderTopIssue).join("");
  const suggestions = result.suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const transitiveHotspots = result.risks
    .filter((item) => item.riskyTransitiveDeps.length > 0)
    .sort((left, right) => right.transitiveRiskScore - left.transitiveRiskScore)
    .map(renderTransitiveHotspot)
    .join("");

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
    "h3{font-size:15px;margin:0 0 8px}",
    ".muted{color:#637083;font-size:13px}",
    ".score{font-size:48px;font-weight:700}",
    ".grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:20px}",
    ".split{display:grid;grid-template-columns:1.2fr .8fr;gap:16px;margin-top:16px}",
    ".panel{background:#fff;border:1px solid #dce3ee;border-radius:8px;padding:16px}",
    ".metric{font-size:28px;font-weight:700;margin-top:4px}",
    ".pass{color:#167a43}.fail{color:#b42318}",
    "ol,ul{margin:0;padding-left:20px}",
    "li{margin:8px 0}",
    ".issue{margin-bottom:10px}",
    ".kind{font-size:12px;text-transform:uppercase;color:#637083}",
    ".hotspot{border-top:1px solid #e7ecf4;padding-top:12px;margin-top:12px}",
    ".path{font-family:Consolas,monospace;font-size:12px;background:#f3f6fb;border-radius:6px;padding:6px 8px;margin:6px 0}",
    "@media(max-width:760px){main{padding:20px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.split{grid-template-columns:1fr}header{display:block}.score{font-size:40px}}",
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
    '<section class="split">',
    '<div class="panel">',
    "<h2>Policy</h2>",
    `<p class="${result.policy.passed ? "pass" : "fail"}">${result.policy.passed ? "Passed" : "Failed"}</p>`,
    result.policy.reasons.length > 0
      ? `<ul>${result.policy.reasons.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : '<p class="muted">No policy failures.</p>',
    "</div>",
    '<div class="panel">',
    "<h2>Risk Snapshot</h2>",
    `<div class="muted">${result.risks.filter((item) => item.riskyTransitiveDeps.length > 0).length} direct dependencies carry transitive risk.</div>`,
    `<div class="metric">${result.risks.reduce((total, item) => total + item.transitiveRiskScore, 0)}</div>`,
    '<div class="muted">Total transitive risk score</div>',
    "</div>",
    "</section>",
    '<section class="split">',
    '<div class="panel">',
    "<h2>Top Issues</h2>",
    topIssues.length > 0 ? `<ol>${topIssues}</ol>` : '<p class="muted">No actionable issues found.</p>',
    "</div>",
    '<div class="panel">',
    "<h2>Suggestions</h2>",
    suggestions.length > 0 ? `<ul>${suggestions}</ul>` : '<p class="muted">No suggestions.</p>',
    "</div>",
    "</section>",
    '<section class="panel">',
    "<h2>Transitive Risk Hotspots</h2>",
    transitiveHotspots.length > 0
      ? transitiveHotspots
      : '<p class="muted">No transitive risk hotspots found.</p>',
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

function renderTransitiveHotspot(item: AnalysisResult["risks"][number]): string {
  return [
    '<div class="hotspot">',
    `<h3>${escapeHtml(item.name)} <span class="muted">score ${item.transitiveRiskScore}</span></h3>`,
    `<div class="muted">${item.riskFactors.transitiveDependencyCount} transitive dependencies, ${item.riskyTransitiveDeps.length} risky transitive dependencies</div>`,
    "<ul>",
    item.riskyTransitiveDeps
      .slice(0, 4)
      .map(
        (entry) =>
          `<li><strong>${escapeHtml(entry.name)}</strong> [${escapeHtml(entry.trustScore.toUpperCase())}]<div>${escapeHtml(entry.reasons.join("; "))}</div>${entry.introducedByPaths.map((trace) => `<div class="path">${escapeHtml(trace)}</div>`).join("")}</li>`
      )
      .join(""),
    "</ul>",
    "</div>"
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
