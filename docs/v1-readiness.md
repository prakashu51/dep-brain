# v1.0 Readiness Checklist

This document tracks the requirements and milestones to reach `v1.0.0`.

## Goals

- High-signal output with low false positives.
- Stable CLI and JSON output contract.
- Reliable performance on medium and large repos.
- Safe CI usage with predictable exit codes.
- Explainable, confidence-oriented recommendations that developers trust.

## Must-Have (v1 Blockers)

### Accuracy

- Unused detection: reduce false positives in common frameworks (NestJS, Next.js).
- Respect config files and dynamic imports.
- Support monorepos/workspaces across npm/pnpm/yarn.
- Add confidence scoring and machine-readable reason codes for findings.
- Add "why" explanations for dependency classification.

### Output Stability

- JSON schema for analysis output and config schema.
- Versioned output format in docs.
- Markdown report mode (for PR comments and CI artifacts).
- Stable explanation and recommendation fields in the JSON contract.

### Performance

- Metadata request caching and throttling (already present).
- Parallelism with limits (avoid API rate limits).
- Large repo scan guardrails (file ignore patterns).

### CLI/CI

- `dep-brain analyze` stable output.
- `--json` and `--md` outputs documented.
- Exit code policy works consistently.
- Baseline mode for existing dependency debt.
- CI gate mode for risk and score enforcement.

### Docs & Release

- README matches current behavior.
- CHANGELOG entries for each release.
- RELEASE checklist updated and followed.

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

- Add GitHub Action support.
- Add CI gate mode and baseline mode.
- Freeze the stable JSON schema.
- Support JSON, Markdown, and SARIF export formats.

## v1.0 Exit Criteria

- Stable outputs documented and versioned.
- Tests cover core logic + real-world fixtures.
- CI workflow green across Node 18/20/22.
- Demonstrated use on at least 3 real repos with low noise.
- The product clearly answers:
  - Why is this dependency here?
  - Can I remove it safely?
  - What should I fix first?

## Roadmap Reference

See [docs/product-roadmap.md](./product-roadmap.md) for the full product strategy and positioning.
