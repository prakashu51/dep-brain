# 🧠 dep-brain Roadmap

**Vision** – The single source of truth for dependency health: from audit to action.  
Automate detection, prioritisation, and remediation of dependency problems across your entire JavaScript/TypeScript ecosystem.

---

## 📌 Immediate Release: v1.15.0 (Target: 4 weeks)

Three pillar features that make `dep-brain` indispensable for teams.

### 1. License Compliance & Policy Enforcement
- `dep-brain licenses` – Show licenses for all direct & transitive dependencies.
- Policy flags: `--allow` / `--deny` + `--fail-on deny` for CI.
- Output: human table, JSON, Markdown (ready for PR comments).
- Cached registry lookups (24h).

### 2. Branch-to-Branch Dependency Diff
- `dep-brain diff --base main --head feature`
- See added, removed, upgraded packages, with **risk score deltas** and **license changes**.
- Output: terminal diff, Markdown table (paste into PR), JSON.
- Works with npm, pnpm, yarn (all versions), monorepos.

### 3. SBOM Export (CycloneDX v1.6)
- `dep-brain sbom --format cyclonedx` → `bom.json`
- Includes: package name, version, license, PURL, dependency graph, hashes (from lockfile integrity).
- Optional: SPDX format (v2.3) as secondary.

### Additional Polish
- Runtime trace: `--json` flag for scripting.
- Unused deps scanner: 40% faster (cached ASTs).
- GitHub PR integration: auto‑add license summary and risk delta to `dep-brain report --pr-comment`.

### Timeline
| Week | Focus |
|------|-------|
| 1 | License detection + cache + CLI |
| 2 | Branch diff engine + markdown formatter |
| 3 | SBOM CycloneDX + integration tests |
| 4 | Docs, release candidate, community preview |

### Stretch (if ahead)
- `dep-brain diff --auto-pr` – post directly to GitHub using `gh` CLI.
- License conflict detection (e.g., MIT project pulls in GPL dependency).

---

## 🚀 Mid‑term Roadmap (v1.16 – v1.18)

### v1.16 – Policy as Code & Risk Intelligence
- `dep-brain.policy.yml` – Declarative rules (risk thresholds, license blocks, outdated limits).
- Risk scoring v2: maintainer count, repo activity, issue response time.
- `dep-brain check --policy` – CI‑friendly command that fails fast.

### v1.17 – AI‑Assisted Upgrade Plans (Optional LLM)
- `dep-brain upgrade --plan` – Analyses changelogs, suggests safe upgrade paths for major versions.
- For each outdated package: “Update 4.x → 5.x – but first fix these 2 breaking changes in your code (file:line).”
- Optional integration with codemod runners (`jscodeshift`).

### v1.18 – Monorepo First‑Class & Regression Tracking
- Native support for npm/pnpm/yarn workspaces, Lerna, Turborepo.
- `dep-brain track --store` – Save baseline metrics to `dep-brain/` folder.
- `dep-brain track --diff` – Show how metrics changed since last baseline (risk score, # unused, # outdated).
- Trend graphs in HTML dashboard.

---

## 🌟 Long‑term Vision (v2.0+)

Make `dep-brain` the *operating system* for dependency management.

- **IDE Extensions** – VS Code / JetBrains plugin for real‑time hints.
- **Dependency Firewall** – Runtime allow‑listing based on trace logs; block unexpected `require()` calls in CI.
- **Open Risk Registry** – Community‑maintained dataset of abandonware, typosquatting, malicious packages.
- **Self‑hosted Web UI** – For organisations to monitor all projects, schedule scans, enforce policies centrally.
- **Full SBOM Lifecycle** – Sign, verify, integrate with GUAC or in‑toto.

---

## 📢 Immediate Actions (Next 7 Days)

1. **Commit this roadmap** as `ROADMAP.md` in your repo.
2. **Announce v1.14.0** on Reddit/r/node, Dev.to, Hacker News – highlight the runtime trace feature.
3. **Set up a feedback channel** (Discord or GitHub Discussions) and ask early users: “What’s the #1 thing missing?”
4. **Start work on v1.15.0** – begin with license detection (highest enterprise value).

---

*Together, we build the best dependency intelligence tool on the planet.*  
– Your dep-brain maintainer
