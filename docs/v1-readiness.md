# v1.0 Readiness Checklist

This document tracks the requirements and milestones for `v1.0.0`.

## Goals

- High-signal output with low false positives.
- Stable CLI and JSON output contract.
- Reliable performance on medium and large repos.
- Safe CI usage with predictable exit codes.
- Explainable, confidence-oriented recommendations that developers trust.

## v1.0 Status

`v1.0.0` is release-ready when the local release checklist passes:

- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm pack`

The v1 release focuses on a stable CLI, stable JSON contract, CI adoption, explainable recommendations, baseline mode, SARIF export, and npm/pnpm/yarn lockfile-aware duplicate detection.

## Must-Have (v1 Blockers)

### Accuracy

- Done: unused detection includes runtime vs dev-tool heuristics, config-file handling, scripts, TypeScript helpers, and dynamic imports.
- Done: ignore config supports dependency buckets, prefixes, patterns, and scan exclude paths.
- Done: workspace analysis supports `package.json` workspaces.
- Done: duplicate detection reads npm, pnpm, and yarn lockfiles.
- Done: findings include confidence scoring and machine-readable reason codes.
- Done: findings include "why" explanations and recommendations.

### Output Stability

- Done: JSON schema for analysis output and config schema.
- Done: versioned output via `outputVersion`.
- Done: Markdown report mode for PR comments and CI artifacts.
- Done: SARIF report mode for code scanning.
- Done: stable explanation and recommendation fields in the JSON contract.

### Performance

- Done: metadata request caching.
- Done: registry-backed checks use bounded parallelism.
- Done: large repo scan guardrails through file ignore patterns.

### CLI/CI

- Done: `dep-brain analyze` stable output.
- Done: `--json`, `--md`, `--sarif`, and `--top` outputs documented.
- Done: exit code policy works through score and finding gates.
- Done: baseline mode for existing dependency debt.
- Done: CI gate mode for risk and score enforcement.
- Done: reusable GitHub Action metadata in `action.yml`.

### Docs & Release

- Done: README matches current behavior.
- Done: CHANGELOG includes `1.0.0`.
- Done: RELEASE checklist is updated for v1.

## v0.6 -> v1.0 Milestones

### v0.6 - Trust and Explainability

- Add per-finding confidence scores.
- Add explanation engine and machine-readable reason codes.
- Improve ignore and config handling to reduce noise.

### v0.7 - Actionable Intelligence

- Add safe removal suggestions.
- Add duplicate-resolution and upgrade suggestions.
- Add a "top issues" summary mode.

### v0.8 - Supply Chain Intelligence

- Add trust score per package.
- Factor in publish cadence, maintainer count, and repo activity.
- Add risk propagation so users can see what introduces risky packages.

### v0.9 - Monorepo Intelligence

- Add cross-workspace dependency analysis.
- Add duplicate tracing across packages.
- Add ownership-style workspace insights.

### v1.0 - CI and Ecosystem Ready

- Add GitHub Action support. Done.
- Add CI gate mode and baseline mode. Done.
- Freeze the stable JSON schema. Done.
- Support JSON, Markdown, and SARIF export formats. Done.

## v1.0 Exit Criteria

- Stable outputs documented and versioned.
- Tests cover core logic, fixtures, baseline mode, reports, and lockfile parsing.
- CI workflow covers Node 18/20/22.
- Release validation passes locally before tagging.
- Demonstrated use on real repos with low noise.
- The product clearly answers:
  - Why is this dependency here?
  - Can I remove it safely?
  - What should I fix first?

## Roadmap Reference

See [docs/product-roadmap.md](./product-roadmap.md) for the full product strategy and positioning.
