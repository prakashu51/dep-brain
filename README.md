# Dependency Brain

[![npm version](https://img.shields.io/npm/v/dep-brain)](https://www.npmjs.com/package/dep-brain)
[![npm downloads](https://img.shields.io/npm/dm/dep-brain)](https://www.npmjs.com/package/dep-brain)
[![license](https://img.shields.io/npm/l/dep-brain)](LICENSE)

`dep-brain` is a CLI and library for analyzing dependency health in JavaScript and TypeScript projects.

## Vision

`npm audit + depcheck + dedupe + intelligence = one tool`

## What It Does

- Detect duplicate dependencies from `package-lock.json`
- Detect likely unused dependencies from source imports and scripts
- Detect outdated packages
- Highlight dependency risk signals
- Generate a simple project health score
- Output reports in human-readable or JSON format

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
npx dep-brain analyze ./path-to-project
npx dep-brain analyze --config depbrain.config.json
npx dep-brain analyze --min-score 90 --fail-on-risks
npx dep-brain analyze ./path-to-project --fail-on-unused --json

dep-brain config
dep-brain config --config depbrain.config.json

dep-brain help
dep-brain analyze --help
dep-brain --version
```

## Workspaces

If the root `package.json` defines `workspaces`, `dep-brain` analyzes each workspace package and reports per-package results. Aggregated counts are still shown at the top-level summary.

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

## Config File

Create a `depbrain.config.json` file in the project root:

```json
{
  "ignore": {
    "unused": ["eslint"],
    "outdated": ["typescript"]
  },
  "policy": {
    "minScore": 90,
    "failOnUnused": true,
    "failOnRisks": true
  },
  "report": {
    "maxSuggestions": 3
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

Sample config file:

- `depbrain.config.json`
- `depbrain.config.schema.json`

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

## Roadmap Direction

- Improve false-positive reduction for unused dependency detection
- Improve monorepo and workspace support
- Strengthen risk scoring and suggestions
- Add CI and GitHub Action support in later releases

## Repository Notes

- Project brief: [docs/project-brief.md](./docs/project-brief.md)
- Implementation history: [docs/implementation-log.md](./docs/implementation-log.md)
