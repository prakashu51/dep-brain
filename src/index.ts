export { analyzeProject } from "./core/analyzer.js";
export type {
  AnalysisOptions,
  AnalysisResult,
  DuplicateDependency,
  OutdatedDependency,
  PolicyResult,
  PackageAnalysisResult,
  ScoreBreakdown,
  RiskDependency,
  UnusedDependency
} from "./core/analyzer.js";
export { OUTPUT_VERSION } from "./core/analyzer.js";
export type { AnalysisContext, CheckResult, Issue } from "./core/types.js";
export type { DepBrainConfig, DepBrainConfigOverrides } from "./utils/config.js";
export type { WorkspacePackage } from "./utils/workspaces.js";
