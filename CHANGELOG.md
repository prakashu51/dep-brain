# Changelog

All notable changes to this project will be documented in this file.

## 1.0.2

- Treated npm `overrides` entries as intentional version pins so direct override packages are not flagged as unused.
- Improved script/register-path inference for `ts-node/register` and `tsconfig-paths/register`.
- Suppressed common NestJS TypeScript tooling false positives for `source-map-support`, `ts-loader`, `ts-node`, and `tsconfig-paths`.
- Added regression coverage for override pins and NestJS debug/build script patterns.

## 1.0.1

- Reduced NestJS unused false positives for implicit runtime packages such as `@nestjs/platform-express` and `reflect-metadata`.
- Added script binary inference for common tooling packages used through `nest`, `eslint`, `jest`, `ts-node`, and related commands.
- Reduced risk-report noise by suppressing high-trust findings and medium-trust dev dependency findings.
- Stopped treating "no releases published in the last 30 days" as a standalone risk signal.
- Added regression tests for NestJS/tooling unused detection and weak risk-signal suppression.

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
