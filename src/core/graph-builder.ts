import path from "node:path";
import { promises as fs } from "node:fs";
import { readJsonFile } from "../utils/file-parser.js";

export interface LockPackageInstance {
  path: string;
  version: string;
}

export interface DependencyGraph {
  rootDir: string;
  packageJsonPath: string;
  lockfilePath?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  lockPackages: Record<string, LockPackageInstance[]>;
}

export async function buildDependencyGraph(
  rootDir: string
): Promise<DependencyGraph> {
  const packageJsonPath = path.join(rootDir, "package.json");
  const lockfilePath = path.join(rootDir, "package-lock.json");
  const pnpmLockfilePath = path.join(rootDir, "pnpm-lock.yaml");
  const yarnLockfilePath = path.join(rootDir, "yarn.lock");

  const packageJson = await readJsonFile<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  }>(packageJsonPath);

  const lockPackages = new Map<string, Map<string, LockPackageInstance>>();

  try {
    const packageLock = await readJsonFile<{
      packages?: Record<string, { version?: string; name?: string }>;
      dependencies?: Record<string, { version?: string }>;
    }>(lockfilePath);

    for (const [packagePath, details] of Object.entries(
      packageLock.packages ?? {}
    )) {
      const name = extractPackageName(packagePath);
      const version = details.version;

      if (!name || !version) {
        continue;
      }

      const instances = lockPackages.get(name) ?? new Map<string, LockPackageInstance>();
      const normalizedPath = packagePath || "node_modules/" + name;
      instances.set(normalizedPath, { path: normalizedPath, version });
      lockPackages.set(name, instances);
    }

    for (const [name, details] of Object.entries(packageLock.dependencies ?? {})) {
      if (!details.version) {
        continue;
      }

      const instances = lockPackages.get(name) ?? new Map<string, LockPackageInstance>();
      const normalizedPath = `node_modules/${name}`;
      instances.set(normalizedPath, { path: normalizedPath, version: details.version });
      lockPackages.set(name, instances);
    }
  } catch {
    const fallbackLockfile = await readAlternativeLockfile(
      pnpmLockfilePath,
      yarnLockfilePath
    );
    return {
      rootDir,
      packageJsonPath,
      lockfilePath: fallbackLockfile.lockfilePath,
      dependencies: packageJson.dependencies ?? {},
      devDependencies: packageJson.devDependencies ?? {},
      scripts: packageJson.scripts ?? {},
      lockPackages: fallbackLockfile.lockPackages
    };
  }

  return {
    rootDir,
    packageJsonPath,
    lockfilePath,
    dependencies: packageJson.dependencies ?? {},
    devDependencies: packageJson.devDependencies ?? {},
    scripts: packageJson.scripts ?? {},
    lockPackages: Object.fromEntries(
      Array.from(lockPackages.entries()).map(([name, instances]) => [
        name,
        Array.from(instances.values()).sort((left, right) =>
          left.path.localeCompare(right.path)
        )
      ])
    )
  };
}

async function readAlternativeLockfile(
  pnpmLockfilePath: string,
  yarnLockfilePath: string
): Promise<{
  lockfilePath?: string;
  lockPackages: Record<string, LockPackageInstance[]>;
}> {
  try {
    const content = await fs.readFile(pnpmLockfilePath, "utf8");
    return {
      lockfilePath: pnpmLockfilePath,
      lockPackages: parsePnpmLockfile(content)
    };
  } catch {
    // Try yarn.lock below.
  }

  try {
    const content = await fs.readFile(yarnLockfilePath, "utf8");
    return {
      lockfilePath: yarnLockfilePath,
      lockPackages: parseYarnLockfile(content)
    };
  } catch {
    return {
      lockPackages: {}
    };
  }
}

function extractPackageName(packagePath: string): string | null {
  if (!packagePath) {
    return null;
  }

  const match = packagePath.match(/(?:^|\/)node_modules\/(.+)$/);

  if (!match) {
    return null;
  }

  return match[1];
}

function parsePnpmLockfile(content: string): Record<string, LockPackageInstance[]> {
  const lockPackages = new Map<string, Map<string, LockPackageInstance>>();

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s{2}(?:'|")?\/((?:@[^/]+\/)?[^/@'"]+)@([^('":]+)[^:]*:(?:'|")?\s*$/);
    if (!match) {
      continue;
    }

    addLockPackage(lockPackages, match[1], `pnpm-lock:${match[0].trim()}`, match[2]);
  }

  return toLockPackageRecord(lockPackages);
}

function parseYarnLockfile(content: string): Record<string, LockPackageInstance[]> {
  const lockPackages = new Map<string, Map<string, LockPackageInstance>>();
  let currentNames: string[] = [];

  for (const line of content.split(/\r?\n/)) {
    if (line.trim().length === 0 || line.startsWith("#")) {
      continue;
    }

    if (!line.startsWith(" ") && line.endsWith(":")) {
      currentNames = extractYarnEntryNames(line.slice(0, -1));
      continue;
    }

    const versionMatch = line.match(/^\s+version\s+"?([^"\s]+)"?\s*$/);
    if (!versionMatch) {
      continue;
    }

    for (const name of currentNames) {
      addLockPackage(lockPackages, name, `yarn-lock:${name}@${versionMatch[1]}`, versionMatch[1]);
    }
  }

  return toLockPackageRecord(lockPackages);
}

function extractYarnEntryNames(entry: string): string[] {
  const names = new Set<string>();
  const unquoted = entry.replace(/^["']|["']$/g, "");

  for (const selector of unquoted.split(/,\s*/)) {
    const normalized = selector.replace(/^["']|["']$/g, "");
    const withoutProtocol = normalized.replace(/@npm:/, "@");
    if (withoutProtocol.startsWith("@")) {
      const scoped = withoutProtocol.match(/^(@[^/]+\/[^@]+)/);
      if (scoped) {
        names.add(scoped[1]);
      }
      continue;
    }

    const unscoped = withoutProtocol.match(/^([^@]+)/);
    if (unscoped?.[1]) {
      names.add(unscoped[1]);
    }
  }

  return Array.from(names);
}

function addLockPackage(
  lockPackages: Map<string, Map<string, LockPackageInstance>>,
  name: string,
  packagePath: string,
  version: string
): void {
  const instances = lockPackages.get(name) ?? new Map<string, LockPackageInstance>();
  instances.set(packagePath, { path: packagePath, version });
  lockPackages.set(name, instances);
}

function toLockPackageRecord(
  lockPackages: Map<string, Map<string, LockPackageInstance>>
): Record<string, LockPackageInstance[]> {
  return Object.fromEntries(
    Array.from(lockPackages.entries()).map(([name, instances]) => [
      name,
      Array.from(instances.values()).sort((left, right) =>
        left.path.localeCompare(right.path)
      )
    ])
  );
}
