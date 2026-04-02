import path from "node:path";
import { readJsonFile } from "../utils/file-parser.js";

export interface DependencyGraph {
  rootDir: string;
  packageJsonPath: string;
  lockfilePath?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  lockPackages: Record<string, Set<string>>;
}

export async function buildDependencyGraph(
  rootDir: string
): Promise<DependencyGraph> {
  const packageJsonPath = path.join(rootDir, "package.json");
  const lockfilePath = path.join(rootDir, "package-lock.json");

  const packageJson = await readJsonFile<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(packageJsonPath);

  const lockPackages = new Map<string, Set<string>>();

  try {
    const packageLock = await readJsonFile<{
      packages?: Record<string, { version?: string; name?: string }>;
      dependencies?: Record<string, { version?: string }>;
    }>(lockfilePath);

    for (const [packagePath, details] of Object.entries(
      packageLock.packages ?? {}
    )) {
      if (!packagePath.startsWith("node_modules/")) {
        continue;
      }

      const name = packagePath.replace(/^node_modules\//, "");
      const version = details.version;

      if (!version) {
        continue;
      }

      const versions = lockPackages.get(name) ?? new Set<string>();
      versions.add(version);
      lockPackages.set(name, versions);
    }

    for (const [name, details] of Object.entries(packageLock.dependencies ?? {})) {
      if (!details.version) {
        continue;
      }

      const versions = lockPackages.get(name) ?? new Set<string>();
      versions.add(details.version);
      lockPackages.set(name, versions);
    }
  } catch {
    return {
      rootDir,
      packageJsonPath,
      dependencies: packageJson.dependencies ?? {},
      devDependencies: packageJson.devDependencies ?? {},
      lockPackages: {}
    };
  }

  return {
    rootDir,
    packageJsonPath,
    lockfilePath,
    dependencies: packageJson.dependencies ?? {},
    devDependencies: packageJson.devDependencies ?? {},
    lockPackages: Object.fromEntries(lockPackages)
  };
}
