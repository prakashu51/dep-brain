# Changelog

All notable changes to this project will be documented in this file.

## 1.0.0

- Stable v1 CLI and library release for explainable dependency intelligence.
- Added baseline mode with `--baseline <file>` to ignore existing dependency debt in CI.
- Added reusable GitHub Action metadata through `action.yml`.
- Added SARIF export support for code scanning workflows.
- Added stable JSON output fields for confidence, reason codes, explanations, recommendations, top issues, score breakdown, and workspace ownership summaries.
- Added bounded registry request parallelism for outdated and risk checks.
- Documented v1 readiness, release validation, and CI usage.

## 0.9.0

- Workspace-aware analysis for npm workspaces.
- Config loading and CI policy controls.
- Improved duplicate detection and unused dependency heuristics.
- Actionable recommendations for unused, duplicate, outdated, and risk findings.
- Ranked top-issues summary output with `--top`.
- Supply-chain trust scoring for risk findings.
- Structured risk factors in JSON output.
- Monorepo ownership summaries for workspace packages.
- Workspace-level duplicate attribution and root-cause tracing.
