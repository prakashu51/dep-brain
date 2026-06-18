import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findDuplicateDependencies } from "../dist/checks/duplicate.js";
import { findOutdatedDependencies } from "../dist/checks/outdated.js";
import { findRiskDependencies } from "../dist/checks/risk.js";
import { findUnusedDependencies } from "../dist/checks/unused.js";
import { analyzeProject } from "../dist/core/analyzer.js";
import { applyFixPlan } from "../dist/core/fix-apply.js";
import { buildUnusedFixPlan, renderFixPlan } from "../dist/core/fix-plan.js";
import { buildDependencyGraph } from "../dist/core/graph-builder.js";
import { calculateHealthScore } from "../dist/core/scorer.js";
import { loadDepBrainConfig } from "../dist/utils/config.js";
import { renderConsoleReport } from "../dist/reporters/console.js";
import { renderJsonReport } from "../dist/reporters/json.js";
import { renderMarkdownReport } from "../dist/reporters/markdown.js";
import { renderSarifReport } from "../dist/reporters/sarif.js";
import { renderDashboardReport } from "../dist/reporters/dashboard.js";
import { renderPrCommentReport } from "../dist/reporters/pr-comment.js";
import { upsertGitHubPrComment } from "../dist/utils/github.js";
import { sendConfiguredNotifications } from "../dist/utils/notifications.js";
import { collectProjectFiles } from "../dist/utils/file-parser.js";
import { buildAnalysisContext } from "../dist/core/context.js";
import { defaultConfig } from "../dist/utils/config.js";
import { loadRuntimeTrace } from "../dist/utils/runtime-trace.js";
import { applyDeduplication } from "../dist/index.js";
import { cleanUnusedImports } from "../dist/index.js";
import { getCachedVulnerabilities, setCachedVulnerabilities } from "../dist/utils/osv-cache.js";
import { getOsvVulnerabilities } from "../dist/utils/osv.js";
import { auditLicenses, diffBranches, exportSbom } from "../dist/index.js";
import { loadScanCache } from "../dist/utils/import-cache.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tests = [
  {
    name: "duplicate detection groups nested versions",
    run: async () => {
      const duplicates = await findDuplicateDependencies({
        rootDir: "D:/fixture",
        packageJsonPath: "D:/fixture/package.json",
        dependencies: {},
        devDependencies: {},
        overrides: {},
        scripts: {},
        lockPackages: {
          react: [
            { path: "node_modules/react", version: "18.2.0" },
            { path: "node_modules/foo/node_modules/react", version: "17.0.2" }
          ],
          chalk: [{ path: "node_modules/chalk", version: "5.3.0" }]
        }
      });

      assert.equal(duplicates.length, 1);
      assert.equal(duplicates[0]?.name, "react");
      assert.deepEqual(duplicates[0]?.versions, ["17.0.2", "18.2.0"]);
    }
  },
  {
    name: "graph builder reads pnpm lockfile duplicates",
    run: async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-pnpm-"));
      try {
        await fs.writeFile(
          path.join(tempRoot, "package.json"),
          JSON.stringify({ dependencies: { chalk: "^5.0.0" } }),
          "utf8"
        );
        await fs.writeFile(
          path.join(tempRoot, "pnpm-lock.yaml"),
          [
            "lockfileVersion: '9.0'",
            "packages:",
            "  /chalk@4.1.2:",
            "    resolution: {integrity: sha512-old}",
            "  /chalk@5.3.0:",
            "    resolution: {integrity: sha512-new}"
          ].join("\n"),
          "utf8"
        );

        const graph = await buildDependencyGraph(tempRoot);
        assert.deepEqual(
          graph.lockPackages.chalk.map((item) => item.version),
          ["4.1.2", "5.3.0"]
        );
        assert.deepEqual(graph.lockDependencies.__root__, ["chalk"]);
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    }
  },
  {
    name: "graph builder reads yarn lockfile duplicates",
    run: async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-yarn-"));
      try {
        await fs.writeFile(
          path.join(tempRoot, "package.json"),
          JSON.stringify({ dependencies: { chalk: "^5.0.0" } }),
          "utf8"
        );
        await fs.writeFile(
          path.join(tempRoot, "yarn.lock"),
          [
            "\"chalk@^4.0.0\":",
            "  version \"4.1.2\"",
            "\"chalk@^5.0.0\":",
            "  version \"5.3.0\""
          ].join("\n"),
          "utf8"
        );

        const graph = await buildDependencyGraph(tempRoot);
        assert.deepEqual(
          graph.lockPackages.chalk.map((item) => item.version),
          ["4.1.2", "5.3.0"]
        );
        assert.deepEqual(graph.lockDependencies.__root__, ["chalk"]);
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    }
  },
  {
    name: "graph builder reads npm transitive dependency edges",
    run: async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-npm-"));
      try {
        await fs.writeFile(
          path.join(tempRoot, "package.json"),
          JSON.stringify({ dependencies: { alpha: "^1.0.0" } }),
          "utf8"
        );
        await fs.writeFile(
          path.join(tempRoot, "package-lock.json"),
          JSON.stringify({
            name: "fixture",
            lockfileVersion: 3,
            packages: {
              "": {
                dependencies: {
                  alpha: "^1.0.0"
                }
              },
              "node_modules/alpha": {
                name: "alpha",
                version: "1.0.0",
                dependencies: {
                  beta: "^1.0.0"
                }
              },
              "node_modules/beta": {
                name: "beta",
                version: "1.0.0",
                dependencies: {
                  gamma: "^1.0.0"
                }
              },
              "node_modules/gamma": {
                name: "gamma",
                version: "1.0.0"
              }
            }
          }, null, 2),
          "utf8"
        );

        const graph = await buildDependencyGraph(tempRoot);
        assert.deepEqual(graph.lockDependencies.__root__, ["alpha"]);
        assert.deepEqual(graph.lockDependencies.alpha, ["beta"]);
        assert.deepEqual(graph.lockDependencies.beta, ["gamma"]);
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    }
  },
  {
    name: "outdated detection classifies update types",
    run: async () => {
      const outdated = await findOutdatedDependencies(
        {
          rootDir: "D:/fixture",
          packageJsonPath: "D:/fixture/package.json",
          dependencies: {
            alpha: "^1.2.3",
            beta: "~2.4.0"
          },
          devDependencies: {
            gamma: "3.0.1"
          },
          overrides: {},
          scripts: {},
          lockPackages: {}
        },
        {
          resolveLatestVersion: async (name) =>
            ({ alpha: "2.0.0", beta: "2.5.0", gamma: "3.0.4" })[name] ?? null
        }
      );

      assert.deepEqual(
        outdated.map((item) => [item.name, item.updateType]),
        [
          ["alpha", "major"],
          ["beta", "minor"],
          ["gamma", "patch"]
        ]
      );
      assert.equal(outdated[0]?.advice.risk, "high");
      assert.ok(Array.isArray(outdated[0]?.advice.intermediateSteps));
    }
  },
  {
    name: "outdated advisor recommends stepped major upgrade path",
    run: async () => {
      const outdated = await findOutdatedDependencies(
        {
          rootDir: "D:/fixture",
          packageJsonPath: "D:/fixture/package.json",
          dependencies: {
            alpha: "^1.2.3"
          },
          devDependencies: {},
          overrides: {},
          scripts: {},
          lockPackages: {},
          lockDependencies: {}
        },
        {
          resolvePackageMetadata: async () => ({
            latestVersion: "3.1.0",
            repository: "https://github.com/example/alpha",
            homepage: null,
            downloads: 10000,
            daysSincePublish: 20,
            maintainersCount: 3,
            versionCount: 8,
            recentReleaseCount: 2,
            versions: ["1.2.3", "1.9.0", "2.4.0", "3.1.0"]
          }),
          resolveReleaseNotesText: async () => "BREAKING: migration required"
        }
      );

      assert.equal(outdated.length, 1);
      assert.equal(outdated[0].advice.risk, "high");
      assert.equal(outdated[0].advice.recommendedTarget, "1.9.0");
      assert.deepEqual(outdated[0].advice.intermediateSteps, ["1.9.0", "3.1.0"]);
      assert.ok(outdated[0].advice.releaseNotes[0].includes("/releases/tag/v3.1.0"));
      assert.ok(outdated[0].advice.signals.includes("semver_major"));
      assert.ok(outdated[0].advice.signals.includes("breaking_keyword"));
    }
  },
  {
    name: "risk detection includes trust score and risk factors",
    run: async () => {
      const risks = await findRiskDependencies(
        {
          rootDir: "D:/fixture",
          packageJsonPath: "D:/fixture/package.json",
          dependencies: {
            risky: "^1.0.0"
          },
          devDependencies: {},
          overrides: {},
          scripts: {},
          lockPackages: {}
        },
        {
          resolvePackageMetadata: async () => ({
            latestVersion: "1.0.1",
            repository: null,
            downloads: 120,
            daysSincePublish: 900,
            maintainersCount: 1,
            versionCount: 2,
            recentReleaseCount: 0
          })
        }
      );

      assert.equal(risks.length, 1);
      assert.equal(risks[0]?.trustScore, "low");
      assert.equal(risks[0]?.riskFactors.hasRepository, false);
      assert.equal(risks[0]?.riskFactors.dependencyType, "dependencies");
      assert.equal(risks[0]?.riskFactors.transitiveDependencyCount, 0);
      assert.ok(risks[0]?.reasonCodes.includes("stale_release"));
    }
  },
  {
    name: "risk detection includes OSV vulnerabilities when enabled",
    run: async () => {
      const risks = await findRiskDependencies(
        {
          rootDir: "D:/fixture",
          packageJsonPath: "D:/fixture/package.json",
          dependencies: {
            vulnerable: "^1.0.0"
          },
          devDependencies: {
            "dev-vulnerable": "^1.0.0"
          },
          overrides: {},
          scripts: {},
          lockPackages: {}
        },
        {
          thresholds: {
            ...defaultConfig.risk,
            osv: {
              enabled: true,
              severityThreshold: "high",
              includeDevDependencies: false
            }
          },
          resolvePackageMetadata: async () => ({
            latestVersion: "1.0.1",
            repository: "https://github.com/example/pkg",
            homepage: null,
            downloads: 100000,
            daysSincePublish: 2,
            maintainersCount: 3,
            versionCount: 10,
            recentReleaseCount: 1,
            versions: ["1.0.0", "1.0.1"]
          }),
          resolveVulnerabilities: async (name) =>
            name === "vulnerable"
              ? [{
                  id: "GHSA-1234",
                  severity: "high",
                  summary: "Prototype pollution",
                  affectedRanges: ["0 - 1.0.1"],
                  fixedVersions: ["1.0.1"]
                }]
              : [{
                  id: "GHSA-dev",
                  severity: "critical",
                  summary: "Dev issue",
                  affectedRanges: ["0 - 1.0.1"],
                  fixedVersions: ["1.0.1"]
                }]
        }
      );

      assert.deepEqual(risks.map((item) => item.name), ["vulnerable"]);
      assert.ok(risks[0].reasonCodes.includes("osv_vulnerability"));
      assert.equal(risks[0].riskFactors.vulnerabilities[0].id, "GHSA-1234");
      assert.equal(risks[0].recommendation.priority, "high");
    }
  },
  {
    name: "risk detection suppresses weak and dev-only signals",
    run: async () => {
      const risks = await findRiskDependencies(
        {
          rootDir: "D:/fixture",
          packageJsonPath: "D:/fixture/package.json",
          dependencies: {
            axios: "^1.0.0",
            stale: "^1.0.0"
          },
          devDependencies: {
            "@types/node": "^20.0.0",
            "risky-dev": "^1.0.0"
          },
          overrides: {},
          scripts: {},
          lockPackages: {}
        },
        {
          resolvePackageMetadata: async (name) => {
            const metadata = {
              axios: {
                latestVersion: "1.0.0",
                repository: "https://github.com/axios/axios",
                downloads: 1000000,
                daysSincePublish: 2,
                maintainersCount: 1,
                versionCount: 100,
                recentReleaseCount: 1
              },
              stale: {
                latestVersion: "1.0.0",
                repository: "https://github.com/example/stale",
                downloads: 100000,
                daysSincePublish: 900,
                maintainersCount: 2,
                versionCount: 20,
                recentReleaseCount: 0
              },
              "@types/node": {
                latestVersion: "20.0.0",
                repository: "https://github.com/DefinitelyTyped/DefinitelyTyped",
                downloads: null,
                daysSincePublish: 10,
                maintainersCount: 1,
                versionCount: 1000,
                recentReleaseCount: 4
              },
              "risky-dev": {
                latestVersion: "1.0.0",
                repository: null,
                downloads: 10,
                daysSincePublish: 900,
                maintainersCount: 1,
                versionCount: 1,
                recentReleaseCount: 0
              }
            };
            return metadata[name] ?? null;
          }
        }
      );

      assert.deepEqual(
        risks.map((item) => item.name),
        ["risky-dev", "stale"]
      );
      assert.equal(risks.find((item) => item.name === "risky-dev")?.trustScore, "low");
      assert.equal(risks.find((item) => item.name === "stale")?.trustScore, "medium");
    }
  },
  {
    name: "risk detection aggregates risky transitive dependencies to direct owner",
    run: async () => {
      const risks = await findRiskDependencies(
        {
          rootDir: "D:/fixture",
          packageJsonPath: "D:/fixture/package.json",
          dependencies: {
            alpha: "^1.0.0"
          },
          devDependencies: {},
          overrides: {},
          scripts: {},
          lockPackages: {
            alpha: [{ path: "node_modules/alpha", version: "1.0.0" }],
            beta: [{ path: "node_modules/beta", version: "1.0.0" }],
            gamma: [{ path: "node_modules/gamma", version: "1.0.0" }]
          },
          lockDependencies: {
            __root__: ["alpha"],
            alpha: ["beta"],
            beta: ["gamma"]
          }
        },
        {
          resolvePackageMetadata: async (name) => {
            const metadata = {
              alpha: {
                latestVersion: "1.0.0",
                repository: "https://github.com/example/alpha",
                downloads: 100000,
                daysSincePublish: 5,
                maintainersCount: 3,
                versionCount: 20,
                recentReleaseCount: 2
              },
              beta: {
                latestVersion: "1.0.0",
                repository: null,
                downloads: 100,
                daysSincePublish: 800,
                maintainersCount: 1,
                versionCount: 2,
                recentReleaseCount: 0
              },
              gamma: {
                latestVersion: "1.0.0",
                repository: "https://github.com/example/gamma",
                downloads: 100000,
                daysSincePublish: 10,
                maintainersCount: 2,
                versionCount: 40,
                recentReleaseCount: 3
              }
            };
            return metadata[name] ?? null;
          }
        }
      );

      assert.equal(risks.length, 1);
      assert.equal(risks[0].name, "alpha");
      assert.equal(risks[0].riskyTransitiveDeps.length, 1);
      assert.equal(risks[0].riskyTransitiveDeps[0].name, "beta");
      assert.ok(risks[0].riskyTransitiveDeps[0].introducedByPaths[0].includes("alpha -> beta"));
      assert.ok(risks[0].transitiveRiskScore > 0);
      assert.equal(risks[0].riskFactors.transitiveDependencyCount, 2);
      assert.equal(risks[0].riskFactors.riskyTransitiveCount, 1);
      assert.ok(risks[0].reasonCodes.includes("risky_transitive_dependencies"));
    }
  },
  {
    name: "unused detection respects scripts and TypeScript helpers",
    run: async () => {
      const fixtureRoot = path.join(__dirname, "fixtures", "unused-project");
      const context = await buildAnalysisContext(fixtureRoot, defaultConfig);
      const unused = await findUnusedDependencies(
        fixtureRoot,
        context.graph,
        context.fileEntries,
        { hasTypeScriptConfig: context.hasTypeScriptConfig }
      );

      assert.deepEqual(
        unused.map((item) => ({ name: item.name, section: item.section })),
        [
          { name: "unused-dev-tool", section: "devDependencies" },
          { name: "unused-lib", section: "dependencies" }
        ]
      );
      assert.ok(unused.every((item) => item.reasonCodes.length > 0));
    }
  },
  {
    name: "unused detection understands NestJS and tool binaries",
    run: async () => {
      const unused = await findUnusedDependencies(
        "D:/fixture",
        {
          rootDir: "D:/fixture",
          packageJsonPath: "D:/fixture/package.json",
          dependencies: {
            "@nestjs/core": "^11.0.0",
            "@nestjs/platform-express": "^11.0.0",
            "reflect-metadata": "^0.2.0",
            "fast-xml-parser": "5.5.8",
            "unused-runtime": "^1.0.0"
          },
          devDependencies: {
            "@nestjs/cli": "^11.0.0",
            "@nestjs/schematics": "^11.0.0",
            "@typescript-eslint/eslint-plugin": "^8.0.0",
            "@typescript-eslint/parser": "^8.0.0",
            "eslint-config-prettier": "^10.0.0",
            "ts-jest": "^29.0.0",
            "ts-node": "^10.0.0",
            "tsconfig-paths": "^4.0.0",
            "unused-tool": "^1.0.0"
          },
          overrides: {
            "fast-xml-parser": "5.5.8"
          },
          scripts: {
            start: "nest start",
            lint: "eslint src --ext .ts",
            test: "jest",
            build: "nest build",
            debug: "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand"
          },
          lockPackages: {}
        },
        [
          {
            path: "D:/fixture/src/main.ts",
            content: "import { NestFactory } from '@nestjs/core';"
          }
        ],
        { hasTypeScriptConfig: true }
      );

      assert.deepEqual(
        unused.map((item) => item.name),
        ["unused-runtime", "unused-tool"]
      );
    }
  },
  {
    name: "runtime trace loader normalizes package evidence",
    run: async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-runtime-"));
      const tracePath = path.join(tempRoot, "depbrain-runtime.json");
      await fs.writeFile(
        tracePath,
        JSON.stringify({
          version: "1.0",
          packages: ["runtime-lib", "runtime-lib", "@scope/pkg"],
          files: ["b.js", "a.js", "a.js"],
          startedAt: "2026-06-08T00:00:00.000Z",
          endedAt: "2026-06-08T00:00:01.000Z"
        }),
        "utf8"
      );

      const evidence = await loadRuntimeTrace(tracePath);

      assert.deepEqual(evidence.packages, ["@scope/pkg", "runtime-lib"]);
      assert.deepEqual(evidence.files, ["a.js", "b.js"]);
      assert.equal(evidence.packageCount, 2);
      assert.equal(evidence.fileCount, 2);
      assert.equal(await loadRuntimeTrace(path.join(tempRoot, "missing.json")), null);
    }
  },
  {
    name: "unused detection suppresses packages seen in runtime trace",
    run: async () => {
      const unused = await findUnusedDependencies(
        "D:/fixture",
        {
          rootDir: "D:/fixture",
          packageJsonPath: "D:/fixture/package.json",
          dependencies: {
            "runtime-lib": "^1.0.0",
            "unused-lib": "^1.0.0"
          },
          devDependencies: {
            "runtime-tool": "^1.0.0",
            "unused-tool": "^1.0.0"
          },
          overrides: {},
          scripts: {},
          lockPackages: {}
        },
        [],
        {
          hasTypeScriptConfig: false,
          runtimeEvidence: {
            tracePath: "D:/fixture/depbrain-runtime.json",
            packages: ["runtime-lib", "runtime-tool"],
            files: [],
            packageCount: 2,
            fileCount: 0
          }
        }
      );

      assert.deepEqual(
        unused.map((item) => item.name),
        ["unused-lib", "unused-tool"]
      );
    }
  },
  {
    name: "health scorer applies weighted deductions",
    run: async () => {
      assert.equal(
        calculateHealthScore({
          duplicates: 2,
          outdated: 3,
          unused: 1,
          risks: 1
        }),
        67
      );
      assert.equal(
        calculateHealthScore({
          duplicates: 2,
          outdated: 3,
          unused: 1,
          risks: 1,
          duplicateWeight: 2,
          outdatedWeight: 1,
          unusedWeight: 1,
          riskWeight: 5
        }),
        87
      );
      assert.equal(
        calculateHealthScore({
          duplicates: 0,
          outdated: 52,
          unused: 8,
          risks: 9
        }),
        25
      );
    }
  },
  {
    name: "focus mode limits analysis to requested checks",
    run: async () => {
      const fixtureRoot = path.join(__dirname, "workspace-root");
      const result = await analyzeProject({
        rootDir: path.join(__dirname, "fixtures", "workspace-root"),
        focus: "duplicates"
      });

      assert.ok(result.duplicates.length > 0);
      assert.equal(result.unused.length, 0);
      assert.equal(result.outdated.length, 0);
      assert.equal(result.risks.length, 0);
    }
  },
  {
    name: "config loader applies defaults and fixture overrides",
    run: async () => {
      const fixtureRoot = path.join(__dirname, "fixtures", "config-project");
      const config = await loadDepBrainConfig(fixtureRoot);

      assert.deepEqual(config.ignore.unused, ["unused-lib", "unused-dev-tool"]);
      assert.equal(config.policy.minScore, 100);
      assert.equal(config.policy.failOnUnused, true);
      assert.equal(config.report.maxSuggestions, 1);
      assert.deepEqual(config.ignore.outdated, []);
    }
  },
  {
    name: "plugin hooks can enrich analysis extensions",
    run: async () => {
      const fixtureRoot = path.join(__dirname, "fixtures", "unused-project");
      const result = await analyzeProject({
        rootDir: fixtureRoot,
        config: {
          plugins: {
            paths: ["../plugin-test.mjs"]
          }
        }
      });

      assert.equal(result.extensions["test-plugin"].postScan, true);
      assert.equal(result.extensions["test-plugin"].reportHook, true);
      assert.equal(typeof result.extensions["test-plugin"].scoreAtHook, "number");
    }
  },
  {
    name: "plugin failures are reported as diagnostics",
    run: async () => {
      const fixtureRoot = path.join(__dirname, "fixtures", "unused-project");
      const result = await analyzeProject({
        rootDir: fixtureRoot,
        config: {
          plugins: {
            paths: ["../missing-plugin.mjs"]
          }
        }
      });

      assert.equal(result.extensions.depBrain.plugins[0].code, "load_failed");
      assert.equal(result.extensions.depBrain.plugins[0].spec, "../missing-plugin.mjs");
    }
  },
  {
    name: "built-in license plugin reports package licenses",
    run: async () => {
      const fixtureRoot = path.join(__dirname, "fixtures", "unused-project");
      const result = await analyzeProject({
        rootDir: fixtureRoot,
        config: {
          plugins: {
            enabled: ["license"]
          }
        }
      });

      assert.equal(result.extensions.license.summary.total, 6);
      assert.equal(result.extensions.license.summary.unknown, 6);
      assert.ok(result.extensions.license.packages.some((item) => item.name === "unused-lib"));
    }
  },
  {
    name: "risk thresholds are configurable",
    run: async () => {
      const risks = await findRiskDependencies(
        {
          rootDir: "D:/fixture",
          packageJsonPath: "D:/fixture/package.json",
          dependencies: {
            stale: "^1.0.0"
          },
          devDependencies: {},
          overrides: {},
          scripts: {},
          lockPackages: {}
        },
        {
          thresholds: {
            ...defaultConfig.risk,
            staleReleaseDays: 1000,
            agingReleaseDays: 700,
            lowTrustWeightThreshold: 4,
            mediumTrustWeightThreshold: 2
          },
          resolvePackageMetadata: async () => ({
            latestVersion: "1.0.0",
            repository: "https://github.com/example/stale",
            downloads: 100000,
            daysSincePublish: 800,
            maintainersCount: 2,
            versionCount: 20,
            recentReleaseCount: 0
          })
        }
      );

      assert.equal(risks.length, 1);
      assert.equal(risks[0].trustScore, "medium");
      assert.ok(risks[0].reasonCodes.includes("aging_release"));
    }
  },
  {
    name: "analysis respects config ignore rules and policy thresholds",
    run: async () => {
      const fixtureRoot = path.join(__dirname, "fixtures", "config-project");
      const result = await analyzeProject({
        rootDir: fixtureRoot,
        config: {
          policy: {
            minScore: 0
          }
        }
      });

      assert.equal(result.unused.length, 0);
      assert.equal(result.policy.passed, true);
      assert.deepEqual(result.policy.reasons, []);
      assert.ok(result.suggestions.length <= result.config.report.maxSuggestions);
      assert.ok(result.outdated.every((item) => typeof item.confidence === "number"));
    }
  },
  {
    name: "workspace analysis returns per-package results",
    run: async () => {
      const fixtureRoot = path.join(__dirname, "fixtures", "workspace-root");
      const result = await analyzeProject({ rootDir: fixtureRoot });

      assert.ok(result.packages);
      assert.equal(result.packages?.length, 2);
      const names = result.packages?.map((pkg) => pkg.name).sort();
      assert.deepEqual(names, ["@workspace/a", "@workspace/b"]);

      const unused = result.unused.map((item) => item.package);
      assert.ok(unused.includes("@workspace/b"));
      assert.ok(result.unused.every((item) => Array.isArray(item.reasonCodes)));
      assert.ok(result.duplicates.some((item) => item.name === "chalk"));
      const chalkDuplicate = result.duplicates.find((item) => item.name === "chalk");
      assert.ok(chalkDuplicate);
      assert.ok(chalkDuplicate.workspaceUsage.some((item) => item.workspace === "@workspace/a"));
      assert.ok(chalkDuplicate.workspaceUsage.some((item) => item.workspace === "@workspace/b"));
      assert.ok(chalkDuplicate.rootCause.some((entry) => entry.includes("@workspace/a")));
      assert.equal(result.packages?.[0]?.ownershipSummary.duplicates, 0);
      assert.ok(typeof result.ownershipSummary.duplicates === "number");
    }
  },
  {
    name: "config resolution honors defaults and CLI overrides",
    run: async () => {
      const fixtureRoot = path.join(__dirname, "fixtures", "config-project");
      const result = await analyzeProject({
        rootDir: fixtureRoot,
        config: {
          policy: {
            minScore: 75
          }
        }
      });

      assert.equal(result.config.policy.minScore, 75);
    }
  },
  {
    name: "ignore prefixes and patterns apply across checks",
    run: async () => {
      const fixtureRoot = path.join(__dirname, "fixtures", "config-project");
      const result = await analyzeProject({
        rootDir: fixtureRoot,
        config: {
          ignore: {
            prefixes: ["@types/"],
            patterns: ["^tsx$"]
          }
        }
      });

      assert.ok(result.unused.every((item) => !item.name.startsWith("@types/")));
      assert.ok(result.unused.every((item) => item.name !== "tsx"));
    }
  },
  {
    name: "analysis output includes confidence and explanations",
    run: async () => {
      const fixtureRoot = path.join(__dirname, "fixtures", "unused-project");
      const result = await analyzeProject({ rootDir: fixtureRoot });

      assert.ok(result.unused.length > 0);
      const unusedItem = result.unused[0];
      assert.equal(typeof unusedItem?.confidence, "number");
      assert.ok(unusedItem?.confidence >= 0 && unusedItem?.confidence <= 1);
      assert.ok(Array.isArray(unusedItem?.reasonCodes));
      assert.ok(unusedItem.reasonCodes.length > 0);
      assert.ok(Array.isArray(unusedItem?.explanation));
      assert.ok(unusedItem.explanation.length > 0);
      assert.ok(unusedItem.recommendation);
      assert.equal(unusedItem.recommendation.action, "remove");
      assert.ok(result.topIssues.length > 0);
      assert.ok(result.risks.every((item) => typeof item.trustScore === "string"));
      assert.ok(result.risks.every((item) => typeof item.transitiveRiskScore === "number"));
      assert.ok(result.outdated.every((item) => item.advice && typeof item.advice.risk === "string"));
      assert.equal(result.outputVersion, "1.9");
      assert.equal(result.newFindings, undefined);
      assert.equal(result.fixPlan, undefined);
    }
  },
  {
    name: "top issues are ranked and actionable",
    run: async () => {
      const fixtureRoot = path.join(__dirname, "fixtures", "unused-project");
      const result = await analyzeProject({ rootDir: fixtureRoot });

      assert.ok(result.topIssues.length > 0);
      assert.ok(["high", "medium", "low"].includes(result.topIssues[0].priority));
      assert.equal(typeof result.topIssues[0].recommendation.summary, "string");
    }
  },
  {
    name: "baseline mode filters out existing issues",
    run: async () => {
      const fixtureRoot = path.join(__dirname, "fixtures", "unused-project");
      const baseline = {
        unused: [{ name: "unused-lib", section: "dependencies" }]
      };

      const result = await analyzeProject({
        rootDir: fixtureRoot,
        baseline
      });

      assert.equal(result.unused.length, 1);
      assert.equal(result.unused[0].name, "unused-dev-tool");
    }
  },
  {
    name: "console report is non-empty",
    run: async () => {
      const report = renderConsoleReport({
        outputVersion: "1.4",
        rootDir: "D:/fixture",
        score: 100,
        scoreBreakdown: {
          baseScore: 100,
          duplicates: 0,
          outdated: 0,
          unused: 0,
          risks: 0,
          weights: {
            duplicateWeight: 5,
            outdatedWeight: 3,
            unusedWeight: 4,
            riskWeight: 10
          }
        },
        policy: { passed: true, reasons: [] },
        ownershipSummary: {
          duplicates: 0,
          unused: 0,
          outdated: 0,
          risks: 0
        },
        duplicates: [],
        unused: [],
        outdated: [],
        risks: [],
        suggestions: [],
        topIssues: [],
        config: {
          ignore: {
            dependencies: [],
            devDependencies: [],
            duplicates: [],
            outdated: [],
            risks: [],
            unused: [],
            prefixes: [],
            patterns: []
          },
          policy: {
            minScore: 0,
            failOnDuplicates: false,
            failOnOutdated: false,
            failOnRisks: false,
            failOnUnused: false
          },
          report: {
            maxSuggestions: 5
          },
          scoring: {
            duplicateWeight: 5,
            outdatedWeight: 3,
            unusedWeight: 4,
            riskWeight: 10
          },
          scan: {
            excludePaths: []
          }
        }
      });

      assert.ok(report.trim().length > 0);
    }
  },
  {
    name: "json report is non-empty",
    run: async () => {
      const report = renderJsonReport({
        outputVersion: "1.6",
        rootDir: "D:/fixture",
        score: 100,
        scoreBreakdown: {
          baseScore: 100,
          duplicates: 0,
          outdated: 0,
          unused: 0,
          risks: 0,
          weights: {
            duplicateWeight: 5,
            outdatedWeight: 3,
            unusedWeight: 4,
            riskWeight: 10
          }
        },
        policy: { passed: true, reasons: [] },
        ownershipSummary: {
          duplicates: 0,
          unused: 0,
          outdated: 0,
          risks: 0
        },
        duplicates: [],
        unused: [],
        outdated: [{
          name: "alpha",
          current: "^1.0.0",
          latest: "2.0.0",
          updateType: "major",
          confidence: 0.97,
          reasonCodes: ["latest_registry_version_newer"],
          explanation: ["A newer version is available."],
          advice: {
            risk: "high",
            recommendedTarget: "1.9.0",
            latestEvaluatedVersion: "2.0.0",
            intermediateSteps: ["1.9.0", "2.0.0"],
            releaseNotes: ["https://github.com/example/alpha/releases/tag/v2.0.0"],
            signals: ["semver_major"],
            currentRange: "^1.0.0"
          },
          recommendation: {
            action: "upgrade",
            priority: "high",
            safety: "unknown",
            summary: "Upgrade in steps toward 1.9.0; review breaking signals first.",
            reasons: ["A newer version is available."]
          }
        }],
        risks: [],
        suggestions: [],
        topIssues: [],
        config: {
          ignore: {
            dependencies: [],
            devDependencies: [],
            duplicates: [],
            outdated: [],
            risks: [],
            unused: [],
            prefixes: [],
            patterns: []
          },
          policy: {
            minScore: 0,
            failOnDuplicates: false,
            failOnOutdated: false,
            failOnRisks: false,
            failOnUnused: false
          },
          report: {
            maxSuggestions: 5
          },
          scoring: {
            duplicateWeight: 5,
            outdatedWeight: 3,
            unusedWeight: 4,
            riskWeight: 10
          },
          scan: {
            excludePaths: []
          }
        }
      });

      assert.ok(report.trim().length > 0);
      assert.ok(report.includes("\"advice\""));
    }
  },
  {
    name: "json report supports optional new findings and fix plan fields",
    run: async () => {
      const unusedItem = {
        name: "unused-lib",
        section: "devDependencies",
        confidence: 0.95,
        reasonCodes: ["no_source_reference"],
        explanation: ["No source reference found."],
        recommendation: {
          action: "remove",
          priority: "high",
          safety: "safe",
          summary: "Safe to remove from devDependencies.",
          reasons: ["No source reference found."]
        }
      };
      const report = renderJsonReport({
        outputVersion: "1.9",
        rootDir: "D:/fixture",
        score: 100,
        scoreBreakdown: { baseScore: 100, duplicates: 0, outdated: 0, unused: 1, risks: 0, weights: { duplicateWeight: 5, outdatedWeight: 3, unusedWeight: 4, riskWeight: 10 } },
        policy: { passed: true, reasons: [] },
        ownershipSummary: { duplicates: 0, unused: 1, outdated: 0, risks: 0 },
        duplicates: [],
        unused: [unusedItem],
        outdated: [],
        risks: [],
        suggestions: [],
        topIssues: [],
        extensions: {},
        config: defaultConfig,
        newFindings: {
          counts: { duplicates: 0, unused: 1, outdated: 0, risks: 0 },
          duplicates: [],
          unused: [unusedItem],
          outdated: [],
          risks: [],
          topIssues: []
        },
        fixPlan: {
          packageManager: "npm",
          dryRun: true,
          commands: ["npm uninstall unused-lib"],
          items: [{
            name: "unused-lib",
            section: "devDependencies",
            confidence: 0.95,
            safety: "safe",
            command: "npm uninstall unused-lib",
            args: ["npm", "uninstall", "unused-lib"]
          }],
          skipped: []
        }
      });
      const parsed = JSON.parse(report);

      assert.equal(parsed.outputVersion, "1.9");
      assert.equal(parsed.newFindings.counts.unused, 1);
      assert.equal(parsed.fixPlan.commands[0], "npm uninstall unused-lib");
    }
  },
  {
    name: "markdown report is non-empty",
    run: async () => {
      const report = renderMarkdownReport({
        outputVersion: "1.4",
        rootDir: "D:/fixture",
        score: 100,
        scoreBreakdown: {
          baseScore: 100,
          duplicates: 0,
          outdated: 0,
          unused: 0,
          risks: 0,
          weights: {
            duplicateWeight: 5,
            outdatedWeight: 3,
            unusedWeight: 4,
            riskWeight: 10
          }
        },
        policy: { passed: true, reasons: [] },
        ownershipSummary: {
          duplicates: 0,
          unused: 0,
          outdated: 0,
          risks: 0
        },
        duplicates: [],
        unused: [],
        outdated: [],
        risks: [],
        suggestions: [],
        topIssues: [],
        config: {
          ignore: {
            dependencies: [],
            devDependencies: [],
            duplicates: [],
            outdated: [],
            risks: [],
            unused: [],
            prefixes: [],
            patterns: []
          },
          policy: {
            minScore: 0,
            failOnDuplicates: false,
            failOnOutdated: false,
            failOnRisks: false,
            failOnUnused: false
          },
          report: {
            maxSuggestions: 5
          },
          scoring: {
            duplicateWeight: 5,
            outdatedWeight: 3,
            unusedWeight: 4,
            riskWeight: 10
          },
          scan: {
            excludePaths: []
          }
        }
      });

      assert.ok(report.trim().length > 0);
    }
  },
  {
    name: "sarif report is valid",
    run: async () => {
      const reportData = {
        outputVersion: "1.4",
        rootDir: "D:/fixture",
        score: 100,
        scoreBreakdown: { baseScore: 100, duplicates: 0, outdated: 0, unused: 0, risks: 0, weights: { duplicateWeight: 5, outdatedWeight: 3, unusedWeight: 4, riskWeight: 10 } },
        policy: { passed: true, reasons: [] },
        ownershipSummary: { duplicates: 0, unused: 0, outdated: 0, risks: 0 },
        duplicates: [],
        unused: [{
          name: "unused-lib",
          section: "dependencies",
          confidence: 0.9,
          reasonCodes: ["no-usage"],
          explanation: ["Not used in code"],
          recommendation: {
            action: "remove",
            priority: "high",
            safety: "safe",
            summary: "Remove unused-lib",
            reasons: ["Not used in code"]
          }
        }],
        outdated: [],
        risks: [],
        suggestions: [],
        topIssues: [],
        config: defaultConfig
      };

      const sarifJson = renderSarifReport(reportData);
      const parsed = JSON.parse(sarifJson);
      
      assert.equal(parsed.version, "2.1.0");
      assert.equal(parsed.runs[0].tool.driver.name, "Dependency Brain");
      assert.ok(parsed.runs[0].results.length > 0);
      
      const result = parsed.runs[0].results[0];
      assert.equal(result.ruleId, "dep-brain-unused");
      assert.equal(result.level, "error"); // Because priority was "high"
      assert.ok(result.message.text.includes("unused-lib"));
    }
  },
  {
    name: "dashboard report is valid html",
    run: async () => {
      const report = renderDashboardReport({
        outputVersion: "1.6",
        rootDir: "D:/fixture",
        score: 100,
        scoreBreakdown: { baseScore: 100, duplicates: 0, outdated: 1, unused: 0, risks: 0, weights: { duplicateWeight: 5, outdatedWeight: 3, unusedWeight: 4, riskWeight: 10 } },
        policy: { passed: true, reasons: [] },
        ownershipSummary: { duplicates: 0, unused: 0, outdated: 1, risks: 0 },
        duplicates: [],
        unused: [],
        outdated: [{
          name: "alpha",
          current: "^1.0.0",
          latest: "2.0.0",
          updateType: "major",
          confidence: 0.97,
          reasonCodes: ["latest_registry_version_newer"],
          explanation: ["A newer version is available."],
          advice: {
            risk: "high",
            recommendedTarget: "1.9.0",
            latestEvaluatedVersion: "2.0.0",
            intermediateSteps: ["1.9.0", "2.0.0"],
            releaseNotes: ["https://github.com/example/alpha/releases/tag/v2.0.0"],
            signals: ["semver_major"],
            currentRange: "^1.0.0"
          },
          recommendation: {
            action: "upgrade",
            priority: "high",
            safety: "unknown",
            summary: "Upgrade in steps toward 1.9.0; review breaking signals first.",
            reasons: ["A newer version is available."]
          }
        }],
        risks: [{
          name: "alpha",
          reasons: ["Introduces 1 risky transitive dependency"],
          confidence: 0.9,
          reasonCodes: ["risky_transitive_dependencies"],
          explanation: ["Transitive paths: alpha -> beta"],
          trustScore: "medium",
          riskFactors: {
            daysSincePublish: 1,
            downloads: 10000,
            maintainersCount: 2,
            versionCount: 10,
            recentReleaseCount: 1,
            hasRepository: true,
            dependencyType: "dependencies",
            transitiveDependencyCount: 2,
            riskyTransitiveCount: 1
          },
          transitiveRiskScore: 3,
          riskyTransitiveDeps: [{
            name: "beta",
            trustScore: "low",
            confidence: 0.95,
            reasons: ["Single maintainer package"],
            introducedByPaths: ["alpha -> beta"]
          }],
          recommendation: {
            action: "review",
            priority: "high",
            safety: "caution",
            summary: "Review this direct dependency and its transitive chain before upgrading or keeping it.",
            reasons: ["Introduces 1 risky transitive dependency"]
          }
        }],
        suggestions: ["Keep dependencies reviewed"],
        topIssues: [],
        extensions: {},
        config: defaultConfig
      });

      assert.ok(report.includes("<!doctype html>"));
      assert.ok(report.includes("Dependency Brain Dashboard"));
      assert.ok(report.includes("Upgrade Priorities"));
      assert.ok(report.includes("Transitive Risk Hotspots"));
      assert.ok(report.includes("alpha -&gt; beta") || report.includes("alpha -> beta"));
    }
  },
  {
    name: "notifications send compact webhook summaries",
    run: async () => {
      const calls = [];
      const result = {
        outputVersion: "1.6",
        rootDir: "D:/fixture",
        score: 72,
        scoreBreakdown: { baseScore: 100, duplicates: 5, outdated: 3, unused: 0, risks: 10, weights: { duplicateWeight: 5, outdatedWeight: 3, unusedWeight: 4, riskWeight: 10 } },
        policy: { passed: false, reasons: ["Found 1 risky dependencies"] },
        ownershipSummary: { duplicates: 1, unused: 0, outdated: 1, risks: 1 },
        duplicates: [{
          name: "alpha",
          versions: ["1.0.0", "2.0.0"],
          instances: [],
          workspaceUsage: [],
          rootCause: [],
          confidence: 0.9,
          reasonCodes: ["multiple_lockfile_versions"],
          explanation: ["Multiple versions are installed."],
          recommendation: {
            action: "consolidate",
            priority: "medium",
            safety: "caution",
            summary: "Consolidate toward 2.0.0; 0 installation paths are affected.",
            reasons: ["Multiple versions are installed."]
          }
        }],
        unused: [],
        outdated: [{
          name: "beta",
          current: "^1.0.0",
          latest: "2.0.0",
          updateType: "major",
          confidence: 0.97,
          reasonCodes: ["latest_registry_version_newer"],
          explanation: ["A newer version is available."],
          advice: {
            risk: "high",
            recommendedTarget: "1.9.0",
            latestEvaluatedVersion: "2.0.0",
            intermediateSteps: ["1.9.0", "2.0.0"],
            releaseNotes: [],
            signals: ["semver_major"],
            currentRange: "^1.0.0"
          },
          recommendation: {
            action: "upgrade",
            priority: "high",
            safety: "unknown",
            summary: "Upgrade in steps toward 1.9.0; review breaking signals first.",
            reasons: ["A newer version is available."]
          }
        }],
        risks: [{
          name: "gamma",
          reasons: ["Low trust package"],
          confidence: 0.91,
          reasonCodes: ["low_trust_score"],
          explanation: ["Package has low trust signals."],
          trustScore: "low",
          riskFactors: {
            daysSincePublish: 900,
            downloads: 10,
            maintainersCount: 1,
            versionCount: 2,
            recentReleaseCount: 0,
            hasRepository: false,
            dependencyType: "dependencies",
            transitiveDependencyCount: 0,
            riskyTransitiveCount: 0
          },
          transitiveRiskScore: 0,
          riskyTransitiveDeps: [],
          recommendation: {
            action: "review",
            priority: "high",
            safety: "caution",
            summary: "Low trust package; review whether to replace, pin, or monitor it closely.",
            reasons: ["Package has low trust signals."]
          }
        }],
        suggestions: [],
        topIssues: [{
          kind: "risk",
          name: "gamma",
          priority: "high",
          confidence: 0.91,
          summary: "Low trust package; review whether to replace, pin, or monitor it closely.",
          trustScore: "low",
          recommendation: {
            action: "review",
            priority: "high",
            safety: "caution",
            summary: "Low trust package; review whether to replace, pin, or monitor it closely.",
            reasons: ["Package has low trust signals."]
          }
        }],
        extensions: {},
        config: {
          ...defaultConfig,
          notifications: {
            ...defaultConfig.notifications,
            enabled: true,
            on: "failure"
          }
        }
      };

      const statuses = await sendConfiguredNotifications(result, {
        env: {
          DEPBRAIN_SLACK_WEBHOOK_URL: "https://example.invalid/slack",
          DEPBRAIN_DISCORD_WEBHOOK_URL: "https://example.invalid/discord"
        },
        sender: async (input) => {
          calls.push(input);
        }
      });

      assert.equal(statuses.every((item) => item.status === "sent"), true);
      assert.deepEqual(calls.map((item) => item.channel), ["slack", "discord"]);
      assert.ok(calls[0].payload.text.includes("dep-brain FAIL: score 72/100"));
      assert.ok(calls[1].payload.content.includes("upgrades: high 1"));
    }
  },
  {
    name: "pr comment report includes baseline delta summary",
    run: async () => {
      const report = await renderPrCommentReport({
        outputVersion: "1.6",
        rootDir: "D:/fixture",
        score: 72,
        scoreBreakdown: { baseScore: 100, duplicates: 5, outdated: 3, unused: 0, risks: 10, weights: { duplicateWeight: 5, outdatedWeight: 3, unusedWeight: 4, riskWeight: 10 } },
        policy: { passed: false, reasons: ["Found 1 risky dependencies"] },
        ownershipSummary: { duplicates: 0, unused: 0, outdated: 1, risks: 1 },
        duplicates: [],
        unused: [],
        outdated: [{
          name: "beta",
          current: "^1.0.0",
          latest: "2.0.0",
          updateType: "major",
          confidence: 0.97,
          reasonCodes: ["latest_registry_version_newer"],
          explanation: ["A newer version is available."],
          advice: {
            risk: "high",
            recommendedTarget: "1.9.0",
            latestEvaluatedVersion: "2.0.0",
            intermediateSteps: ["1.9.0", "2.0.0"],
            releaseNotes: [],
            signals: ["semver_major"],
            currentRange: "^1.0.0"
          },
          recommendation: {
            action: "upgrade",
            priority: "high",
            safety: "unknown",
            summary: "Upgrade in steps toward 1.9.0; review breaking signals first.",
            reasons: ["A newer version is available."]
          }
        }],
        risks: [],
        suggestions: [],
        topIssues: [{
          kind: "outdated",
          name: "beta",
          priority: "high",
          confidence: 0.97,
          summary: "Upgrade in steps toward 1.9.0; review breaking signals first.",
          recommendation: {
            action: "upgrade",
            priority: "high",
            safety: "unknown",
            summary: "Upgrade in steps toward 1.9.0; review breaking signals first.",
            reasons: ["A newer version is available."]
          }
        }],
        extensions: {},
        config: defaultConfig
      }, { hasBaseline: true });

      assert.ok(report.includes("<!-- dep-brain-report -->"));
      assert.ok(report.includes("**Policy:** FAIL"));
      assert.ok(report.includes("**New since baseline:** duplicates 0, unused 0, outdated 1, risks 0"));
      assert.ok(report.includes("### Upgrade Priorities"));
    }
  },
  {
    name: "github pr comment updates existing marker comment",
    run: async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-pr-"));
      const eventPath = path.join(tempRoot, "event.json");
      const calls = [];
      await fs.writeFile(
        eventPath,
        JSON.stringify({ pull_request: { number: 42 } }),
        "utf8"
      );

      const result = await upsertGitHubPrComment({
        body: "<!-- dep-brain-report -->\nupdated",
        env: {
          GITHUB_TOKEN: "token",
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_EVENT_PATH: eventPath
        },
        request: async (url, init) => {
          calls.push({ url, init });
          if (init.method === "GET") {
            return {
              ok: true,
              status: 200,
              json: async () => [{ id: 7, body: "<!-- dep-brain-report -->\nold" }]
            };
          }

          return {
            ok: true,
            status: 200,
            json: async () => ({})
          };
        }
      });

      assert.equal(result.status, "updated");
      assert.equal(calls[0].url, "https://api.github.com/repos/owner/repo/issues/42/comments");
      assert.equal(calls[1].url, "https://api.github.com/repos/owner/repo/issues/comments/7");
      assert.equal(calls[1].init.method, "PATCH");
    }
  },
  {
    name: "unused fix plan renders safe npm removals",
    run: async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-fix-npm-"));
      await fs.writeFile(path.join(tempRoot, "package-lock.json"), "{}", "utf8");

      const plan = await buildUnusedFixPlan({
        outputVersion: "1.6",
        rootDir: tempRoot,
        score: 100,
        scoreBreakdown: { baseScore: 100, duplicates: 0, outdated: 0, unused: 1, risks: 0, weights: { duplicateWeight: 5, outdatedWeight: 3, unusedWeight: 4, riskWeight: 10 } },
        policy: { passed: true, reasons: [] },
        ownershipSummary: { duplicates: 0, unused: 1, outdated: 0, risks: 0 },
        duplicates: [],
        unused: [{
          name: "unused-lib",
          section: "devDependencies",
          confidence: 0.95,
          reasonCodes: ["no_source_reference"],
          explanation: ["No source reference found."],
          recommendation: {
            action: "remove",
            priority: "high",
            safety: "safe",
            summary: "Safe to remove from devDependencies.",
            reasons: ["No source reference found."]
          }
        }],
        outdated: [],
        risks: [],
        suggestions: [],
        topIssues: [],
        extensions: {},
        config: defaultConfig
      });

      assert.equal(plan.packageManager, "npm");
      assert.deepEqual(plan.commands, ["npm uninstall unused-lib"]);
      assert.equal(renderFixPlan(plan).includes("npm uninstall unused-lib"), true);
    }
  },
  {
    name: "unused fix plan skips caution unless requested",
    run: async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-fix-pnpm-"));
      await fs.writeFile(path.join(tempRoot, "pnpm-lock.yaml"), "lockfileVersion: '9.0'", "utf8");
      const result = {
        outputVersion: "1.6",
        rootDir: tempRoot,
        score: 100,
        scoreBreakdown: { baseScore: 100, duplicates: 0, outdated: 0, unused: 1, risks: 0, weights: { duplicateWeight: 5, outdatedWeight: 3, unusedWeight: 4, riskWeight: 10 } },
        policy: { passed: true, reasons: [] },
        ownershipSummary: { duplicates: 0, unused: 1, outdated: 0, risks: 0 },
        duplicates: [],
        unused: [{
          name: "unused-runtime",
          section: "dependencies",
          package: "pkg-a",
          confidence: 0.8,
          reasonCodes: ["no_source_reference"],
          explanation: ["No source reference found."],
          recommendation: {
            action: "remove",
            priority: "medium",
            safety: "caution",
            summary: "Likely removable from dependencies, but review before deleting.",
            reasons: ["No source reference found."]
          }
        }],
        outdated: [],
        risks: [],
        suggestions: [],
        topIssues: [],
        extensions: {},
        config: defaultConfig
      };

      const safePlan = await buildUnusedFixPlan(result);
      const cautionPlan = await buildUnusedFixPlan(result, { includeCaution: true });

      assert.equal(safePlan.commands.length, 0);
      assert.equal(safePlan.skipped[0].reason, "requires --include-caution");
      assert.deepEqual(cautionPlan.commands, ["pnpm --filter pkg-a remove unused-runtime"]);
    }
  },
  {
    name: "unused fix plan renders yarn workspace removals",
    run: async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-fix-yarn-"));
      await fs.writeFile(path.join(tempRoot, "yarn.lock"), "", "utf8");
      const plan = await buildUnusedFixPlan({
        outputVersion: "1.6",
        rootDir: tempRoot,
        score: 100,
        scoreBreakdown: { baseScore: 100, duplicates: 0, outdated: 0, unused: 1, risks: 0, weights: { duplicateWeight: 5, outdatedWeight: 3, unusedWeight: 4, riskWeight: 10 } },
        policy: { passed: true, reasons: [] },
        ownershipSummary: { duplicates: 0, unused: 1, outdated: 0, risks: 0 },
        duplicates: [],
        unused: [{
          name: "unused-tool",
          section: "devDependencies",
          package: "pkg-b",
          confidence: 0.95,
          reasonCodes: ["no_source_reference"],
          explanation: ["No source reference found."],
          recommendation: {
            action: "remove",
            priority: "high",
            safety: "safe",
            summary: "Safe to remove from devDependencies.",
            reasons: ["No source reference found."]
          }
        }],
        outdated: [],
        risks: [],
        suggestions: [],
        topIssues: [],
        extensions: {},
        config: defaultConfig
      });

      assert.deepEqual(plan.commands, ["yarn workspace pkg-b remove unused-tool"]);
    }
  },
  {
    name: "fix apply blocks dirty git worktree",
    run: async () => {
      const plan = {
        packageManager: "npm",
        dryRun: true,
        commands: ["npm uninstall unused-lib"],
        items: [{
          name: "unused-lib",
          section: "devDependencies",
          confidence: 0.95,
          safety: "safe",
          command: "npm uninstall unused-lib",
          args: ["npm", "uninstall", "unused-lib"]
        }],
        skipped: []
      };

      const result = await applyFixPlan(plan, {
        rootDir: "D:/fixture",
        runner: async (command, args) => ({
          command: [command, ...args].join(" "),
          exitCode: 0,
          stdout: " M package.json\n",
          stderr: ""
        })
      });

      assert.equal(result.dirty, true);
      assert.equal(result.applied.length, 0);
      assert.equal(result.failed.command, "git status --porcelain");
    }
  },
  {
    name: "fix apply runs commands and test command",
    run: async () => {
      const calls = [];
      const plan = {
        packageManager: "npm",
        dryRun: true,
        commands: ["npm uninstall unused-lib"],
        items: [{
          name: "unused-lib",
          section: "devDependencies",
          confidence: 0.95,
          safety: "safe",
          command: "npm uninstall unused-lib",
          args: ["npm", "uninstall", "unused-lib"]
        }],
        skipped: []
      };

      const result = await applyFixPlan(plan, {
        rootDir: "D:/fixture",
        testCommand: "npm test",
        noRollback: true,
        runner: async (command, args) => {
          calls.push([command, ...args].join(" "));
          return {
            command: [command, ...args].join(" "),
            exitCode: 0,
            stdout: "",
            stderr: ""
          };
        }
      });

      const expectedTestCommand =
        process.platform === "win32" ? "cmd /c npm test" : "sh -c npm test";
      assert.deepEqual(calls, [
        "git status --porcelain",
        "npm uninstall unused-lib",
        expectedTestCommand
      ]);
      assert.equal(result.applied.length, 1);
      assert.equal(result.failed, null);
      assert.equal(result.test.exitCode, 0);
    }
  },
  {
    name: "fix apply stops on failed uninstall",
    run: async () => {
      const calls = [];
      const plan = {
        packageManager: "npm",
        dryRun: true,
        commands: ["npm uninstall broken-lib", "npm uninstall skipped-lib"],
        items: [
          {
            name: "broken-lib",
            section: "devDependencies",
            confidence: 0.95,
            safety: "safe",
            command: "npm uninstall broken-lib",
            args: ["npm", "uninstall", "broken-lib"]
          },
          {
            name: "skipped-lib",
            section: "devDependencies",
            confidence: 0.95,
            safety: "safe",
            command: "npm uninstall skipped-lib",
            args: ["npm", "uninstall", "skipped-lib"]
          }
        ],
        skipped: []
      };

      const result = await applyFixPlan(plan, {
        rootDir: "D:/fixture",
        noRollback: true,
        runner: async (command, args) => {
          const fullCommand = [command, ...args].join(" ");
          calls.push(fullCommand);
          return {
            command: fullCommand,
            exitCode: fullCommand.includes("broken-lib") ? 1 : 0,
            stdout: "",
            stderr: fullCommand.includes("broken-lib") ? "uninstall failed" : ""
          };
        }
      });

      assert.deepEqual(calls, [
        "git status --porcelain",
        "npm uninstall broken-lib"
      ]);
      assert.equal(result.applied.length, 0);
      assert.equal(result.failed.command, "npm uninstall broken-lib");
    }
  },
  {
    name: "collectProjectFiles respects exclude paths",
    run: async () => {
      const fixtureRoot = path.join(__dirname, "fixtures", "exclude-project");
      const files = await collectProjectFiles(
        fixtureRoot,
        /\.(c|m)?(t|j)sx?$/,
        ["dist/**"]
      );

      const normalized = files.map((file) => file.replace(/\\/g, "/"));
      assert.ok(normalized.some((file) => file.includes("/src/")));
      assert.ok(normalized.every((file) => !file.includes("/dist/")));
    }
  },
  {
    name: "ownership mapping matches package names and path patterns",
    run: async () => {
      const { attributeOwners } = await import("../dist/core/ownership.js");
      const ownershipConfig = {
        owners: {
          "frontend-team": ["react*", "packages/frontend/**"],
          "security-team": ["*"]
        }
      };

      const ownersReact = attributeOwners("react-dom", "packages/backend", ownershipConfig);
      assert.ok(ownersReact.includes("frontend-team"));
      assert.ok(ownersReact.includes("security-team"));

      const ownersPath = attributeOwners("lodash", "packages/frontend/", ownershipConfig);
      assert.ok(ownersPath.includes("frontend-team"));
      assert.ok(ownersPath.includes("security-team"));

      const ownersOther = attributeOwners("express", "packages/backend/", ownershipConfig);
      assert.ok(!ownersOther.includes("frontend-team"));
      assert.ok(ownersOther.includes("security-team"));
    }
  },
  {
    name: "fix apply creates backup and rolls back on command failure",
    run: async () => {
      const { applyFixPlan } = await import("../dist/core/fix-apply.js");
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-apply-rb-"));
      try {
        const pkgJsonPath = path.join(tempRoot, "package.json");
        await fs.writeFile(
          pkgJsonPath,
          JSON.stringify({ dependencies: { "unused-lib": "^1.0.0" } }),
          "utf8"
        );

        const plan = {
          packageManager: "npm",
          dryRun: true,
          commands: ["npm uninstall unused-lib"],
          items: [
            {
              name: "unused-lib",
              section: "dependencies",
              confidence: 1,
              safety: "safe",
              command: "npm uninstall unused-lib",
              args: ["npm", "uninstall", "unused-lib"]
            }
          ],
          skipped: []
        };

        let uninstallCalled = false;
        const mockRunner = async (cmd, args, opts) => {
          if (cmd === "npm" && args[0] === "uninstall") {
            uninstallCalled = true;
            await fs.writeFile(pkgJsonPath, JSON.stringify({ dependencies: {} }), "utf8");
            return { command: "npm uninstall", exitCode: 0, stdout: "", stderr: "" };
          }
          if (cmd === "git") {
            return { command: "git status", exitCode: 0, stdout: "", stderr: "" };
          }
          if (cmd === "npm" && (args[0] === "ci" || args[0] === "install")) {
            return { command: "npm install", exitCode: 0, stdout: "", stderr: "" };
          }
          return { command: cmd, exitCode: 1, stdout: "", stderr: "mocked fail" };
        };

        const result = await applyFixPlan(plan, {
          rootDir: tempRoot,
          allowDirty: true,
          testCommand: "npm test",
          runner: mockRunner
        });

        assert.ok(uninstallCalled);
        assert.equal(result.rolledBack, true);

        const pkgData = JSON.parse(await fs.readFile(pkgJsonPath, "utf8"));
        assert.equal(pkgData.dependencies["unused-lib"], "^1.0.0");
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    }
  },
  {
    name: "artifact bundle consolidates files to directory",
    run: async () => {
      const { bundleArtifacts } = await import("../dist/core/artifact.js");
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-bundle-"));
      try {
        await fs.writeFile(path.join(tempRoot, "depbrain-dashboard.html"), "<html></html>", "utf8");
        await fs.writeFile(path.join(tempRoot, "depbrain-runtime.json"), "{}", "utf8");

        const config = {
          dashboard: { outputPath: "depbrain-dashboard.html" },
          runtimeTrace: { outputPath: "depbrain-runtime.json" }
        };

        const result = await bundleArtifacts({
          rootDir: tempRoot,
          config,
          outPath: "custom-artifacts"
        });

        assert.equal(result.success, true);
        assert.equal(result.isZip, false);
        assert.equal(result.filesBundled.length, 2);

        const dirContents = await fs.readdir(path.join(tempRoot, "custom-artifacts"));
        assert.ok(dirContents.includes("depbrain-dashboard.html"));
        assert.ok(dirContents.includes("depbrain-runtime.json"));
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    }
  },
  {
    name: "cleanUnusedImports removes ESM/CJS and supports TSX/JSX out-of-the-box",
    run: async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-codemod-"));
      try {
        const tsxFile = path.join(tempRoot, "App.tsx");
        const jsFile = path.join(tempRoot, "index.js");

        await fs.writeFile(
          tsxFile,
          [
            "import React from 'react';",
            "import { unused1, unused2 } from 'unused-pkg';",
            "import 'side-effect-pkg';",
            "const App = () => <div className=\"test\">Hello</div>;"
          ].join("\n"),
          "utf8"
        );

        await fs.writeFile(
          jsFile,
          [
            "const unused = require('unused-pkg');",
            "console.log('hello');"
          ].join("\n"),
          "utf8"
        );

        const result = await cleanUnusedImports({
          rootDir: tempRoot,
          packageNames: ["unused-pkg", "side-effect-pkg"],
          cleanSideEffects: false
        });

        assert.deepEqual(result.filesModified.sort(), [jsFile, tsxFile].sort());

        const tsxContent = await fs.readFile(tsxFile, "utf8");
        const jsContent = await fs.readFile(jsFile, "utf8");

        assert.ok(!tsxContent.includes("unused-pkg"));
        assert.ok(tsxContent.includes("side-effect-pkg")); // side-effects kept
        assert.ok(!jsContent.includes("unused-pkg"));

        // Clean side effects test
        await cleanUnusedImports({
          rootDir: tempRoot,
          packageNames: ["side-effect-pkg"],
          cleanSideEffects: true
        });
        const tsxContent2 = await fs.readFile(tsxFile, "utf8");
        assert.ok(!tsxContent2.includes("side-effect-pkg"));
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    }
  },
  {
    name: "applyDeduplication compares graph changes and generates overrides",
    run: async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-dedupe-"));
      try {
        await fs.writeFile(
          path.join(tempRoot, "package.json"),
          JSON.stringify({
            dependencies: {
              react: "^18.2.0"
            }
          }),
          "utf8"
        );

        await fs.writeFile(
          path.join(tempRoot, "package-lock.json"),
          JSON.stringify({
            name: "fixture",
            lockfileVersion: 3,
            packages: {
              "": {
                dependencies: {
                  react: "^18.2.0"
                }
              },
              "node_modules/react": {
                name: "react",
                version: "18.2.0"
              },
              "node_modules/foo/node_modules/react": {
                name: "react",
                version: "17.0.2"
              }
            }
          }, null, 2),
          "utf8"
        );

        // 1. Dry run
        const dryRunRes = await applyDeduplication(tempRoot, { dryRun: true });
        assert.equal(dryRunRes.success, true);
        assert.equal(dryRunRes.beforeCount, 1);
        assert.equal(dryRunRes.afterCount, 1);
        assert.deepEqual(dryRunRes.suggestedOverrides, { npm: { react: "18.2.0" } });

        // 2. Apply with mock runner
        const mockRunner = async (cmd, args, opts) => {
          // consolidate packages in mock lockfile
          await fs.writeFile(
            path.join(tempRoot, "package-lock.json"),
            JSON.stringify({
              name: "fixture",
              lockfileVersion: 3,
              packages: {
                "": {
                  dependencies: {
                    react: "^18.2.0"
                  }
                },
                "node_modules/react": {
                  name: "react",
                  version: "18.2.0"
                }
              }
            }, null, 2),
            "utf8"
          );
          return { command: `${cmd} ${args.join(" ")}`, exitCode: 0, stdout: "", stderr: "" };
        };

        const applyRes = await applyDeduplication(tempRoot, {
          dryRun: false,
          runner: mockRunner
        });

        assert.equal(applyRes.success, true);
        assert.equal(applyRes.beforeCount, 1);
        assert.equal(applyRes.afterCount, 0);
        assert.equal(applyRes.consolidatedCount, 1); // 2 versions reduced to 1 (2 - 1 = 1)
        assert.deepEqual(applyRes.remainingDuplicates, []);
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    }
  },
  {
    name: "local OSV caching saves, expires and falls back",
    run: async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-osvcache-"));
      try {
        const mockVuln = {
          id: "VULN-123",
          severity: "high",
          summary: "test vuln",
          affectedRanges: [],
          fixedVersions: []
        };

        // Write to cache
        await setCachedVulnerabilities(tempRoot, "test-pkg", [mockVuln]);

        // Read from cache
        const cached = await getCachedVulnerabilities(tempRoot, "test-pkg");
        assert.ok(cached);
        assert.equal(cached.isFresh, true);
        assert.deepEqual(cached.vulnerabilities, [mockVuln]);

        // Force expiry
        const cachePath = path.join(tempRoot, ".depbrain", "osv-cache", `${encodeURIComponent("test-pkg")}.json`);
        const expiredTime = Date.now() - 25 * 60 * 60 * 1000;
        await fs.utimes(cachePath, new Date(expiredTime), new Date(expiredTime));

        const cachedExpired = await getCachedVulnerabilities(tempRoot, "test-pkg");
        assert.ok(cachedExpired);
        assert.equal(cachedExpired.isFresh, false);

        // Test fallback on offline query
        // getOsvVulnerabilities will try to fetch, fail, and return cached
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => {
          throw new Error("Simulated offline");
        };
        try {
          const results = await getOsvVulnerabilities("test-pkg", {
            rootDir: tempRoot,
            useCache: true
          });
          assert.deepEqual(results, [mockVuln]);
        } finally {
          globalThis.fetch = originalFetch;
        }
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    }
  },
  {
    name: "scan cache saves and uses imports to skip regex parsing",
    run: async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-scancache-"));
      try {
        const file = path.join(tempRoot, "index.js");
        await fs.writeFile(file, "import react from 'react';", "utf8");

        const graph = {
          dependencies: { react: "^18.0.0" },
          devDependencies: {},
          overrides: {},
          scripts: {},
          lockPackages: { react: [{ path: "node_modules/react", version: "18.2.0" }] }
        };

        const fileEntries = [{ path: file, content: "import react from 'react';" }];
        
        // 1. First scan (writes cache)
        const unused = await findUnusedDependencies(tempRoot, graph, fileEntries, { hasTypeScriptConfig: false });
        assert.equal(unused.length, 0); // react is used

        const cache = await loadScanCache(tempRoot);
        const rel = "index.js";
        assert.ok(cache[rel]);
        assert.deepEqual(cache[rel].imports, ["react"]);

        // 2. Second scan (reads cache, we mock different content but same hash in cache to prove it bypassed regex)
        // Set dummy imports in cache to prove it is read
        cache[rel].imports = ["dummy-pkg"];
        const { saveScanCache } = await import("../dist/utils/import-cache.js");
        await saveScanCache(tempRoot, cache);

        const unused2 = await findUnusedDependencies(tempRoot, graph, fileEntries, { hasTypeScriptConfig: false });
        assert.equal(unused2.length, 1); // react is now unused because cache says we imported dummy-pkg!
        assert.equal(unused2[0].name, "react");
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    }
  },
  {
    name: "auditLicenses policy compliance and cache lookup",
    run: async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-licenses-"));
      try {
        await fs.writeFile(
          path.join(tempRoot, "package.json"),
          JSON.stringify({ dependencies: { react: "^18.0.0" } }),
          "utf8"
        );
        await fs.writeFile(
          path.join(tempRoot, "package-lock.json"),
          JSON.stringify({
            name: "fixture",
            lockfileVersion: 3,
            packages: {
              "": { dependencies: { react: "^18.0.0" } },
              "node_modules/react": { version: "18.2.0" }
            }
          }),
          "utf8"
        );

        // Create mock react package.json with license
        const reactDir = path.join(tempRoot, "node_modules", "react");
        await fs.mkdir(reactDir, { recursive: true });
        await fs.writeFile(
          path.join(reactDir, "package.json"),
          JSON.stringify({ name: "react", version: "18.2.0", license: "MIT" }),
          "utf8"
        );

        // 1. Audit check: deny GPL (should pass)
        const res1 = await auditLicenses(tempRoot, { deny: ["GPL"] });
        assert.equal(res1.success, true);
        assert.equal(res1.packages[0].license, "MIT");

        // 2. Audit check: allow only Apache (should fail)
        const res2 = await auditLicenses(tempRoot, { allow: ["Apache"] });
        assert.equal(res2.success, false);
        assert.equal(res2.packages[0].allowed, false);
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    }
  },
  {
    name: "diffBranches extracts git files and computes deltas",
    run: async () => {
      const { execSync } = await import("node:child_process");
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-gitdiff-"));
      try {
        // Init git repo
        execSync("git init", { cwd: tempRoot, stdio: "ignore" });
        execSync("git config user.email \"test@example.com\"", { cwd: tempRoot, stdio: "ignore" });
        execSync("git config user.name \"test\"", { cwd: tempRoot, stdio: "ignore" });

        const pkgJson = {
          name: "fixture",
          version: "1.0.0",
          dependencies: { react: "^17.0.0" }
        };

        const lockJson = {
          name: "fixture",
          lockfileVersion: 3,
          packages: {
            "": { dependencies: { react: "^17.0.0" } },
            "node_modules/react": { version: "17.0.2" }
          }
        };

        // Write base files
        await fs.writeFile(path.join(tempRoot, "package.json"), JSON.stringify(pkgJson, null, 2), "utf8");
        await fs.writeFile(path.join(tempRoot, "package-lock.json"), JSON.stringify(lockJson, null, 2), "utf8");
        execSync("git add package.json package-lock.json", { cwd: tempRoot, stdio: "ignore" });
        execSync("git commit -m \"initial commit\"", { cwd: tempRoot, stdio: "ignore" });
        try {
          execSync("git branch -m main", { cwd: tempRoot, stdio: "ignore" });
        } catch {}

        // Checkout branch and update package.json
        execSync("git checkout -b feature", { cwd: tempRoot, stdio: "ignore" });
        pkgJson.dependencies.react = "^18.2.0";
        lockJson.packages["node_modules/react"].version = "18.2.0";

        await fs.writeFile(path.join(tempRoot, "package.json"), JSON.stringify(pkgJson, null, 2), "utf8");
        await fs.writeFile(path.join(tempRoot, "package-lock.json"), JSON.stringify(lockJson, null, 2), "utf8");
        execSync("git add package.json package-lock.json", { cwd: tempRoot, stdio: "ignore" });
        execSync("git commit -m \"upgrade react\"", { cwd: tempRoot, stdio: "ignore" });

        // Run branch diff (feature branch vs main)
        const diffRes = await diffBranches(tempRoot, "main", "feature");
        assert.equal(diffRes.success, true);
        
        const reactDiff = diffRes.diffs.find((d) => d.name === "react");
        assert.ok(reactDiff);
        assert.equal(reactDiff.changeType, "upgraded");
        assert.deepEqual(reactDiff.baseVersions, ["17.0.2"]);
        assert.deepEqual(reactDiff.headVersions, ["18.2.0"]);
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    }
  },
  {
    name: "exportSbom outputs CycloneDX v1.6 and SPDX v2.3 compliant SBOMs",
    run: async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-sbomexport-"));
      try {
        await fs.writeFile(
          path.join(tempRoot, "package.json"),
          JSON.stringify({ name: "my-app", version: "2.1.0", dependencies: { react: "^18.0.0" } }),
          "utf8"
        );
        await fs.writeFile(
          path.join(tempRoot, "package-lock.json"),
          JSON.stringify({
            name: "my-app",
            lockfileVersion: 3,
            packages: {
              "": { dependencies: { react: "^18.0.0" } },
              "node_modules/react": { version: "18.2.0" }
            }
          }),
          "utf8"
        );

        // 1. CycloneDX Export
        const res1 = await exportSbom(tempRoot, { format: "cyclonedx", outPath: "bom.json" });
        assert.equal(res1.success, true);
        assert.equal(res1.format, "cyclonedx");
        
        const bomRaw = await fs.readFile(path.join(tempRoot, "bom.json"), "utf8");
        const bom = JSON.parse(bomRaw);
        assert.equal(bom.bomFormat, "CycloneDX");
        assert.equal(bom.specVersion, "1.6");
        assert.equal(bom.metadata.component.name, "my-app");
        assert.equal(bom.components[0].name, "react");

        // 2. SPDX Export
        const res2 = await exportSbom(tempRoot, { format: "spdx", outPath: "bom.spdx.json" });
        assert.equal(res2.success, true);
        assert.equal(res2.format, "spdx");

        const spdxRaw = await fs.readFile(path.join(tempRoot, "bom.spdx.json"), "utf8");
        const spdx = JSON.parse(spdxRaw);
        assert.equal(spdx.spdxVersion, "SPDX-2.3");
        assert.equal(spdx.packages[0].name, "my-app");
        assert.equal(spdx.packages[1].name, "react");
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    }
  }
];

let failed = 0;

for (const entry of tests) {
  try {
    await entry.run();
    console.log(`PASS ${entry.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${entry.name}`);
    console.error(error);
  }
}

if (failed > 0) {
  process.exit(1);
} else {
  console.log(`All ${tests.length} tests passed.`);
  process.exit(0);
}
