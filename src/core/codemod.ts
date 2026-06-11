import { promises as fs } from "node:fs";
import { collectProjectFiles } from "../utils/file-parser.js";

export interface CodemodOptions {
  rootDir: string;
  packageNames: string[];
  excludePaths?: string[];
  cleanSideEffects?: boolean;
  onBeforeModify?: (filePath: string) => Promise<void>;
}

export interface CodemodResult {
  filesModified: string[];
}

export async function cleanUnusedImports(
  options: CodemodOptions
): Promise<CodemodResult> {
  const { rootDir, packageNames, excludePaths = [], cleanSideEffects = true, onBeforeModify } = options;
  if (packageNames.length === 0) {
    return { filesModified: [] };
  }

  const filePattern = /\.(c|m)?(t|j)sx?$/;
  const files = await collectProjectFiles(rootDir, filePattern, excludePaths);

  const filesModified: string[] = [];

  for (const file of files) {
    let content = await fs.readFile(file, "utf8");
    const original = content;

    for (const pkg of packageNames) {
      const escapedPkg = pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // 1. ESM Imports (handles single-line and multi-line)
      const importRegex = new RegExp(
        `\\bimport\\b[\\s\\S]*?\\bfrom\\b\\s*['"]${escapedPkg}['"]\\s*;?\\r?\\n?`,
        "g"
      );
      content = content.replace(importRegex, "");

      // 2. CommonJS Requires
      const requireRegex = new RegExp(
        `\\b(?:const|let|var)\\b[\\s\\S]*?=\\s*require\\s*\\(\\s*['"]${escapedPkg}['"]\\s*\\)\\s*;?\\r?\\n?`,
        "g"
      );
      content = content.replace(requireRegex, "");

      // 3. Side-effect-only imports
      if (cleanSideEffects) {
        const sideEffectRegex = new RegExp(
          `\\bimport\\b\\s*['"]${escapedPkg}['"]\\s*;?\\r?\\n?`,
          "g"
        );
        content = content.replace(sideEffectRegex, "");
      }
    }

    if (content !== original) {
      if (onBeforeModify) {
        await onBeforeModify(file);
      }
      await fs.writeFile(file, content, "utf8");
      filesModified.push(file);
    }
  }

  return { filesModified };
}
