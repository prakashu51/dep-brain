import path from "node:path";
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
    return {
      rootDir,
      packageJsonPath,
      dependencies: packageJson.dependencies ?? {},
      devDependencies: packageJson.devDependencies ?? {},
      scripts: packageJson.scripts ?? {},
      lockPackages: {}
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
