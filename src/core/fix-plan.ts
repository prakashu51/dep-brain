import { promises as fs } from "node:fs";
import path from "node:path";
import type { AnalysisResult, UnusedDependency } from "./analyzer.js";

export type PackageManager = "npm" | "pnpm" | "yarn";

export interface FixPlanOptions {
  includeCaution?: boolean;
}

export interface FixPlanItem {
  name: string;
  section: "dependencies" | "devDependencies";
  package?: string;
  confidence: number;
  safety: "safe" | "caution" | "unknown";
  command: string;
  args: string[];
}

export interface SkippedFixItem {
  name: string;
  section: "dependencies" | "devDependencies";
  package?: string;
  confidence: number;
  safety: "safe" | "caution" | "unknown";
  reason: string;
}

export interface FixPlan {
  packageManager: PackageManager;
  dryRun: true;
  commands: string[];
  items: FixPlanItem[];
  skipped: SkippedFixItem[];
}

export async function buildUnusedFixPlan(
  result: AnalysisResult,
  options: FixPlanOptions = {}
): Promise<FixPlan> {
  const packageManager = await detectPackageManager(result.rootDir);
  const items: FixPlanItem[] = [];
  const skipped: SkippedFixItem[] = [];

  for (const item of result.unused) {
    const skipReason = getSkipReason(item, options);
    if (skipReason) {
      skipped.push({
        name: item.name,
        section: item.section,
        package: item.package,
        confidence: item.confidence,
        safety: item.recommendation.safety,
        reason: skipReason
      });
      continue;
    }

    const command = buildRemoveCommand(packageManager, item);
    items.push({
      name: item.name,
      section: item.section,
      package: item.package,
      confidence: item.confidence,
      safety: item.recommendation.safety,
      command: command.join(" "),
      args: command
    });
  }

  return {
    packageManager,
    dryRun: true,
    commands: items.map((item) => item.command),
    items,
    skipped
  };
}

export async function detectPackageManager(
  rootDir: string
): Promise<PackageManager> {
  if (await fileExists(path.join(rootDir, "pnpm-lock.yaml"))) {
    return "pnpm";
  }

  if (await fileExists(path.join(rootDir, "yarn.lock"))) {
    return "yarn";
  }

  return "npm";
}

export function renderFixPlan(plan: FixPlan): string {
  const lines = [
    "Dependency Brain Fix Plan",
    "",
    `Package manager: ${plan.packageManager}`,
    "Mode: dry-run",
    ""
  ];

  if (plan.commands.length === 0) {
    lines.push("No safe unused dependency removals found.");
  } else {
    lines.push("Commands:");
    for (const command of plan.commands) {
      lines.push(`- ${command}`);
    }
  }

  if (plan.skipped.length > 0) {
    lines.push("");
    lines.push("Skipped:");
    for (const item of plan.skipped) {
      lines.push(
        `- ${item.name}${item.package ? ` [${item.package}]` : ""}: ${item.reason}`
      );
    }
  }

  return lines.join("\n");
}

function getSkipReason(
  item: UnusedDependency,
  options: FixPlanOptions
): string | null {
  if (
    item.recommendation.safety !== "safe" &&
    !(options.includeCaution && item.recommendation.safety === "caution")
  ) {
    return "requires --include-caution";
  }

  if (
    item.section === "dependencies" &&
    item.confidence < 0.88 &&
    !options.includeCaution
  ) {
    return "runtime dependency confidence below 88%";
  }

  return null;
}

function buildRemoveCommand(
  packageManager: PackageManager,
  item: UnusedDependency
): string[] {
  if (packageManager === "pnpm") {
    return item.package
      ? ["pnpm", "--filter", item.package, "remove", item.name]
      : ["pnpm", "remove", item.name];
  }

  if (packageManager === "yarn") {
    return item.package
      ? ["yarn", "workspace", item.package, "remove", item.name]
      : ["yarn", "remove", item.name];
  }

  return item.package
    ? ["npm", "uninstall", item.name, "--workspace", item.package]
    : ["npm", "uninstall", item.name];
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
