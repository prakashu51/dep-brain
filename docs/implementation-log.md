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
