export { analyzeProject } from "./core/analyzer.js";
export {
  applyFixPlan,
  isGitWorktreeDirty,
  renderFixApplyResult
} from "./core/fix-apply.js";
export {
  buildUnusedFixPlan,
  detectPackageManager,
  renderFixPlan
} from "./core/fix-plan.js";
export type {
  AnalysisOptions,
  AnalysisFocus,
  AnalysisResult,
  DepBrainBaseline,
  DuplicateDependency,
  NewFindingsSummary,
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
  VulnerabilityRisk,
  WorkspaceDependencyUsage,
  WorkspaceOwnershipSummary
} from "./core/analyzer.js";
export { OUTPUT_VERSION } from "./core/analyzer.js";
export { PluginManager } from "./core/plugin-manager.js";
export type { DepBrainPlugin, PluginDiagnostic, ProjectContext } from "./core/plugin-manager.js";
export type { AnalysisContext, CheckResult, Issue } from "./core/types.js";
export type {
  CommandResult,
  CommandRunner,
  FixApplyOptions,
  FixApplyResult
} from "./core/fix-apply.js";
export type {
  FixPlan,
  FixPlanItem,
  FixPlanOptions,
  PackageManager,
  SkippedFixItem
} from "./core/fix-plan.js";
export type { DepBrainConfig, DepBrainConfigOverrides } from "./utils/config.js";
export { getOsvVulnerabilities } from "./utils/osv.js";
export type { OsvSeverity, OsvVulnerability } from "./utils/osv.js";
export {
  renderNotificationMessage,
  sendConfiguredNotifications,
  shouldSendNotification
} from "./utils/notifications.js";
export {
  shouldPostPrComment,
  upsertGitHubPrComment
} from "./utils/github.js";
export {
  PR_COMMENT_MARKER,
  renderPrCommentReport
} from "./reporters/pr-comment.js";
export type {
  NotificationChannel,
  NotificationResult,
  NotificationSendInput,
  NotificationSender
} from "./utils/notifications.js";
export type {
  GitHubPrCommentInput,
  GitHubPrCommentResult,
  GitHubRequest,
  PrCommentTrigger
} from "./utils/github.js";
export type { WorkspacePackage } from "./utils/workspaces.js";
