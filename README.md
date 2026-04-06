# Dependency Brain

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
- Console reporting
- JSON output via `--json`
- Library entrypoint for programmatic use

## CLI Usage

```bash
npx dep-brain analyze
npx dep-brain analyze --json
npx dep-brain analyze ./path-to-project
```

## Example Output

```text
Project Health: 78/100
Path: /your/project

WARN Duplicates: 2
OK Unused: 0
WARN Outdated: 3
OK Risks: 0

Duplicate dependencies:
- ansi-regex: 5.0.1, 6.0.1

Outdated dependencies:
- chalk: ^4.1.2 -> 5.4.1 [major]

Suggestions:
- Consider consolidating ansi-regex to one version
- Review chalk: ^4.1.2 -> 5.4.1 (major)
```

## JSON Output

```bash
dep-brain analyze --json
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
    `-- npm-api.ts
```

## Roadmap Direction

- Improve false-positive reduction for unused dependency detection
- Add config support
- Improve monorepo and workspace support
- Strengthen risk scoring and suggestions
- Add CI and GitHub Action support in later releases

## Repository Notes

- Project brief: [docs/project-brief.md](./docs/project-brief.md)
- Implementation history: [docs/implementation-log.md](./docs/implementation-log.md)
