import path from "node:path";
import { findDuplicateDependencies } from "../checks/duplicate.js";
import { findOutdatedDependencies } from "../checks/outdated.js";
import { findRiskDependencies } from "../checks/risk.js";
import { findUnusedDependencies } from "../checks/unused.js";
import { buildDependencyGraph } from "./graph-builder.js";
import { calculateHealthScore } from "./scorer.js";

export interface AnalysisOptions {
  rootDir?: string;
}

export interface DuplicateDependency {
  name: string;
  versions: string[];
}

export interface UnusedDependency {
  name: string;
}

export interface OutdatedDependency {
  name: string;
  current: string;
  latest: string;
}

export interface RiskDependency {
  name: string;
  reasons: string[];
}

export interface AnalysisResult {
  rootDir: string;
  score: number;
  duplicates: DuplicateDependency[];
  unused: UnusedDependency[];
  outdated: OutdatedDependency[];
  risks: RiskDependency[];
  suggestions: string[];
}

export async function analyzeProject(
  options: AnalysisOptions = {}
): Promise<AnalysisResult> {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const graph = await buildDependencyGraph(rootDir);

  const [duplicates, unused, outdated, risks] = await Promise.all([
    findDuplicateDependencies(graph),
    findUnusedDependencies(rootDir, graph),
    findOutdatedDependencies(graph),
    findRiskDependencies(graph)
  ]);

  const score = calculateHealthScore({
    duplicates: duplicates.length,
    unused: unused.length,
    outdated: outdated.length,
    risks: risks.length
  });

  const suggestions = [
    ...unused.map((item) => `Remove ${item.name} (unused)`),
    ...duplicates.map(
      (item) => `Consider consolidating ${item.name} to one version`
    ),
    ...outdated.map(
      (item) => `Review ${item.name}: ${item.current} -> ${item.latest}`
    )
  ].slice(0, 5);

  return {
    rootDir,
    score,
    duplicates,
    unused,
    outdated,
    risks,
    suggestions
  };
}
