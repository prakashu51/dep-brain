import path from "node:path";
import type { UnusedDependency } from "../core/analyzer.js";
import type { DependencyGraph } from "../core/graph-builder.js";
import type { AnalysisContext, CheckResult } from "../core/types.js";

const SOURCE_FILE_PATTERN = /\.(c|m)?(t|j)sx?$/;
const CONFIG_FILE_PATTERN =
  /(^|[\\/])(vite|vitest|jest|eslint|prettier|rollup|webpack|babel|tsup|eslint\.config|commitlint|playwright|storybook|tailwind|postcss)\.config\.(c|m)?(t|j)s$/;
const TEST_FILE_PATTERN = /(^|[\\/])(__tests__|test|tests|spec|specs)([\\/]|$)|\.(test|spec)\.(c|m)?(t|j)sx?$/;
const RUNTIME_DIR_PATTERN = /(^|[\\/])(src|app|lib|server|client|pages|components)([\\/]|$)/;

export async function findUnusedDependencies(
  rootDir: string,
  graph: DependencyGraph,
  fileEntries: { path: string; content: string }[],
  options: { hasTypeScriptConfig: boolean }
): Promise<UnusedDependency[]> {
  const projectFiles = fileEntries
    .map((entry) => entry.path)
    .filter((filePath) => !filePath.includes(`${path.sep}node_modules${path.sep}`));

  const runtimeUsed = new Set<string>();
  const devUsed = new Set<string>();

  for (const entry of fileEntries) {
    if (!SOURCE_FILE_PATTERN.test(entry.path)) {
      continue;
    }
    const imports = extractImportedPackages(entry.content);
    const filePath = entry.path;
    const isDevOnlyFile = isDevelopmentOnlyFile(rootDir, filePath);
    const target = isDevOnlyFile ? devUsed : runtimeUsed;

    for (const importedPackage of imports) {
      target.add(importedPackage);

      if (!isDevOnlyFile) {
        devUsed.add(importedPackage);
      }
    }
  }

  for (const referencedBinary of extractScriptReferences(graph.scripts)) {
    devUsed.add(referencedBinary);
  }

  const hasTypeScriptSources = projectFiles.some((filePath) => /\.(c|m)?tsx?$/.test(filePath));
  if (options.hasTypeScriptConfig) {
    devUsed.add("typescript");
  }

  const unusedDependencies = Object.keys(graph.dependencies)
    .filter((name) => !runtimeUsed.has(name))
    .map((name) => ({ name, section: "dependencies" as const }));

  const unusedDevDependencies = Object.keys(graph.devDependencies)
    .filter((name) => !devUsed.has(name) && !runtimeUsed.has(name))
    .filter((name) =>
      !isImplicitlyUsedDevDependency(
        name,
        hasTypeScriptSources,
        options.hasTypeScriptConfig
      )
    )
    .map((name) => ({ name, section: "devDependencies" as const }));

  return [...unusedDependencies, ...unusedDevDependencies].sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

export async function runUnusedCheck(
  context: AnalysisContext
): Promise<CheckResult> {
  const unused = await findUnusedDependencies(
    context.rootDir,
    context.graph,
    context.fileEntries,
    { hasTypeScriptConfig: context.hasTypeScriptConfig }
  );

  return {
    name: "unused",
    summary: `${unused.length} unused dependencies found`,
    issues: unused.map((item) => ({
      id: `unused:${item.section}:${item.name}`,
      message: `${item.name} appears unused`,
      severity: "warning",
      meta: {
        name: item.name,
        section: item.section
      }
    }))
  };
}

function extractImportedPackages(content: string): Set<string> {
  const imports = new Set<string>();
  const patterns = [
    /\bimport\s+[^"'`]*?from\s+["'`]([^"'`]+)["'`]/g,
    /\bexport\s+[^"'`]*?from\s+["'`]([^"'`]+)["'`]/g,
    /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /\brequire\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /\bimport\s+["'`]([^"'`]+)["'`]/g
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const dependencyName = normalizeModuleSpecifier(match[1]);
      if (dependencyName) {
        imports.add(dependencyName);
      }
    }
  }

  return imports;
}

function normalizeModuleSpecifier(specifier: string): string | null {
  if (
    !specifier ||
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("#")
  ) {
    return null;
  }

  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return scope && name ? `${scope}/${name}` : null;
  }

  return specifier.split("/")[0] ?? null;
}

function isDevelopmentOnlyFile(rootDir: string, filePath: string): boolean {
  const relativePath = path.relative(rootDir, filePath);

  return (
    TEST_FILE_PATTERN.test(relativePath) ||
    CONFIG_FILE_PATTERN.test(relativePath) ||
    (!RUNTIME_DIR_PATTERN.test(relativePath) && relativePath.includes("scripts"))
  );
}

function extractScriptReferences(scripts: Record<string, string>): Set<string> {
  const references = new Set<string>();

  for (const script of Object.values(scripts)) {
    for (const token of script.split(/[^@\w./-]+/).filter(Boolean)) {
      const normalized = normalizeScriptToken(token);
      if (normalized) {
        references.add(normalized);
      }
    }
  }

  return references;
}

function normalizeScriptToken(token: string): string | null {
  if (!token || token.startsWith(".") || token.includes("=") || token.startsWith("node")) {
    return null;
  }

  if (token.startsWith("@")) {
    const scopedMatch = token.match(/^(@[^/]+\/[^/]+)/);
    if (scopedMatch) {
      return scopedMatch[1];
    }
  }

  return token.replace(/\.cmd$/i, "");
}

function isImplicitlyUsedDevDependency(
  name: string,
  hasTypeScriptSources: boolean,
  hasTypeScriptConfig: boolean
): boolean {
  if (name === "typescript" && (hasTypeScriptSources || hasTypeScriptConfig)) {
    return true;
  }

  if (name.startsWith("@types/") && hasTypeScriptSources) {
    return true;
  }

  return false;
}
