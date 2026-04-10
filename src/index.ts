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
export type { DepBrainConfig, DepBrainConfigOverrides } from "./utils/config.js";
export type { WorkspacePackage } from "./utils/workspaces.js";
