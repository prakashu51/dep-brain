# Dependency Brain

[![npm version](https://img.shields.io/npm/v/dep-brain)](https://www.npmjs.com/package/dep-brain)
[![npm downloads](https://img.shields.io/npm/dm/dep-brain)](https://www.npmjs.com/package/dep-brain)
[![license](https://img.shields.io/npm/l/dep-brain)](LICENSE)

`dep-brain` is a CLI and library for explainable dependency intelligence in JavaScript and TypeScript projects.

## Vision

`dep-brain` aims to become a dependency decision engine:

- Explain why a dependency matters
- Evaluate how safe, risky, or necessary it is
- Recommend what to do next
- Enforce decisions in CI workflows

## What It Does

- Detect duplicate dependencies from `package-lock.json`
- Detect likely unused dependencies from source imports and scripts
- Detect outdated packages
- Highlight dependency risk signals
- Score package trust using supply-chain metadata
- Generate a simple project health score
- Output reports in human-readable or JSON format

The long-term goal is not just to list problems, but to answer:

- Why is this dependency here?
- Can I remove it safely?
- What should I fix first?

## Current MVP Features

- Duplicate dependency detection with lockfile instance tracking
- Unused dependency detection with runtime vs dev-tool heuristics
- Outdated dependency reporting with `major`, `minor`, and `patch` classification
- Risk analysis based on npm package metadata
- Config loading from `depbrain.config.json`
- Ignore rules for noisy dependencies and checks
- CI-friendly policy evaluation with non-zero exit codes
- Workspace-aware analysis for npm workspaces
- Console reporting
- JSON output via `--json`
- Library entrypoint for programmatic use

## CLI Usage

```bash
npm install -g dep-brain
dep-brain analyze

npx dep-brain analyze
npx dep-brain analyze --json
npx dep-brain analyze --md
npx dep-brain analyze --top
npx dep-brain analyze ./path-to-project
npx dep-brain analyze --config depbrain.config.json
npx dep-brain analyze --min-score 90 --fail-on-risks
npx dep-brain analyze ./path-to-project --fail-on-unused --json
npx dep-brain analyze --md > depbrain.md
npx dep-brain analyze --json --out depbrain.json
npx dep-brain report --from depbrain.json --md --out depbrain.md

dep-brain config
dep-brain config --config depbrain.config.json

dep-brain help
dep-brain analyze --help
dep-brain --version
```

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

Output includes `outputVersion` for schema stability and can be validated with:

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

## Report From JSON

```bash
dep-brain analyze --json --out depbrain.json
dep-brain report --from depbrain.json --md --out depbrain.md
```

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

`dep-brain` is currently in the `v0.5.x` foundation stage. The next roadmap is:

- `v0.6`: explainability and confidence scoring
- `v0.7`: safe removal guidance and actionable recommendations
- `v0.8`: supply-chain trust and risk intelligence
- `v0.9`: deeper monorepo and ownership intelligence
- `v1.0`: stable CI, ecosystem exports, and production readiness

The project should optimize for trust, clarity, and actionability over flashy UI, generic graphs, or simply adding more checks.

Risk findings now include a `trustScore` plus structured `riskFactors` such as publish recency, maintainer count, and repository presence.

## Repository Notes

- Project brief: [docs/project-brief.md](./docs/project-brief.md)
- Product roadmap: [docs/product-roadmap.md](./docs/product-roadmap.md)
- Implementation history: [docs/implementation-log.md](./docs/implementation-log.md)
