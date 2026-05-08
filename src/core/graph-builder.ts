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
  overrides: Record<string, unknown>;
  scripts: Record<string, string>;
  lockPackages: Record<string, LockPackageInstance[]>;
  lockDependencies: Record<string, string[]>;
}

interface LockfileReadResult {
  lockfilePath?: string;
  lockPackages: Record<string, LockPackageInstance[]>;
  lockDependencies: Record<string, string[]>;
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
    overrides?: Record<string, unknown>;
    scripts?: Record<string, string>;
  }>(packageJsonPath);

  try {
    const packageLock = await readJsonFile<{
      packages?: Record<string, {
        version?: string;
        name?: string;
        dependencies?: Record<string, string>;
      }>;
      dependencies?: Record<string, { version?: string; requires?: Record<string, string> }>;
    }>(lockfilePath);

    const parsed = parseNpmLockfile(packageLock, {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    });

    return {
      rootDir,
      packageJsonPath,
      lockfilePath,
      dependencies: packageJson.dependencies ?? {},
      devDependencies: packageJson.devDependencies ?? {},
      overrides: packageJson.overrides ?? {},
      scripts: packageJson.scripts ?? {},
      lockPackages: parsed.lockPackages,
      lockDependencies: parsed.lockDependencies
    };
  } catch {
    const fallbackLockfile = await readAlternativeLockfile(
      pnpmLockfilePath,
      yarnLockfilePath,
      {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      }
    );

    return {
      rootDir,
      packageJsonPath,
      lockfilePath: fallbackLockfile.lockfilePath,
      dependencies: packageJson.dependencies ?? {},
      devDependencies: packageJson.devDependencies ?? {},
      overrides: packageJson.overrides ?? {},
      scripts: packageJson.scripts ?? {},
      lockPackages: fallbackLockfile.lockPackages,
      lockDependencies: fallbackLockfile.lockDependencies
    };
  }
}

async function readAlternativeLockfile(
  pnpmLockfilePath: string,
  yarnLockfilePath: string,
  rootDependencies: Record<string, string>
): Promise<LockfileReadResult> {
  try {
    const content = await fs.readFile(pnpmLockfilePath, "utf8");
    const parsed = parsePnpmLockfile(content, rootDependencies);
    return {
      lockfilePath: pnpmLockfilePath,
      lockPackages: parsed.lockPackages,
      lockDependencies: parsed.lockDependencies
    };
  } catch {
    // Try yarn.lock below.
  }

  try {
    const content = await fs.readFile(yarnLockfilePath, "utf8");
    const parsed = parseYarnLockfile(content, rootDependencies);
    return {
      lockfilePath: yarnLockfilePath,
      lockPackages: parsed.lockPackages,
      lockDependencies: parsed.lockDependencies
    };
  } catch {
    return {
      lockPackages: {},
      lockDependencies: {}
    };
  }
}

function parseNpmLockfile(
  packageLock: {
    packages?: Record<string, {
      version?: string;
      name?: string;
      dependencies?: Record<string, string>;
    }>;
    dependencies?: Record<string, { version?: string; requires?: Record<string, string> }>;
  },
  rootDependencies: Record<string, string>
): LockfileReadResult {
  const lockPackages = new Map<string, Map<string, LockPackageInstance>>();
  const lockDependencies = new Map<string, Set<string>>();

  for (const [packagePath, details] of Object.entries(packageLock.packages ?? {})) {
    const name = details.name ?? extractPackageName(packagePath);
    const version = details.version;

    if (name && version) {
      const instances = lockPackages.get(name) ?? new Map<string, LockPackageInstance>();
      const normalizedPath = packagePath || "node_modules/" + name;
      instances.set(normalizedPath, { path: normalizedPath, version });
      lockPackages.set(name, instances);
    }

    if (name) {
      addDependencyNames(lockDependencies, name, Object.keys(details.dependencies ?? {}));
    }
  }

  for (const [name, details] of Object.entries(packageLock.dependencies ?? {})) {
    if (details.version) {
      const instances = lockPackages.get(name) ?? new Map<string, LockPackageInstance>();
      const normalizedPath = `node_modules/${name}`;
      instances.set(normalizedPath, { path: normalizedPath, version: details.version });
      lockPackages.set(name, instances);
    }

    addDependencyNames(lockDependencies, name, Object.keys(details.requires ?? {}));
  }

  addDependencyNames(lockDependencies, "__root__", Object.keys(rootDependencies));

  return {
    lockPackages: toLockPackageRecord(lockPackages),
    lockDependencies: toDependencyRecord(lockDependencies)
  };
}

