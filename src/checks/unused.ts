import path from "node:path";
import type { UnusedDependency } from "../core/analyzer.js";
import type { DependencyGraph } from "../core/graph-builder.js";
import { collectProjectFiles, readTextFile } from "../utils/file-parser.js";

const SOURCE_FILE_PATTERN = /\.(c|m)?(t|j)sx?$/;

export async function findUnusedDependencies(
  rootDir: string,
  graph: DependencyGraph
): Promise<UnusedDependency[]> {
  const files = await collectProjectFiles(rootDir, SOURCE_FILE_PATTERN);
  const projectSources = await Promise.all(
    files
      .filter((filePath) => !filePath.includes(`${path.sep}node_modules${path.sep}`))
      .map((filePath) => readTextFile(filePath))
  );

  const sourceText = projectSources.join("\n");
  const dependencyNames = Object.keys({
    ...graph.dependencies,
    ...graph.devDependencies
  });

  const unused = dependencyNames.filter((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`from\\s+["'\`]${escaped}(["'\`/])`),
      new RegExp(`require\\(\\s*["'\`]${escaped}(["'\`/])`),
      new RegExp(`import\\s+["'\`]${escaped}(["'\`/])`)
    ];

    return !patterns.some((pattern) => pattern.test(sourceText));
  });

  return unused
    .map((name) => ({ name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
