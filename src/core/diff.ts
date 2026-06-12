import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildDependencyGraph } from "./graph-builder.js";
import { runCommand } from "./fix-apply.js";
import { auditLicenses } from "./licenses.js";
import { analyzeProject } from "./analyzer.js";

export interface PackageDiff {
  name: string;
  changeType: "added" | "removed" | "upgraded" | "downgraded" | "unchanged";
  baseVersions: string[];
  headVersions: string[];
  baseLicense: string;
  headLicense: string;
  baseRisk: string; // "high" | "medium" | "low" | "none"
  headRisk: string;
}

export interface BranchDiffResult {
  success: boolean;
  baseRef: string;
  headRef: string;
  scoreDelta: number;
  baseScore: number;
  headScore: number;
  diffs: PackageDiff[];
  summary: string;
}

export async function diffBranches(
  rootDir: string,
  baseRef: string,
  headRef?: string // If empty, diff against current workspace
): Promise<BranchDiffResult> {
  const tempBaseDir = await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-diff-base-"));
  const tempHeadDir = headRef ? await fs.mkdtemp(path.join(os.tmpdir(), "depbrain-diff-head-")) : rootDir;

  try {
    // 1. Extract base branch files
    await extractBranchFiles(rootDir, baseRef, tempBaseDir);

    // 2. Extract head branch files if ref is specified
    if (headRef) {
      await extractBranchFiles(rootDir, headRef, tempHeadDir);
    }

    // 3. Run analysis on both directories to get health scores and risk findings
    const baseAnalysis = await analyzeProject({ rootDir: tempBaseDir, focus: "all" });
    const headAnalysis = await analyzeProject({ rootDir: tempHeadDir, focus: "all" });

    // 4. Run license audits on both directories
    const baseLicenseAudit = await auditLicenses(tempBaseDir);
    const headLicenseAudit = await auditLicenses(tempHeadDir);

    const baseGraph = await buildDependencyGraph(tempBaseDir);
    const headGraph = await buildDependencyGraph(tempHeadDir);

    // Collect all unique package names
    const basePackages = Object.keys(baseGraph.lockPackages ?? {});
    const headPackages = Object.keys(headGraph.lockPackages ?? {});
    const allNames = Array.from(new Set([...basePackages, ...headPackages])).sort();

    const diffs: PackageDiff[] = [];

    for (const name of allNames) {
      const baseInsts = baseGraph.lockPackages?.[name] ?? [];
      const headInsts = headGraph.lockPackages?.[name] ?? [];

      const baseVersions = Array.from(new Set(baseInsts.map((i) => i.version))).sort();
      const headVersions = Array.from(new Set(headInsts.map((i) => i.version))).sort();

      const baseLic = baseLicenseAudit.packages.find((p) => p.name === name)?.license ?? "UNKNOWN";
      const headLic = headLicenseAudit.packages.find((p) => p.name === name)?.license ?? "UNKNOWN";

      // Resolve risk levels
      const baseRiskDep = baseAnalysis.risks.find((r) => r.name === name);
      const headRiskDep = headAnalysis.risks.find((r) => r.name === name);

      const baseRisk = baseRiskDep ? baseRiskDep.trustScore : "none";
      const headRisk = headRiskDep ? headRiskDep.trustScore : "none";

      let changeType: PackageDiff["changeType"] = "unchanged";

      if (baseVersions.length === 0 && headVersions.length > 0) {
        changeType = "added";
      } else if (baseVersions.length > 0 && headVersions.length === 0) {
        changeType = "removed";
      } else if (baseVersions.sort().join(",") !== headVersions.sort().join(",")) {
        // Simple heuristic: compare first versions
        const baseV = baseVersions[0] ?? "";
        const headV = headVersions[0] ?? "";
        changeType = compareVersions(baseV, headV) < 0 ? "upgraded" : "downgraded";
      }

      if (changeType !== "unchanged" || baseLic !== headLic || baseRisk !== headRisk) {
        diffs.push({
          name,
          changeType,
          baseVersions,
          headVersions,
          baseLicense: baseLic,
          headLicense: headLic,
          baseRisk,
          headRisk
        });
      }
    }

    const scoreDelta = headAnalysis.score - baseAnalysis.score;
    const summary = `Dependency diff completed between ${baseRef} and ${headRef ?? "current workspace"}. Health Score delta: ${scoreDelta > 0 ? "+" : ""}${scoreDelta} (Base: ${baseAnalysis.score}, Head: ${headAnalysis.score}).`;

    return {
      success: true,
      baseRef,
      headRef: headRef ?? "workspace",
      scoreDelta,
      baseScore: baseAnalysis.score,
      headScore: headAnalysis.score,
      diffs,
      summary
    };
  } finally {
    // Cleanup base temp files
    await fs.rm(tempBaseDir, { recursive: true, force: true }).catch(() => {});
    if (headRef) {
      await fs.rm(tempHeadDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function extractBranchFiles(rootDir: string, branch: string, destDir: string): Promise<void> {
  const filesToExtract = ["package.json"];
  for (const lockfile of ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]) {
    try {
      await fs.access(path.join(rootDir, lockfile));
      filesToExtract.push(lockfile);
    } catch {}
  }
  try {
    const { findWorkspacePackages } = await import("../utils/workspaces.js");
    const workspaces = await findWorkspacePackages(rootDir);
    for (const ws of workspaces) {
      const rel = path.relative(rootDir, ws.packageJsonPath);
      filesToExtract.push(rel);
    }
  } catch {}

  for (const file of filesToExtract) {
    const destPath = path.join(destDir, file);
    await fs.mkdir(path.dirname(destPath), { recursive: true });

    const result = await runCommand("git", ["show", `${branch}:${file.replace(/\\/g, "/")}`], { cwd: rootDir });
    if (result.exitCode === 0) {
      await fs.writeFile(destPath, result.stdout, "utf8");
    }
  }
}

function compareVersions(v1: string, v2: string): number {
  // Simple version comparison fallback
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] ?? 0;
    const p2 = parts2[i] ?? 0;
    if (p1 !== p2) {
      return p1 - p2;
    }
  }
  return 0;
}

export function renderDiffText(result: BranchDiffResult): string {
  const lines = [`Dependency Brain Diff: ${result.baseRef} -> ${result.headRef}`, ""];
  lines.push(`Health Score: ${result.baseScore} -> ${result.headScore} (${result.scoreDelta > 0 ? "+" : ""}${result.scoreDelta})`);
  lines.push("");

  const added = result.diffs.filter((d) => d.changeType === "added");
  const removed = result.diffs.filter((d) => d.changeType === "removed");
  const upgraded = result.diffs.filter((d) => d.changeType === "upgraded");
  const downgraded = result.diffs.filter((d) => d.changeType === "downgraded");
  const unchangedLicRisk = result.diffs.filter((d) => d.changeType === "unchanged");

  if (added.length > 0) {
    lines.push("Added Packages:");
    for (const d of added) {
      lines.push(`  + ${d.name} (${d.headVersions.join(", ")}) [License: ${d.headLicense}] [Risk: ${d.headRisk}]`);
    }
    lines.push("");
  }

  if (removed.length > 0) {
    lines.push("Removed Packages:");
    for (const d of removed) {
      lines.push(`  - ${d.name} (${d.baseVersions.join(", ")}) [License: ${d.baseLicense}] [Risk: ${d.baseRisk}]`);
    }
    lines.push("");
  }

  if (upgraded.length > 0) {
    lines.push("Upgraded Packages:");
    for (const d of upgraded) {
      const licText = d.baseLicense !== d.headLicense ? `, License: ${d.baseLicense} -> ${d.headLicense}` : "";
      const riskText = d.baseRisk !== d.headRisk ? `, Risk: ${d.baseRisk} -> ${d.headRisk}` : "";
      lines.push(`  ^ ${d.name} (${d.baseVersions.join(", ")} -> ${d.headVersions.join(", ")})${licText}${riskText}`);
    }
    lines.push("");
  }

  if (downgraded.length > 0) {
    lines.push("Downgraded Packages:");
    for (const d of downgraded) {
      const licText = d.baseLicense !== d.headLicense ? `, License: ${d.baseLicense} -> ${d.headLicense}` : "";
      const riskText = d.baseRisk !== d.headRisk ? `, Risk: ${d.baseRisk} -> ${d.headRisk}` : "";
      lines.push(`  v ${d.name} (${d.baseVersions.join(", ")} -> ${d.headVersions.join(", ")})${licText}${riskText}`);
    }
    lines.push("");
  }

  if (unchangedLicRisk.length > 0) {
    lines.push("Modified License or Risk Profile (version unchanged):");
    for (const d of unchangedLicRisk) {
      const licText = d.baseLicense !== d.headLicense ? `, License: ${d.baseLicense} -> ${d.headLicense}` : "";
      const riskText = d.baseRisk !== d.headRisk ? `, Risk: ${d.baseRisk} -> ${d.headRisk}` : "";
      lines.push(`  ~ ${d.name} (${d.headVersions.join(", ")})${licText}${riskText}`);
    }
    lines.push("");
  }

  if (result.diffs.length === 0) {
    lines.push("No dependency differences detected.");
  }

  return lines.join("\n");
}

export function renderDiffMarkdown(result: BranchDiffResult): string {
  const lines = [`### 🔀 Dependency Brain Diff: \`${result.baseRef}\` ➔ \`${result.headRef}\``, ""];
  lines.push(`**Health Score**: \`${result.baseScore}\` ➔ \`${result.headScore}\` (${result.scoreDelta > 0 ? "+" : ""}${result.scoreDelta})`);
  lines.push("");

  if (result.diffs.length === 0) {
    lines.push("No dependency changes detected.");
    return lines.join("\n");
  }

  lines.push("| Package | Change | Base Info | Head Info |");
  lines.push("| :--- | :---: | :--- | :--- |");

  for (const d of result.diffs) {
    let changeSymbol = "  ";
    if (d.changeType === "added") changeSymbol = "➕ Added";
    else if (d.changeType === "removed") changeSymbol = "➖ Removed";
    else if (d.changeType === "upgraded") changeSymbol = "🚀 Upgraded";
    else if (d.changeType === "downgraded") changeSymbol = "⚠️ Downgraded";
    else if (d.changeType === "unchanged") changeSymbol = "🔄 Profile Shift";

    const baseInfo = d.changeType === "added" ? "-" : `Ver: ${d.baseVersions.join(", ")}, Lic: ${d.baseLicense}, Risk: ${d.baseRisk}`;
    const headInfo = d.changeType === "removed" ? "-" : `Ver: ${d.headVersions.join(", ")}, Lic: ${d.headLicense}, Risk: ${d.headRisk}`;

    lines.push(`| **${d.name}** | ${changeSymbol} | ${baseInfo} | ${headInfo} |`);
  }

  return lines.join("\n");
}
