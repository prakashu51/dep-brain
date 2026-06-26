# Changelog

All notable changes to this project will be documented in this file.

## 1.16.0

- Added Policy as Code support (`dep-brain.policy.yml`) to define declarative rules for risk thresholds, license allow/deny, and outdated limits.
- Added new CLI command `dep-brain check --policy` that evaluates declarative rules and exits with a non-zero status code on violation.
- Upgraded Risk Scoring to v2 by integrating OpenSSF Scorecard metrics, detecting low repository activity and slow issue response times.
- Implemented Scorecard cache mechanism (24h TTL) and offline fallback.

## 1.15.0

- Added `dep-brain licenses` command to show licenses of direct and transitive dependencies.
- Added license policies with `--allow`, `--deny`, and `--fail-on-deny` options.
- Added `dep-brain diff` to compare branches for dependency, risk, and license changes.
- Added `dep-brain sbom` command to export CycloneDX v1.6 and SPDX v2.3 SBOM formats.

## 1.12.0

- Added `dep-brain trace -- <command>` to capture runtime package and file evidence.
- Added `--runtime-trace <path>` to merge runtime evidence into unused dependency analysis.
- Added `runtimeTrace.outputPath` config and schema support.
- Updated console and Markdown reports with runtime evidence counts.
- Bumped analysis output contract to `1.9` for optional `runtimeEvidence`.

## 1.11.0

- Added optional OSV vulnerability lookup for risk analysis.
- Added `risk.osv.enabled`, `risk.osv.severityThreshold`, and `risk.osv.includeDevDependencies` config.
- Added advisory id, severity, affected range, and fixed version data under `riskFactors.vulnerabilities`.
- Updated console, Markdown, dashboard, PR comment, and notification output with vulnerability data.
- Bumped analysis output contract to `1.8` for vulnerability fields.

## 1.10.0

- Added `--show-new-findings` for optional baseline-filtered finding summaries.
- Added `--with-fix-plan` for optional unused dependency fix plans in analysis output.
- Updated Markdown, PR comment, and notification summaries to surface new-finding data when present.
- Bumped analysis output contract to `1.7` for optional `newFindings` and `fixPlan` fields.

## 1.9.0

- Added `dep-brain fix --unused --apply` for guarded unused dependency cleanup.
- Added dirty git worktree protection with `--allow-dirty` override.
- Added `--test-command` verification after successful fix application.
- Added apply result output with applied, skipped, failed, and test status details.
- Kept analysis output contract at `1.6` because no analysis JSON result fields changed.

## 1.8.0

- Added `dep-brain fix --unused --dry-run` for safe unused dependency removal previews.
- Added package-manager command rendering for npm, pnpm, and yarn.
- Added `--include-caution` to include caution-level unused dependency removals.
- Added JSON output for fix plans with commands, included items, and skipped items.
- Kept analysis output contract at `1.6` because no analysis JSON result fields changed.

## 1.7.0

- Added idempotent GitHub PR comments with `--pr-comment`.
- Added `--comment-on` trigger support for `always`, `failure`, and `new-findings`.
- Added PR comment markdown renderer with top issues, policy reasons, upgrade priorities, and baseline delta counts.
- Added GitHub Action inputs for PR comment runs.
- Kept analysis output contract at `1.6` because no JSON result fields changed.

## 1.6.0

- Added Slack and Discord webhook notification summaries.
- Added `--notify` and `--notify-on` CLI controls.
- Added notification config with `enabled`, `on`, `slackWebhookEnv`, and `discordWebhookEnv`.
- Added GitHub Action inputs for notification runs.
- Kept analysis output contract at `1.6` because no JSON result fields changed.

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