function parsePnpmLockfile(
  content: string,
  rootDependencies: Record<string, string>
): LockfileReadResult {
  const lockPackages = new Map<string, Map<string, LockPackageInstance>>();
  const lockDependencies = new Map<string, Set<string>>();
  const lines = content.split(/\r?\n/);
  let currentName: string | null = null;
  let currentVersion: string | null = null;
  let inDependenciesBlock = false;

  for (const line of lines) {
    const packageMatch = line.match(/^\s{2}(?:'|")?\/((?:@[^/]+\/)?[^/@'"]+)@([^('":]+)[^:]*:(?:'|")?\s*$/);
    if (packageMatch) {
      currentName = packageMatch[1];
      currentVersion = packageMatch[2];
      inDependenciesBlock = false;
      addLockPackage(
        lockPackages,
        currentName,
        `pnpm:${currentName}@${currentVersion}`,
        currentVersion
      );
      continue;
    }

    if (!currentName) {
      continue;
    }

    if (/^\s{4}(?:dependencies|optionalDependencies):\s*$/.test(line)) {
      inDependenciesBlock = true;
      continue;
    }

    if (/^\s{4}\S/.test(line) && !/^\s{4}(?:dependencies|optionalDependencies):\s*$/.test(line)) {
      inDependenciesBlock = false;
    }

    if (!inDependenciesBlock) {
      continue;
    }

    const dependencyMatch = line.match(/^\s{6}((?:@[^/]+\/)?[^:\s]+):\s*(.+)?$/);
    if (!dependencyMatch) {
      continue;
    }

    addDependencyNames(lockDependencies, currentName, [dependencyMatch[1]]);
  }

  addDependencyNames(lockDependencies, "__root__", Object.keys(rootDependencies));

  return {
    lockPackages: toLockPackageRecord(lockPackages),
    lockDependencies: toDependencyRecord(lockDependencies)
  };
}

function parseYarnLockfile(
  content: string,
  rootDependencies: Record<string, string>
): LockfileReadResult {
  const lockPackages = new Map<string, Map<string, LockPackageInstance>>();
  const lockDependencies = new Map<string, Set<string>>();
  const lines = content.split(/\r?\n/);
  let currentNames: string[] = [];
  let currentVersion: string | null = null;
  let inDependenciesBlock = false;

  for (const line of lines) {
    if (line.trim().length === 0 || line.startsWith("#")) {
      continue;
    }

    if (!line.startsWith(" ") && line.endsWith(":")) {
      currentNames = extractYarnEntryNames(line.slice(0, -1));
      currentVersion = null;
      inDependenciesBlock = false;
      continue;
    }

    const versionMatch = line.match(/^\s+version\s+"?([^"\s]+)"?\s*$/);
    if (versionMatch) {
      currentVersion = versionMatch[1];
      for (const name of currentNames) {
        addLockPackage(lockPackages, name, `yarn:${name}@${currentVersion}`, currentVersion);
      }
      continue;
    }

    if (/^\s{2}dependencies:\s*$/.test(line)) {
      inDependenciesBlock = true;
      continue;
    }

    if (/^\s{2}\S/.test(line) && !/^\s{2}dependencies:\s*$/.test(line)) {
      inDependenciesBlock = false;
    }

    if (!inDependenciesBlock) {
      continue;
    }

    const dependencyMatch = line.match(/^\s{4}((?:@[^/]+\/)?[^"\s]+)\s+/);
    if (!dependencyMatch) {
      continue;
    }

    for (const name of currentNames) {
      addDependencyNames(lockDependencies, name, [dependencyMatch[1]]);
    }
  }

  addDependencyNames(lockDependencies, "__root__", Object.keys(rootDependencies));

  return {
    lockPackages: toLockPackageRecord(lockPackages),
    lockDependencies: toDependencyRecord(lockDependencies)
  };
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

function addDependencyNames(
  lockDependencies: Map<string, Set<string>>,
  name: string,
  dependencies: string[]
): void {
  if (dependencies.length === 0) {
    return;
  }

  const entry = lockDependencies.get(name) ?? new Set<string>();
  for (const dependency of dependencies) {
    entry.add(dependency);
  }
  lockDependencies.set(name, entry);
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

function toDependencyRecord(
  lockDependencies: Map<string, Set<string>>
): Record<string, string[]> {
  return Object.fromEntries(
    Array.from(lockDependencies.entries()).map(([name, dependencies]) => [
      name,
      Array.from(dependencies).sort((left, right) => left.localeCompare(right))
    ])
  );
}
