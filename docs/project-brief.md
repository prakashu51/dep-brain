# Dependency Brain Project Brief

## Project Type

NPM package with both CLI and library APIs.

## Problem Statement

Developers cannot easily understand the health of their dependencies from a single tool.

Current tools are fragmented:

- `npm audit`: vulnerabilities only
- `depcheck`: unused packages only
- dedupe tools: duplicate packages only

There is no unified intelligence layer for dependency health, and most tools stop short of explaining what developers should do next.

## Solution

Build a dependency decision engine that analyzes dependencies and provides:

- Health score
- Duplicate detection
- Unused dependency detection
- Outdated package detection
- Risk analysis
- Explainable recommendations
- Confidence-oriented guidance

## Vision

`dep-brain` should move from:

`"Here are issues in your dependencies"`

to:

`"Here's what matters, why it matters, and what you should do next."`

## Product Pillars

1. Explain
2. Evaluate
3. Recommend
4. Enforce

## Current Stage

The repository is currently at `v0.5.x`, which is a strong technical foundation:

- CLI-based analysis
- JSON and console reporting
- Config and policy support
- Workspace-aware analysis
- CI-friendly failure modes
- Heuristic improvements for common dev tools

The next stage is product differentiation through explainability, confidence, and actionability.

## Strategic Priorities

1. Explainability and confidence
2. Safe removal guidance
3. Trust and risk intelligence
4. Monorepo intelligence
5. CI integration

## Key Principle

Optimize for trust, clarity, and actionability over visual polish or raw check count.
