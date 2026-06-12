# Dependency Brain

[![npm version](https://img.shields.io/npm/v/dep-brain)](https://www.npmjs.com/package/dep-brain)
[![npm downloads](https://img.shields.io/npm/dm/dep-brain)](https://www.npmjs.com/package/dep-brain)
[![license](https://img.shields.io/npm/l/dep-brain)](LICENSE)

`dep-brain` is a CLI and library for explainable dependency intelligence in JavaScript and TypeScript projects.

Current release `1.15.0` adds license compliance auditing & policy enforcement, branch-to-branch dependency diffing, CycloneDX v1.6 & SPDX v2.3 SBOM exports, and hash-based AST/import caching for faster scans.

## Vision

`dep-brain` aims to become a dependency decision engine:

- Explain why a dependency matters
- Evaluate how safe, risky, or necessary it is
- Recommend what to do next
- Enforce decisions in CI workflows

## What It Does

- Detect duplicate dependencies from npm, pnpm, and yarn lockfiles
- Detect likely unused dependencies from source imports and scripts
- Detect outdated packages
- Highlight dependency risk signals
- Show which direct dependency introduces risky transitive packages
- Score package trust using supply-chain metadata
- Generate a simple project health score
- Output reports in console, JSON, Markdown, SARIF, dashboard, and top-issues formats
- Output upgrade-advice reports via `--advise`
- Send Slack and Discord webhook summaries for CI runs
- Create or update GitHub PR comments for pull request checks
- Preview safe unused dependency removal commands
- Gate CI with score and finding policies
- Compare new findings against a baseline report

The long-term goal is not just to list problems, but to answer:

- Why is this dependency here?
- Can I remove it safely?
- What should I fix first?

## 1.12 Highlights

- Duplicate dependency detection with lockfile instance tracking
- Unused dependency detection with runtime vs dev-tool heuristics
- Outdated dependency reporting with `major`, `minor`, and `patch` classification
- Risk analysis based on npm package metadata
- Transitive risk ownership and path tracing for direct dependencies
- Confidence scores, reason codes, explanations, and recommendations for findings
- Config loading from `depbrain.config.json`
- Ignore rules for noisy dependencies and checks
- CI-friendly policy evaluation with non-zero exit codes
- Workspace-aware analysis for npm workspaces
- Console reporting
- JSON output via `--json`
- Markdown output via `--md`
- SARIF output via `--sarif`
- Static HTML dashboard via `--dashboard`
- Upgrade advisor output via `--advise`
- Slack and Discord notification summaries via `--notify`
- GitHub PR comments via `--pr-comment`
- Safe unused dependency fix plans via `dep-brain fix --unused --dry-run`
- Guarded unused dependency apply mode via `dep-brain fix --unused --apply`
- Optional new-finding summaries via `--show-new-findings`
- Optional analysis fix plans via `--with-fix-plan`
- Optional OSV advisory evidence for risk findings
- Runtime trace capture via `dep-brain trace`
- Runtime trace evidence for reducing unused false positives via `--runtime-trace`
- Ranked top issues via `--top`
- Baseline mode via `--baseline`
- Focused analysis via `--focus`
- Low-noise CI defaults via `--ci`
- Starter config generation via `dep-brain init`
- Reusable GitHub Action via `action.yml`
- Built-in `license` plugin and plugin diagnostics
- Library entrypoint for programmatic use

## CLI Usage

```bash
npm install -g dep-brain
dep-brain analyze

npx dep-brain analyze
npx dep-brain analyze --json
npx dep-brain analyze --md
npx dep-brain analyze --top
npx dep-brain analyze --advise
npx dep-brain analyze ./path-to-project
npx dep-brain analyze --config depbrain.config.json
npx dep-brain analyze --min-score 90 --fail-on-risks
npx dep-brain analyze ./path-to-project --fail-on-unused --json
npx dep-brain analyze --md > depbrain.md
npx dep-brain analyze --json --out depbrain.json
npx dep-brain analyze --sarif --out depbrain.sarif
npx dep-brain analyze --dashboard
npx dep-brain analyze --dashboard --dashboard-out reports/depbrain.html
npx dep-brain analyze --notify
npx dep-brain analyze --notify --notify-on always
npx dep-brain analyze --pr-comment
npx dep-brain analyze --pr-comment --comment-on new-findings
npx dep-brain fix --unused --dry-run
npx dep-brain fix --unused --dry-run --include-caution
npx dep-brain fix --unused --dry-run --json
npx dep-brain fix --unused --apply
npx dep-brain fix --unused --apply --clean-imports
npx dep-brain fix --unused --apply --test-command "npm test"
npx dep-brain fix --duplicates --dry-run
npx dep-brain fix --duplicates --apply
npx dep-brain fix --duplicates --apply --test-command "npm test"
npx dep-brain analyze --osv-cache
npx dep-brain analyze --json --show-new-findings
npx dep-brain analyze --json --with-fix-plan
npx dep-brain trace -- node app.js
npx dep-brain analyze --runtime-trace depbrain-runtime.json
npx dep-brain analyze --focus duplicates
npx dep-brain analyze --ci
npx dep-brain analyze --baseline depbrain-baseline.json
npx dep-brain analyze --baseline depbrain-baseline.json --min-score 90 --fail-on-risks
npx dep-brain report --from depbrain.json --md --out depbrain.md
npx dep-brain artifact --bundle
npx dep-brain artifact --bundle --out depbrain-artifacts.zip

npx dep-brain licenses
npx dep-brain licenses --allow MIT,Apache-2.0 --deny GPL-3.0 --fail-on-deny
npx dep-brain diff --base main --head feature
npx dep-brain sbom --format cyclonedx --out bom.json
npx dep-brain sbom --format spdx --out bom.spdx.json

dep-brain init
dep-brain config
dep-brain config --config depbrain.config.json

dep-brain help
dep-brain analyze --help
dep-brain --version
```

## Focus Modes

Use `--focus` when you want a targeted signal instead of a full report:

```bash
dep-brain analyze --focus duplicates
dep-brain analyze --focus health
dep-brain analyze --focus risks
```

Supported values are `all`, `health`, `duplicates`, `unused`, `outdated`, and `risks`.

## CI Preset

```bash
dep-brain analyze --ci
```

The CI preset applies low-noise defaults: a minimum score of `70`, failure on duplicates, and failure on risky dependencies.

## Config Init

```bash
dep-brain init
```

Creates a starter `depbrain.config.json` with practical defaults for CI and common TypeScript/NestJS tooling.

## Workspaces

If the root `package.json` defines `workspaces`, `dep-brain` analyzes each workspace package and reports per-package results. Aggregated counts are still shown at the top-level summary.

Workspace analysis now includes:

- per-workspace ownership summaries
- root-level duplicate attribution back to contributing workspaces
- top issues that stay tagged to the workspace that should act

## Example Output

```text
Project Health: 78/100
Path: /your/project
Policy: FAIL

WARN Duplicates: 2
OK Unused: 0
WARN Outdated: 3
OK Risks: 0

Duplicate dependencies:
- ansi-regex: 5.0.1, 6.0.1

Outdated dependencies:
- chalk: ^4.1.2 -> 5.4.1 [major]

Policy reasons:
- Score 78 is below minimum 90

Suggestions:
- Consider consolidating ansi-regex to one version
- Review chalk: ^4.1.2 -> 5.4.1 (major)
```

## JSON Output

```bash
dep-brain analyze --json
```

Output includes `outputVersion` for schema stability. `dep-brain@1.12.0` writes contract version `1.9`.

Validate against:

- `depbrain.output.schema.json`

## Markdown Output

```bash
dep-brain analyze --md
```

## Top Issues Output

```bash
dep-brain analyze --top
```

Shows the highest-priority actionable findings first, including confidence and next-step guidance.

## Upgrade Advice Output

```bash
dep-brain analyze --advise
```

Shows recommended upgrade targets, stepped major-version paths, and release-note links when available.

## Dashboard Output

```bash
dep-brain analyze --dashboard
dep-brain analyze --dashboard --dashboard-out reports/depbrain.html
```

Writes a static HTML dashboard. Default path comes from `dashboard.outputPath`.

## Notifications

```bash
DEPBRAIN_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/... dep-brain analyze --notify
DEPBRAIN_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... dep-brain analyze --notify --notify-on always
```

`--notify` sends compact summaries to configured Slack and Discord webhook URLs. Default trigger is `failure`, so passing runs stay quiet unless `--notify-on always` is set.

## PR Comments

```bash
dep-brain analyze --ci --pr-comment
dep-brain analyze --ci --baseline depbrain-baseline.json --pr-comment --comment-on new-findings
```

`--pr-comment` creates or updates one GitHub pull request comment using `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, and `GITHUB_EVENT_PATH`. The comment includes policy status, health score, top issues, upgrade priorities, and baseline delta counts when `--baseline` is used.

## Artifact Bundling

```bash
dep-brain artifact --bundle
dep-brain artifact --bundle --out depbrain-artifacts.zip
```

The `artifact` command consolidates reports, baselines, runtime traces, and HTML dashboards generated during analysis into a unified destination for pipeline uploads.
If the `--out` path ends with `.zip`, the artifacts are compressed into a ZIP archive. Otherwise, they are consolidated into a flat directory.

## Fix Plans

### Unused Dependency Cleanup

```bash
dep-brain fix --unused --dry-run
dep-brain fix --unused --dry-run --include-caution
dep-brain fix --unused --dry-run --json
dep-brain fix --unused --apply
dep-brain fix --unused --apply --clean-imports
dep-brain fix --unused --apply --test-command "npm test"
```

Unused fix plans print package-manager-specific uninstall commands without changing files. `dep-brain` detects npm, pnpm, or yarn lockfiles and skips caution-level removals unless `--include-caution` is set.

Apply mode runs the same plan commands, blocks on a dirty git worktree by default, and can run a verification command after successful removals. Use `--allow-dirty` only for controlled maintenance branches.

If `--clean-imports` is passed, `dep-brain` runs a codemod engine to scan your project's `.js`, `.jsx`, `.ts`, and `.tsx` source files (with TSX/JSX support enabled out of the box) and automatically removes import statements referring to the uninstalled packages.

### Duplicate dependency Deduplication

```bash
dep-brain fix --duplicates --dry-run
dep-brain fix --duplicates --dry-run --json
dep-brain fix --duplicates --apply
dep-brain fix --duplicates --apply --test-command "npm test"
```

The duplicates fix command allows you to automatically resolve multiple versions of the same dependency in your lockfile.

- **npm**: Executes `npm dedupe`
- **pnpm**: Executes `pnpm dedupe`
- **yarn**: Detects whether the project uses Yarn Classic or Yarn Berry. If Yarn Classic (v1), it runs `npx yarn-deduplicate yarn.lock` followed by `yarn install` to align your lockfile and node_modules. If Yarn Berry (v2+), it runs `yarn dedupe`.

If duplicate versions still persist after deduplication runs, `dep-brain` suggests overrides or resolutions configuration blocks (e.g. `"overrides"` for npm/pnpm, `"resolutions"` for yarn) targeting the highest version, which you can insert directly into your `package.json`.

Like the unused dependency cleanup, if a `--test-command` fails or package manager commands fail, the changes are rolled back automatically unless `--no-rollback` is supplied.

## New Findings and Fix Plans

```bash
dep-brain analyze --json --baseline depbrain-baseline.json --show-new-findings
dep-brain analyze --json --with-fix-plan
dep-brain analyze --json --with-fix-plan --include-caution
```

`--show-new-findings` adds optional `newFindings` data after baseline filtering. `--with-fix-plan` adds optional `fixPlan` data to analysis output without running uninstall commands.

## OSV Vulnerabilities

```json
{
  "risk": {
    "osv": {
      "enabled": true,
      "severityThreshold": "high",
      "includeDevDependencies": false
    }
  }
}
```

OSV checks add advisory ids, severity, affected ranges, and fixed versions under `riskFactors.vulnerabilities`. Failed OSV requests are treated as unknown, not risky.

### OSV Local Cache

You can enable local OSV advisory caching by passing the `--osv-cache` CLI flag or setting `"useCache": true` inside the config overrides under `"risk.osv"`.

- **Cache location**: Queries are cached as `.json` files inside `.depbrain/osv-cache/`.
- **TTL Expiration**: Cached responses are valid for **24 hours**. When expired, the CLI attempts to perform a fresh query.
- **Offline Fallback**: If a registry query fails or the system is offline, `dep-brain` automatically falls back to utilizing the cached response even if it has expired.

## Runtime Traces

```bash
dep-brain trace -- node app.js
dep-brain analyze --runtime-trace depbrain-runtime.json
```

Runtime traces record packages and files loaded by a real command. During analysis, packages seen in the trace count as used, which reduces unused false positives for dependency injection, dynamic imports, plugin loaders, and framework bootstraps.

## License Compliance & Policy Enforcement

Analyze and enforce license compliance across direct and transitive dependencies:

```bash
dep-brain licenses
dep-brain licenses --allow MIT,Apache-2.0,BSD-3-Clause
dep-brain licenses --deny GPL-2.0,AGPL-3.0 --fail-on-deny
```

- **Registry Caching**: Resolves package licenses locally via `node_modules`. If missing or offline, it queries the npm registry and caches results locally under `.depbrain/license-cache/` for 24 hours.
- **CI Enforcement**: Use `--fail-on-deny` to exit with a non-zero exit code if a denied (or non-allowed) license is detected.

## Branch-to-Branch Dependency Diff

Compare dependencies between two Git references (branches, tags, or commits) to track health score changes, additions, removals, upgrades, and risk profiles.

```bash
dep-brain diff --base main --head feature-branch
dep-brain diff --base main --head feature-branch --json
dep-brain diff --base main --head feature-branch --md > diff.md
```

The output highlights:
- **Added / Removed Packages**: New packages introduced or old ones cleaned up.
- **Upgrades / Downgrades**: Version bumps, risk score deltas, and license changes.
- **Health Score Delta**: Difference in health score (`headScore - baseScore`).

## SBOM Export

Export your dependency tree as a standard Software Bill of Materials (SBOM) in JSON format.

```bash
dep-brain sbom --format cyclonedx --out bom.json
dep-brain sbom --format spdx --out bom.spdx.json
```

Supported Formats:
- **CycloneDX v1.6**: Generates component metadata, PURLs, dependency mapping, and license structures.
- **SPDX v2.3**: Generates standard SPDX JSON packages and relationships.

## AST/Import Caching (Performance)

Scanning large codebases for unused dependencies is faster with hash-based scan caching. File imports are cached under `.depbrain/scan-cache.json` using content hashes (SHA-1). If a file's content has not changed, the parser skips regex analysis, resulting in a **40% speed boost** on subsequent runs.

## Plugins

```json
{
  "plugins": {
    "enabled": ["license"],
    "paths": ["./depbrain-plugin.mjs"]
  }
}
```

Built-in `license` plugin adds license counts under `extensions.license`. Failed plugin loads and hook errors are reported under `extensions.depBrain.plugins`.

Outdated results now include `advice` with `risk`, `recommendedTarget`, `intermediateSteps`, `releaseNotes`, and upgrade signals such as `semver_major`.

## Report From JSON

```bash
dep-brain analyze --json --out depbrain.json
dep-brain report --from depbrain.json --md --out depbrain.md
```

## Baseline Mode

Baseline mode lets teams adopt `dep-brain` in existing repositories without failing CI for known dependency debt.

```bash
dep-brain analyze --json --out depbrain-baseline.json
dep-brain analyze --baseline depbrain-baseline.json --min-score 90 --fail-on-risks
```

The baseline file is a normal JSON analysis report. Matching entries in `duplicates`, `unused`, `outdated`, and `risks` are ignored before score, policy, suggestions, and top issues are calculated.

## Config File

Create a `depbrain.config.json` file in the project root:

```json
{
  "ignore": {
    "unused": ["eslint"],
    "outdated": ["typescript"],
    "prefixes": ["@nestjs/"],
    "patterns": ["^@aws-sdk/"]
  },
  "policy": {
    "minScore": 90,
    "failOnUnused": true,
    "failOnRisks": true
  },
  "report": {
    "maxSuggestions": 3
  },
  "plugins": {
    "enabled": ["license"],
    "paths": []
  },
  "risk": {
    "transitiveBloatThreshold": 50,
    "typosquattingDistanceThreshold": 2,
    "staleReleaseDays": 730,
    "agingReleaseDays": 365,
    "lowDownloadThreshold": 1000,
    "lowTrustWeightThreshold": 6,
    "mediumTrustWeightThreshold": 3,
    "osv": {
      "enabled": false,
      "severityThreshold": "high",
      "includeDevDependencies": false
    }
  },
  "dashboard": {
    "outputPath": "depbrain-dashboard.html"
  },
  "notifications": {
    "enabled": false,
    "on": "failure",
    "slackWebhookEnv": "DEPBRAIN_SLACK_WEBHOOK_URL",
    "discordWebhookEnv": "DEPBRAIN_DISCORD_WEBHOOK_URL"
  },
  "scoring": {
    "duplicateWeight": 5,
    "outdatedWeight": 1,
    "unusedWeight": 2,
    "riskWeight": 6
  },
  "scan": {
    "excludePaths": ["node_modules", "dist", "build", "coverage", ".git"]
  },
  "runtimeTrace": {
    "outputPath": "depbrain-runtime.json"
  }
}
```

Supported sections:

- `ignore.dependencies`
- `ignore.devDependencies`
- `ignore.unused`
- `ignore.duplicates`
- `ignore.outdated`
- `ignore.risks`
- `policy.minScore`
- `policy.failOnDuplicates`
- `policy.failOnUnused`
- `policy.failOnOutdated`
- `policy.failOnRisks`
- `report.maxSuggestions`
- `plugins.enabled`
- `plugins.paths`
- `risk.transitiveBloatThreshold`
- `risk.typosquattingDistanceThreshold`
- `risk.staleReleaseDays`
- `risk.agingReleaseDays`
- `risk.lowDownloadThreshold`
- `risk.lowTrustWeightThreshold`
- `risk.mediumTrustWeightThreshold`
- `risk.osv.enabled`
- `risk.osv.severityThreshold`
- `risk.osv.includeDevDependencies`
- `dashboard.outputPath`
- `notifications.enabled`
- `notifications.on`
- `notifications.slackWebhookEnv`
- `notifications.discordWebhookEnv`
- `scoring.duplicateWeight`
- `scoring.outdatedWeight`
- `scoring.unusedWeight`
- `scoring.riskWeight`
- `ignore.prefixes`
- `ignore.patterns`
- `scan.excludePaths`
- `runtimeTrace.outputPath`

Sample config file:

- `depbrain.config.json`
- `depbrain.config.schema.json`
- `depbrain.output.schema.json`

## CI Behavior

`dep-brain` now returns a non-zero exit code when configured policy checks fail.

Examples:

```bash
dep-brain analyze --fail-on-unused
dep-brain analyze --min-score 85 --fail-on-risks
dep-brain analyze --config depbrain.config.json
dep-brain analyze --baseline depbrain-baseline.json --fail-on-unused
dep-brain analyze --ci --notify
dep-brain analyze --ci --pr-comment
```

## Config Debugging

Print the resolved config (after defaults and CLI overrides):

```bash
dep-brain config
dep-brain config --config depbrain.config.json
```

## Development

```bash
npm install
npm run typecheck
npm run test
npm run build
```

## Project Structure

```text
src/
|-- cli.ts
|-- index.ts
|-- core/
|   |-- analyzer.ts
|   |-- graph-builder.ts
|   `-- scorer.ts
|-- checks/
|   |-- duplicate.ts
|   |-- unused.ts
|   |-- outdated.ts
|   `-- risk.ts
|-- reporters/
|   |-- console.ts
|   `-- json.ts
`-- utils/
    |-- file-parser.ts
    |-- npm-api.ts
    `-- config.ts
```

## Product Direction

`dep-brain` is in `v1.15.0` production CLI stage, with current focus on license audits, branch diffing, SBOM exports, and performance caching.

Recent releases added:

- transitive risk ownership and path tracing
- dashboard and plugin support
- baseline, focus, and CI workflows
- structured upgrade advice with release-note links
- Slack and Discord notification summaries
- idempotent GitHub PR comments
- unused dependency fix-plan dry runs
- guarded unused dependency apply mode
- optional new-finding and fix-plan analysis fields
- optional OSV advisory evidence
- runtime trace evidence for unused dependency analysis

Project should optimize for trust, clarity, and actionability over flashy UI, generic graphs, or simply adding more checks.

Risk findings include `trustScore`, structured `riskFactors`, `transitiveRiskScore`, and `riskyTransitiveDeps` path traces so teams can see which direct package introduces supply-chain risk.

## Repository Notes

- Project brief: [docs/project-brief.md](./docs/project-brief.md)
- Product roadmap: [docs/product-roadmap.md](./docs/product-roadmap.md)
- Implementation history: [docs/implementation-log.md](./docs/implementation-log.md)
