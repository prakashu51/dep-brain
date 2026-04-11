import path from "node:path";

export function resolveWithinRoot(rootDir: string, targetPath: string): string {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(resolvedRoot, targetPath);

  if (!isWithinRoot(resolvedRoot, resolvedTarget)) {
    throw new Error(`Path is خارج root: ${resolvedTarget}`);
  }

  return resolvedTarget;
}

export function isWithinRoot(rootDir: string, targetPath: string): boolean {
  const relative = path.relative(rootDir, targetPath);
  if (!relative || relative === ".") {
    return true;
  }

  return !relative.startsWith("..") && !path.isAbsolute(relative);
}
