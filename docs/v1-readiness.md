# v1.0 Readiness Checklist

This document tracks the requirements and milestones to reach `v1.0.0`.

## Goals

- High-signal output with low false positives.
- Stable CLI and JSON output contract.
- Reliable performance on medium and large repos.
- Safe CI usage with predictable exit codes.

## Must-Have (v1 Blockers)

### Accuracy

- Unused detection: reduce false positives in common frameworks (NestJS, Next.js).
- Respect config files and dynamic imports.
- Support monorepos/workspaces across npm/pnpm/yarn.

### Output Stability

- JSON schema for analysis output and config schema.
- Versioned output format in docs.
- Markdown report mode (for PR comments and CI artifacts).

### Performance

- Metadata request caching and throttling (already present).
- Parallelism with limits (avoid API rate limits).
- Large repo scan guardrails (file ignore patterns).

### CLI/CI

- `dep-brain analyze` stable output.
- `--json` and `--md` outputs documented.
- Exit code policy works consistently.

### Docs & Release

- README matches current behavior.
- CHANGELOG entries for each release.
- RELEASE checklist updated and followed.

## v0.2.x -> v0.9.x Milestones

### v0.3

- Add markdown report (`--md`).
- Add JSON output schema reference in docs.

### v0.4

- Add ignore by prefix (`@scope/*`) and optional regex.
- Add global exclude paths (e.g., `dist`, `build`, `coverage`).

### v0.5

- Improve unused detection: detect usage in config files and dynamic imports.
- Better handling of common framework patterns.

### v0.6

- Add pnpm/yarn workspace support.
- Add per-package overrides in workspace config.

### v0.7

- Add suggestions engine improvements (dedupe + upgrade prioritization).
- Add summary of major upgrades only.

### v0.8

- Add performance benchmarks + large repo test fixtures.
- Add caching to disk (optional).

### v0.9

- Freeze output format and docs.
- Hardening sweep + regression testing.

## v1.0 Exit Criteria

- Stable outputs documented and versioned.
- Tests cover core logic + real-world fixtures.
- CI workflow green across Node 18/20/22.
- Demonstrated use on at least 3 real repos with low noise.
