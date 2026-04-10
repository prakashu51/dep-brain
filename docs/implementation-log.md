# Dependency Brain Implementation Log

This file is the running project reference for development changes.

## Working Rule

Whenever code changes are made in this repository, update this file in the same iteration.

Use this format for future entries:

```text
## YYYY-MM-DD - Short title

- What changed
- Why it changed
- Files touched
- Verification completed
- Follow-up notes
```

## 2026-04-06 - MVP hardening iteration

### What changed

- Improved unused dependency detection to better distinguish runtime and development usage.
- Added support for script-based tool detection so packages like `tsx` and `typescript` are not incorrectly flagged as unused.
- Added implicit TypeScript handling for `typescript` and `@types/*` packages.
- Improved duplicate dependency reporting by keeping lockfile package instances and version details.
- Added outdated dependency classification for `major`, `minor`, and `patch` updates.
- Added request caching and fetch timeouts for npm metadata lookups.
- Added `--json` CLI output support.
- Improved console reporting with clearer summary sections and itemized results.
- Added a lightweight test harness and fixture project for analysis checks.
- Adjusted risk handling so temporary npm metadata fetch failures do not automatically mark packages as risky.

### Why it changed

- The initial scaffold worked, but it produced noisy results for dev tools and had limited reporting detail.
- This iteration focused on making the MVP more trustworthy before any npm publish.

### Files touched

- `package.json`
- `src/cli.ts`
- `src/core/analyzer.ts`
- `src/core/graph-builder.ts`
- `src/checks/duplicate.ts`
- `src/checks/unused.ts`
- `src/checks/outdated.ts`
- `src/checks/risk.ts`
- `src/reporters/console.ts`
- `src/utils/npm-api.ts`
- `tests/run.js`
- `tests/fixtures/unused-project/package.json`
- `tests/fixtures/unused-project/tsconfig.json`
- `tests/fixtures/unused-project/src/index.ts`

### Verification completed

- `npm run build`
- `npm run typecheck`
- `npm run test`
- `node dist/cli.js analyze`
- `node dist/cli.js analyze --json`

### Current result

- The repository now reports a clean local scan with `Project Health: 100/100`.
- The latest pushed GitHub commit for this iteration is `feat: harden dependency analysis MVP`.

### Follow-up notes

- Before npm publish, the next likely priorities are README polish, release notes, and possibly config support.
- Future iterations should keep this file updated alongside code changes.

## 2026-04-06 - Config and CI policy iteration

### What changed

- Added `depbrain.config.json` support with default config loading.
- Added ignore lists for `dependencies`, `devDependencies`, `unused`, `duplicates`, `outdated`, and `risks`.
- Added policy controls for minimum score and failing on duplicates, unused dependencies, outdated dependencies, or risks.
- Added configurable suggestion limits for reports.
- Added CLI support for `--config`, `--min-score`, `--fail-on-duplicates`, `--fail-on-unused`, `--fail-on-outdated`, and `--fail-on-risks`.
- Added policy evaluation into analysis results and console output.
- Added config fixtures and tests for config loading and policy-aware analysis behavior.
- Fixed CLI positional argument parsing so target paths work reliably alongside flags.

### Why it changed

- The next step after MVP hardening was making the tool usable in repeatable team workflows.
- Config and policy controls are the foundation for CI integration and future GitHub Action support.

### Files touched

- `src/core/analyzer.ts`
- `src/cli.ts`
- `src/reporters/console.ts`
- `src/index.ts`
- `src/utils/config.ts`
- `tests/run.js`
- `tests/fixtures/config-project/depbrain.config.json`
- `tests/fixtures/config-project/package.json`
- `tests/fixtures/config-project/tsconfig.json`
- `tests/fixtures/config-project/src/index.ts`
- `docs/implementation-log.md`

### Verification completed

- `npm run typecheck`
- `npm run test`
- `npm run build`
- `node dist/cli.js analyze tests/fixtures/config-project`
- `node dist/cli.js analyze tests/fixtures/unused-project --fail-on-unused`

### Follow-up notes

- README and sample config documentation were added after this iteration.
- CI policy behavior can later be extended with per-check severity thresholds and markdown output.

## 2026-04-09 - Workspace-aware analysis iteration

### What changed

- Added workspace detection via root `package.json` workspaces.
- Added per-package analysis with aggregated reporting at the workspace root.
- Added package context to unused, outdated, and risk entries.
- Added workspace fixtures and test coverage.
- Updated console output and README to include workspace results.

### Why it changed

- Workspaces are common in modern npm projects and are a critical next step for real-world adoption.

### Files touched

