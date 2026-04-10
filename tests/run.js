import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findDuplicateDependencies } from "../dist/checks/duplicate.js";
import { findOutdatedDependencies } from "../dist/checks/outdated.js";
import { findUnusedDependencies } from "../dist/checks/unused.js";
import { analyzeProject } from "../dist/core/analyzer.js";
import { buildDependencyGraph } from "../dist/core/graph-builder.js";
import { calculateHealthScore } from "../dist/core/scorer.js";
import { loadDepBrainConfig } from "../dist/utils/config.js";
import { renderConsoleReport } from "../dist/reporters/console.js";
import { renderJsonReport } from "../dist/reporters/json.js";
import { renderMarkdownReport } from "../dist/reporters/markdown.js";

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
    name: "unused detection respects scripts and TypeScript helpers",
    run: async () => {
      const fixtureRoot = path.join(__dirname, "fixtures", "unused-project");
      const graph = await buildDependencyGraph(fixtureRoot);
      const unused = await findUnusedDependencies(fixtureRoot, graph);

      assert.deepEqual(unused, [
        { name: "unused-dev-tool", section: "devDependencies" },
        { name: "unused-lib", section: "dependencies" }
      ]);
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
    name: "console report is non-empty",
    run: async () => {
      const report = renderConsoleReport({
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
        config: {
          ignore: {
            dependencies: [],
            devDependencies: [],
            duplicates: [],
            outdated: [],
            risks: [],
            unused: []
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
        config: {
          ignore: {
            dependencies: [],
            devDependencies: [],
            duplicates: [],
            outdated: [],
            risks: [],
            unused: []
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
        config: {
          ignore: {
            dependencies: [],
            devDependencies: [],
            duplicates: [],
            outdated: [],
            risks: [],
            unused: []
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
          }
        }
      });

      assert.ok(report.trim().length > 0);
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
