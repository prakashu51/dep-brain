import { promises as fs } from "node:fs";
import path from "node:path";
import { isWithinRoot } from "./path.js";

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

export async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export async function collectProjectFiles(
  rootDir: string,
  pattern: RegExp,
  excludePaths: string[] = []
): Promise<string[]> {
  return collectProjectFilesInternal(rootDir, rootDir, pattern, excludePaths);
}

async function collectProjectFilesInternal(
  currentDir: string,
  baseDir: string,
  pattern: RegExp,
  excludePaths: string[]
): Promise<string[]> {
  if (!isWithinRoot(baseDir, currentDir)) {
    return [];
  }

  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relPath = path.relative(baseDir, fullPath);

    if (matchesAnyPattern(relPath, excludePaths)) {
      continue;
    }

    if (entry.isDirectory()) {
      if (entry.name === ".git") {
        continue;
      }

      files.push(
        ...(await collectProjectFilesInternal(
          fullPath,
          baseDir,
          pattern,
          excludePaths
        ))
      );
      continue;
    }

    if (pattern.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function matchesAnyPattern(value: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return false;
  }

  const normalized = normalizePath(value);

  return patterns.some((pattern) => {
    const regex = globToRegExp(pattern);
    return regex.test(normalized);
  });
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePath(pattern)
    .replace(/\/+$/, "")
    .replace(/^\//, "")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "___DEPBRAIN_GLOBSTAR___")
    .replace(/\*/g, "[^/]*")
    .replace(/___DEPBRAIN_GLOBSTAR___/g, ".*");

  return new RegExp(`(^|.*/)${normalized}($|/.*)`);
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}
