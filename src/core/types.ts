export type IssueSeverity = "info" | "warning" | "critical";

export type Issue = {
  id: string;
  message: string;
  package?: string;
  severity: IssueSeverity;
  meta?: Record<string, unknown>;
};

export type CheckResult = {
  name: string;
  issues: Issue[];
  summary: string;
};

export type AnalysisContext = {
  rootDir: string;
  graph: import("./graph-builder.js").DependencyGraph;
  sourceText: string;
  projectFiles: string[];
  fileEntries: { path: string; content: string }[];
  hasTypeScriptConfig: boolean;
};

export type CheckRunner = {
  name: string;
  run: (context: AnalysisContext) => Promise<CheckResult>;
};
