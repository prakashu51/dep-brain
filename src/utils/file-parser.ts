import { promises as fs } from "node:fs";
import path from "node:path";

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

export async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export async function collectProjectFiles(
  rootDir: string,
  pattern: RegExp
): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === ".git") {
        continue;
      }

      files.push(...(await collectProjectFiles(fullPath, pattern)));
      continue;
    }

    if (pattern.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}
