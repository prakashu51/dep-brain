import { promises as fs } from "node:fs";
import path from "node:path";
import { readJsonFile } from "./file-parser.js";

export interface WorkspacePackage {
  name: string;
  rootDir: string;
  packageJsonPath: string;
}

export async function findWorkspacePackages(
  rootDir: string
): Promise<WorkspacePackage[]> {
  const rootPackageJsonPath = path.join(rootDir, "package.json");
  const rootPackage = await readJsonFile<{
    workspaces?: string[] | { packages?: string[] };
  }>(rootPackageJsonPath).catch(() => null);

  if (!rootPackage?.workspaces) {
    return [];
  }

  const patterns = Array.isArray(rootPackage.workspaces)
    ? rootPackage.workspaces
    : rootPackage.workspaces.packages ?? [];

  if (patterns.length === 0) {
    return [];
  }

  const packageJsonFiles = await collectPackageJsonFiles(rootDir);
  const matches = packageJsonFiles.filter((filePath) =>
    matchesWorkspacePatterns(rootDir, filePath, patterns)
  );

  const packages: WorkspacePackage[] = [];
  for (const packageJsonPath of matches) {
    const pkg = await readJsonFile<{ name?: string }>(packageJsonPath).catch(
      () => null
    );
    if (!pkg?.name) {
      continue;
    }
    packages.push({
      name: pkg.name,
      rootDir: path.dirname(packageJsonPath),
      packageJsonPath
    });
  }

  return packages.sort((left, right) => left.name.localeCompare(right.name));
}

async function collectPackageJsonFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }

    const fullPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectPackageJsonFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name === "package.json") {
      files.push(fullPath);
    }
  }

  return files;
}

function matchesWorkspacePatterns(
  rootDir: string,
  packageJsonPath: string,
  patterns: string[]
): boolean {
  const rel = normalizePath(path.relative(rootDir, path.dirname(packageJsonPath)));

  return patterns.some((pattern) => {
    const regex = globToRegExp(pattern);
    return regex.test(rel);
  });
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePath(pattern)
    .replace(/\/+$/, "")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "___DEPBRAIN_GLOBSTAR___")
    .replace(/\*/g, "[^/]*")
    .replace(/___DEPBRAIN_GLOBSTAR___/g, ".*");

  return new RegExp(`^${normalized}$`);
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}