- `src/core/analyzer.ts`
- `src/utils/workspaces.ts`
- `src/reporters/console.ts`
- `src/index.ts`
- `tests/run.js`
- `tests/fixtures/workspace-root/package.json`
- `tests/fixtures/workspace-root/packages/a/package.json`
- `tests/fixtures/workspace-root/packages/a/src/index.ts`
- `tests/fixtures/workspace-root/packages/b/package.json`
- `tests/fixtures/workspace-root/packages/b/src/index.ts`
- `README.md`
- `docs/implementation-log.md`

### Verification completed

- `npm run typecheck`
- `npm run test`

### Follow-up notes

- The next likely step is to add workspace-aware config overrides and improved JSON/markdown reporting.

## 2026-04-09 - Release prep docs iteration

### What changed

- Added a sample `depbrain.config.json` file at the repo root.
- Updated README with install usage and a reference to the sample config.
- Added a starter `CHANGELOG.md`.

### Why it changed

- To prepare for a public npm release with clear docs and a usable default config.

### Files touched

- `depbrain.config.json`
- `README.md`
- `CHANGELOG.md`
- `docs/implementation-log.md`

### Verification completed

- Not applicable (documentation-only change)

### Follow-up notes

- Add badges and a release checklist before the first stable npm publish.

## 2026-04-09 - Config schema and validation iteration

### What changed

- Added `depbrain.config.schema.json` for config validation and editor tooling.
- Hardened config loading with type normalization for arrays, booleans, and numbers.
- Updated README to reference the schema file.

### Why it changed

- To make configuration safer and easier to author with editor validation.

### Files touched

- `depbrain.config.schema.json`
- `src/utils/config.ts`
- `README.md`
- `docs/implementation-log.md`

### Verification completed

- `npm run typecheck`
- `npm run test`

### Follow-up notes

- Consider adding a CLI flag to print the resolved config for debugging.

## 2026-04-09 - Config print command iteration

### What changed

- Added `dep-brain config` to print the resolved configuration.
- Updated README with config debug usage.
- Added a test to verify CLI overrides apply to resolved config.

### Why it changed

- It makes CI troubleshooting easier and gives users confidence about which config is active.

### Files touched

- `src/cli.ts`
- `README.md`
- `tests/run.js`
- `docs/implementation-log.md`

### Verification completed

- `npm run typecheck`
- `npm run test`

### Follow-up notes

- Consider adding a `--json` flag for config output consistency with analyze.

## 2026-04-09 - Test stability iteration

### What changed

- Relaxed the config-policy test to avoid network-dependent score assertions.
- Relaxed suggestion-count assertions to avoid network-dependent outdated results.

### Why it changed

- Outdated checks depend on live npm data, so the score can vary across runs.

### Files touched

- `tests/run.js`
- `docs/implementation-log.md`

### Verification completed

- `npm run test`

## 2026-04-09 - Release hardening iteration

### What changed

- Added a CLI help output and explicit package.json presence checks.
- Added badges and help examples to the README.
- Added `RELEASE.md` and expanded npm package files list.

### Why it changed

- These are the final release blockers for a clean `v0.1.0` publish.

### Files touched

- `src/cli.ts`
- `package.json`
- `README.md`
- `RELEASE.md`
- `docs/implementation-log.md`

### Verification completed

- `npm run typecheck`
- `npm run test`
- `npm pack`

### Follow-up notes

- Consider adding a `--json` flag to `dep-brain config` for consistency.

## 2026-04-09 - GitHub Actions setup iteration

### What changed

- Added CI workflow for typecheck, build, and test on Node 18/20/22.
- Added publish workflow for tag-based npm releases.

### Why it changed

- To standardize checks on PRs and automate tagged releases.

### Files touched

- `.github/workflows/ci.yml`
- `.github/workflows/publish.yml`
- `docs/implementation-log.md`

### Verification completed

- Not run locally (GitHub Actions only)

## 2026-04-09 - GitHub Actions refinement iteration

### What changed

- Added manual `workflow_dispatch` trigger for CI.
- Added `typecheck` step before publish validation.

### Why it changed

- CI can be run manually when needed, and publish gets a stricter pre-check.

### Files touched

- `.github/workflows/ci.yml`
- `.github/workflows/publish.yml`
- `docs/implementation-log.md`

### Verification completed

- Not run locally (GitHub Actions only)

## 2026-04-10 - CLI help/version fix iteration

### What changed

- Fixed CLI parsing so `--help` works as a top-level flag.
- Added `--version` support and error handling around analysis/config.
- Updated README with version command.

### Why it changed

- Users running `npx dep-brain --help` were getting an unknown command error and silent runs.

### Files touched

- `src/cli.ts`
- `README.md`
- `docs/implementation-log.md`

### Verification completed

- `npm run typecheck`
- `npm run test`
