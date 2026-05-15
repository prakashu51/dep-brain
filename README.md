# Dependency Brain

[![npm version](https://img.shields.io/npm/v/dep-brain)](https://www.npmjs.com/package/dep-brain)
[![npm downloads](https://img.shields.io/npm/dm/dep-brain)](https://www.npmjs.com/package/dep-brain)
[![license](https://img.shields.io/npm/l/dep-brain)](LICENSE)

`dep-brain` is a CLI and library for explainable dependency intelligence in JavaScript and TypeScript projects.

Current release `1.5.0` adds upgrade-advice output, stepped major-version guidance, release-note links, and analysis output contract `1.6`.

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
- Gate CI with score and finding policies
- Compare new findings against a baseline report

The long-term goal is not just to list problems, but to answer:

- Why is this dependency here?
- Can I remove it safely?
- What should I fix first?

## 1.5 Highlights

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
npx dep-brain analyze --focus duplicates
npx dep-brain analyze --ci
npx dep-brain analyze --baseline depbrain-baseline.json
npx dep-brain analyze --baseline depbrain-baseline.json --min-score 90 --fail-on-risks
npx dep-brain report --from depbrain.json --md --out depbrain.md

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

Output includes `outputVersion` for schema stability. `dep-brain@1.5.0` writes contract version `1.6`.

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
    "mediumTrustWeightThreshold": 3
  },
  "dashboard": {
    "outputPath": "depbrain-dashboard.html"
  },
  "notifications": {
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
- `dashboard.outputPath`
- `notifications.slackWebhookEnv`
- `notifications.discordWebhookEnv`
- `scoring.duplicateWeight`
- `scoring.outdatedWeight`
- `scoring.unusedWeight`
- `scoring.riskWeight`
- `ignore.prefixes`
- `ignore.patterns`
- `scan.excludePaths`

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

`dep-brain` is in `v1.5.0` production CLI stage, with current focus on actionable dependency decisions instead of raw issue lists.

Recent releases added:

- transitive risk ownership and path tracing
- dashboard and plugin support
- baseline, focus, and CI workflows
- structured upgrade advice with release-note links

Project should optimize for trust, clarity, and actionability over flashy UI, generic graphs, or simply adding more checks.

Risk findings include `trustScore`, structured `riskFactors`, `transitiveRiskScore`, and `riskyTransitiveDeps` path traces so teams can see which direct package introduces supply-chain risk.

## Repository Notes

- Project brief: [docs/project-brief.md](./docs/project-brief.md)
- Product roadmap: [docs/product-roadmap.md](./docs/product-roadmap.md)
- Implementation history: [docs/implementation-log.md](./docs/implementation-log.md)
