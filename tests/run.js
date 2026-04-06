import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findDuplicateDependencies } from "../dist/checks/duplicate.js";
import { findOutdatedDependencies } from "../dist/checks/outdated.js";
import { findUnusedDependencies } from "../dist/checks/unused.js";
import { buildDependencyGraph } from "../dist/core/graph-builder.js";
import { calculateHealthScore } from "../dist/core/scorer.js";

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
