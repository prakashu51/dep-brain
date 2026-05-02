# dep-brain Product Roadmap and Strategy

## Vision

Build `dep-brain` as a dependency decision engine, not just a scanner.

Move from:

`"Here are issues in your dependencies"`

to:

`"Here's what matters, why it matters, and what you should do next."`

Core principles:

- Explainability over raw detection
- Confidence over binary output
- Actionability over visualization
- Workflow integration over standalone usage

## Current State (`v0.5.x`)

### What exists

- CLI-based analysis tool
- Detection for unused dependencies, duplicates, outdated packages, and basic risk signals
- JSON and console output
- Config support
- Workspace-aware analysis
- CI-friendly policy failure behavior
- Heuristic improvements for TypeScript and common dev tools

### Strengths

- Lightweight with no runtime dependencies
- Fast and local-first
- Already structured for scaling through config, policy, and JSON output

## Core Gaps

### 1. Explainability

Current output can say a dependency is unused, but it does not clearly explain why.

### 2. Confidence scoring

Most decisions are effectively binary, while real dependency usage is probabilistic.

### 3. Safe removal guidance

Developers still hesitate to delete dependencies without explicit safety guidance.

### 4. Limited risk intelligence

Current risk signals are basic and should expand toward maintainer health, repository activity, and trust indicators.

### 5. Weak differentiation

Without a unified intelligence layer, `dep-brain` risks feeling like separate checks glued together.

## Product Strategy

### Positioning

`dep-brain = explainable dependency intelligence engine`

### Core pillars

1. Explain
2. Evaluate
3. Recommend
4. Enforce

## Version Roadmap

### `v0.6` - Trust and Explainability

Goal: make outputs trustworthy and understandable.

Planned capabilities:

- Confidence score per dependency finding
- "Why" explanation engine
- Machine-readable reason codes
- Improved ignore and config handling

Representative output:

```text
lodash
status: unused
confidence: 0.87

reason:
- no import found in source
- not referenced in config
- not detected in scripts
```

Expected impact:

- Reduces false-positive perception
- Builds trust in the tool's output

### `v0.7` - Actionable Intelligence

Goal: move from detection to action.

Planned capabilities:

- Safe removal suggestions
- Duplicate resolution hints
- Upgrade suggestions
- "Top issues" summary mode

Representative output:

```text
SAFE TO REMOVE: lodash

impact:
- no usage found
- no runtime references

confidence: 91%
```

Expected impact:

- Makes `dep-brain` feel like an assistant, not just a reporter
- Reduces developer effort after detection

### `v0.8` - Supply Chain Intelligence

Goal: add dependency trust awareness.

Planned capabilities:

- Trust score per package
- Signals from publish recency, maintainer count, release cadence, and repo activity
- Risk propagation to show which package introduces a risky dependency

Representative output:

```text
left-pad
trust_score: LOW

reason:
- single maintainer
- no commits in 12 months
```

Expected impact:

- Improves enterprise relevance
- Moves beyond CVE-only dependency thinking

### `v0.9` - Monorepo Intelligence

Goal: solve real-world scale problems.

Planned capabilities:

- Cross-workspace dependency analysis
- Duplicate detection across packages
- Root-cause tracing
- Workspace-level scoring
- Ownership-style insights

Representative output:

```text
lodash duplicated via:
pkg-a -> pkg-b -> lodash@3
pkg-c -> lodash@4
```

Expected impact:

- Creates stronger differentiation for large teams
- Makes the tool materially more useful in monorepos

### `v1.0` - CI and Ecosystem Ready

Goal: make the tool production-ready.

Planned capabilities:

- GitHub Action
- CI gate mode
- Baseline mode for existing dependency debt
- Stable JSON schema
- Export formats for JSON, Markdown, and SARIF

Representative command:

```bash
dep-brain check --fail-on-risk --min-score=80
```

Expected impact:

- Supports team adoption
- Improves enterprise usability

## Future Extensions

### `v1.2` - Extensible Decision Engine

Goal: evolve `dep-brain` from static CLI analyzer into extensible dependency decision engine.

Build order:

1. Plugin foundation and extension-safe JSON output
2. Config slots for plugins, risk thresholds, dashboard, and notifications
3. Transitive graph and risk propagation
4. First-party license plugin
5. Dashboard summary with dependency graph after graph data is trustworthy
6. Smart update advisor with semver guidance and changelog links
7. Slack and Discord notifications
8. GitHub PR comments with delta analysis
9. Safe removal autofix after stronger rollback and test guarantees

Keep in `v1.2`:

- `dep-brain-plugin-security`
- `dep-brain-plugin-license`
- dashboard generation from `AnalysisResult`
- configurable risk thresholds
- notification summaries

Park until later:

- full D3 force graph until dependency parent-child edges are modeled
- CVE database ownership until audit/OSV adapter proves value
- automatic branch, uninstall, test, commit, and revert flow

### Runtime signal integration

- Optional runtime tracing to improve confidence accuracy

### Advanced autofix engine

- Codemods for removing unused dependencies
- Import cleanup automation

## KPIs

### Adoption metrics

- Weekly downloads
- GitHub stars

### Product metrics

- Percentage of findings with explanation
- Percentage of findings with actionable fix

### Quality metrics

- False positive rate from user feedback
- Confidence score accuracy

### Usage metrics

- CI integration adoption
- Repeat CLI usage

## Strategic Priorities

1. Explainability and confidence
2. Safe removal engine
3. Trust and risk intelligence
4. Monorepo intelligence
5. CI integration

## Summary

Do not optimize for flashy UI, generic graphs, or "more checks."

Optimize for trust, clarity, and actionability.

If `dep-brain` can reliably answer these three questions, it will stand apart:

- Why is this dependency here?
- Can I remove it safely?
- What should I fix first?
