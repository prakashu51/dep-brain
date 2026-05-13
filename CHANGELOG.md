# Changelog

All notable changes to this project will be documented in this file.

## 1.5.0

- Added structured upgrade advisor data under `outdated[].advice`.
- Added `--advise` report mode for upgrade guidance output.
- Added stepped major-upgrade recommendations, release-note links, and breaking-change signals.
- Updated dashboard, console, and markdown outputs with upgrade-priority guidance.
- Bumped analysis output contract to `1.6` and added regression coverage for update advice.

## 1.4.0

- Added lockfile dependency-edge parsing so transitive relationships are available from npm, pnpm, and yarn lockfiles.
- Changed risk analysis from direct-package-only output to direct-owner risk summaries with `transitiveRiskScore` and `riskyTransitiveDeps`.
- Added transitive dependency counts and risky transitive counts to `riskFactors`.
- Updated console, markdown, and dashboard reports to highlight transitive risk hotspots.
- Bumped analysis output contract to `1.5` and added regression coverage for transitive risk propagation.

## 1.3.0

- Added plugin diagnostics under `extensions.depBrain.plugins` for failed plugin loads and hook errors.
- Added built-in `license` plugin through `plugins.enabled: ["license"]`.
- Added configurable risk thresholds for stale release days, aging release days, low downloads, and trust score weights.
- Added `--dashboard` and `--dashboard-out` for static HTML dashboard generation.
- Updated starter config, schemas, README, and tests for v1.3 behavior.

## 1.2.0

- Added `PluginManager` with `preScan`, `postScan`, and `reportHook` lifecycle support.
- Added disabled-by-default plugin config through `plugins.enabled` and `plugins.paths`.
- Added `extensions` to analysis output so plugins can enrich results without breaking schema.
- Added future config slots for risk thresholds, dashboard output, and notification webhook env names.
- Added regression coverage for plugin hooks enriching `extensions`.

## 1.1.0

- Added `--focus` modes for targeted duplicate, unused, outdated, risk, and health analysis.
- Added `--ci` for low-noise CI defaults focused on duplicate and runtime risk enforcement.
- Added `dep-brain init` to generate a starter `depbrain.config.json`.
- Introduced capped health score deductions so large outdated/risk counts do not automatically collapse project health to `0/100`.
- Added GitHub Action inputs for `focus` and `ci`.
- Added regression coverage for focused analysis and capped scoring.

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
