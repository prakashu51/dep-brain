import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findDuplicateDependencies } from "../dist/checks/duplicate.js";
import { findOutdatedDependencies } from "../dist/checks/outdated.js";
import { findRiskDependencies } from "../dist/checks/risk.js";
import { findUnusedDependencies } from "../dist/checks/unused.js";
import { analyzeProject } from "../dist/core/analyzer.js";
import { buildDependencyGraph } from "../dist/core/graph-builder.js";
import { calculateHealthScore } from "../dist/core/scorer.js";
import { loadDepBrainConfig } from "../dist/utils/config.js";
import { renderConsoleReport } from "../dist/reporters/console.js";
import { renderJsonReport } from "../dist/reporters/json.js";
import { renderMarkdownReport } from "../dist/reporters/markdown.js";
import { collectProjectFiles } from "../dist/utils/file-parser.js";
import { buildAnalysisContext } from "../dist/core/context.js";
import { defaultConfig } from "../dist/utils/config.js";

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
      assert.ok(risks[0]?.reasonCodes.includes("stale_release"));
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
    name: "console report is non-empty",
    run: async () => {
      const report = renderConsoleReport({
        outputVersion: "1.3",
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
        outputVersion: "1.3",
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
    name: "markdown report is non-empty",
    run: async () => {
      const report = renderMarkdownReport({
        outputVersion: "1.3",
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
  process.exitCode = 1;
} else {
  console.log(`All ${tests.length} tests passed.`);
}
