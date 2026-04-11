import path from "node:path";
import { buildDependencyGraph } from "./graph-builder.js";
import { collectProjectFiles, readTextFile } from "../utils/file-parser.js";
import { resolveWithinRoot } from "../utils/path.js";

import type { AnalysisContext } from "./types.js";
import type { DepBrainConfig } from "../utils/config.js";

const SOURCE_FILE_PATTERN = /\.(c|m)?(t|j)sx?$/;

export async function buildAnalysisContext(
  rootDir: string,
  config: DepBrainConfig
): Promise<AnalysisContext> {
  const resolvedRoot = path.resolve(rootDir);
  const graph = await buildDependencyGraph(resolvedRoot);
  const projectFiles = await collectProjectFiles(
    resolvedRoot,
    SOURCE_FILE_PATTERN,
    config.scan.excludePaths
  );
  const fileEntries = await Promise.all(
    projectFiles.map(async (filePath) => ({
      path: filePath,
      content: await readTextFile(filePath)
    }))
  );
  const sourceText = fileEntries.map((entry) => entry.content).join("\n");
  const hasTypeScriptConfig = await hasFile(resolvedRoot, "tsconfig.json");

  return {
    rootDir: resolvedRoot,
    graph,
    sourceText,
    projectFiles,
    fileEntries,
    hasTypeScriptConfig
  };
}

async function hasFile(rootDir: string, fileName: string): Promise<boolean> {
  try {
    const resolved = resolveWithinRoot(rootDir, fileName);
    await readTextFile(resolved);
    return true;
  } catch {
    return false;
  }
}
