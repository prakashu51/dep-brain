# Dependency Brain Project Brief

## Project Type

NPM package with both CLI and library APIs.

## Problem Statement

Developers cannot easily understand the health of their dependencies from a single tool.

Current tools are fragmented:

- `npm audit`: vulnerabilities only
- `depcheck`: unused packages only
- dedupe tools: duplicate packages only

There is no unified intelligence layer for dependency health.

## Solution

Build a CLI tool that analyzes dependencies and provides:

- Health score
- Duplicate detection
- Unused dependency detection
- Outdated package detection
- Risk analysis

## Vision

`npm audit + depcheck + dedupe + intelligence = one tool`

## Feature Roadmap

### Month 1 (MVP)

- CLI setup
- Duplicate detection
- Unused dependency detection
- Outdated packages

### Month 2 (Differentiation)

- Dependency health score
- Maintenance and risk analysis
- Improved CLI output

### Month 3 (Growth and Scale)

- GitHub Action
- CI/CD integration
- Suggestions engine

## Architecture

```text
src/
├── cli.ts
├── core/
│   ├── analyzer.ts
│   ├── graph-builder.ts
│   ├── scorer.ts
├── checks/
│   ├── duplicate.ts
│   ├── unused.ts
│   ├── outdated.ts
│   ├── risk.ts
├── reporters/
│   ├── console.ts
│   ├── json.ts
└── utils/
    ├── npm-api.ts
    ├── file-parser.ts
```

## Core Algorithms

### Duplicate Detection

- Parse lockfile
- Group by package name
- Identify multiple versions

### Health Score

```text
score = 100
- (duplicates * 5)
- (outdated * 3)
- (unused * 4)
- (high risk * 10)
```

### Risk Detection

- Last publish date older than 2 years
- Low download count
- Missing repository

## Sample CLI Output

```text
Project Health: 61/100

3 duplicate dependencies
2 unused packages
4 outdated libraries

Suggestions:
- Replace moment -> dayjs
- Remove lodash (unused)
```

## Success Metrics

- Month 1: 100+ installs
- Month 2: 500+ installs
- Month 3: 1000+ installs

## Go-To-Market

- Dev.to article: "Your package.json is lying to you"
- Reddit communities like `r/node` and `r/javascript`
- Twitter/X launch thread

## Execution Plan

### Month 1

- Build core engine
- Release `v0.1`

### Month 2

- Add scoring and risk
- Release `v1.0`

### Month 3

- Add CI and GitHub Action
- Release `v1.5`

## Key Principle

Execution is more important than the idea. Daily commits, continuous feedback, and iteration drive success.
