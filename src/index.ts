export { analyzeProject } from "./core/analyzer.js";
export type {
  AnalysisOptions,
  AnalysisFocus,
  AnalysisResult,
  DepBrainBaseline,
  DuplicateDependency,
  OutdatedDependency,
  PolicyResult,
  PackageAnalysisResult,
  Recommendation,
  RiskFactors,
  RiskTransitiveDependency,
  ScoreBreakdown,
  RiskDependency,
  TopIssue,
  TrustScore,
  UnusedDependency,
  WorkspaceDependencyUsage,
  WorkspaceOwnershipSummary
} from "./core/analyzer.js";
export { OUTPUT_VERSION } from "./core/analyzer.js";
export { PluginManager } from "./core/plugin-manager.js";
export type { DepBrainPlugin, PluginDiagnostic, ProjectContext } from "./core/plugin-manager.js";
export type { AnalysisContext, CheckResult, Issue } from "./core/types.js";
export type { DepBrainConfig, DepBrainConfigOverrides } from "./utils/config.js";
export {
  renderNotificationMessage,
  sendConfiguredNotifications,
  shouldSendNotification
} from "./utils/notifications.js";
export type {
  NotificationChannel,
  NotificationResult,
  NotificationSendInput,
  NotificationSender
} from "./utils/notifications.js";
export type { WorkspacePackage } from "./utils/workspaces.js";
