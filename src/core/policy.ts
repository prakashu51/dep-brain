import { promises as fs } from "node:fs";
import path from "node:path";
import { parseYaml } from "../utils/yaml.js";
import { auditLicenses } from "./licenses.js";
import type { AnalysisResult, PolicyResult } from "./analyzer.js";

export interface DepBrainPolicy {
  policy?: {
    minScore?: number;
    failOnDuplicates?: boolean;
    failOnOutdated?: boolean;
    failOnRisks?: boolean;
    failOnUnused?: boolean;
  };
  licenses?: {
    allow?: string[];
    deny?: string[];
    failOnDeny?: boolean;
  };
  risks?: {
    maxTrustScore?: "low" | "medium"; // Fail if package trust score is low (or low/medium)
    minMaintainers?: number;
    minRepoActivity?: number;
    failOnOsv?: boolean;
  };
  outdated?: {
    maxMajor?: number;
    maxMinor?: number;
    maxPatch?: number;
  };
}

export async function loadPolicyFile(rootDir: string, customPath?: string): Promise<DepBrainPolicy | null> {
  if (customPath) {
    const resolved = path.resolve(rootDir, customPath);
    const content = await fs.readFile(resolved, "utf8");
    if (customPath.endsWith(".json")) {
      return JSON.parse(content) as DepBrainPolicy;
    } else {
      return parseYaml(content) as DepBrainPolicy;
    }
  }

  const defaultNames = ["dep-brain.policy.yml", "dep-brain.policy.yaml", "dep-brain.policy.json"];
  for (const name of defaultNames) {
    try {
      const resolved = path.resolve(rootDir, name);
      const content = await fs.readFile(resolved, "utf8");
      if (name.endsWith(".json")) {
        return JSON.parse(content) as DepBrainPolicy;
      } else {
        return parseYaml(content) as DepBrainPolicy;
      }
    } catch {}
  }

  return null;
}

export async function evaluateDeclarativePolicy(
  result: AnalysisResult,
  policy: DepBrainPolicy,
  rootDir: string
): Promise<PolicyResult> {
  const reasons: string[] = [];

  // 1. Core Policy checks
  if (policy.policy) {
    const minScore = policy.policy.minScore ?? 0;
    if (result.score < minScore) {
      reasons.push(`Score ${result.score} is below minimum ${minScore}`);
    }
    if (policy.policy.failOnDuplicates && result.duplicates.length > 0) {
      reasons.push(`Found ${result.duplicates.length} duplicate dependencies`);
    }
    if (policy.policy.failOnUnused && result.unused.length > 0) {
      reasons.push(`Found ${result.unused.length} unused dependencies`);
    }
    if (policy.policy.failOnOutdated && result.outdated.length > 0) {
      reasons.push(`Found ${result.outdated.length} outdated dependencies`);
    }
    if (policy.policy.failOnRisks && result.risks.length > 0) {
      reasons.push(`Found ${result.risks.length} risky dependencies`);
    }
  }

  // 2. License checks
  if (policy.licenses && (policy.licenses.allow || policy.licenses.deny)) {
    const licenseResult = await auditLicenses(rootDir, {
      allow: policy.licenses.allow,
      deny: policy.licenses.deny
    });
    if (!licenseResult.success && policy.licenses.failOnDeny !== false) {
      for (const pkg of licenseResult.packages) {
        if (!pkg.allowed || pkg.prohibited) {
          reasons.push(`Package ${pkg.name}@${pkg.version} has unapproved/prohibited license: ${pkg.license}`);
        }
      }
    }
  }

  // 3. Risk checks
  if (policy.risks) {
    const maxTrust = policy.risks.maxTrustScore;
    const minMaintainers = policy.risks.minMaintainers;
    const minActivity = policy.risks.minRepoActivity;
    const failOnOsv = policy.risks.failOnOsv;

    for (const r of result.risks) {
      if (maxTrust) {
        if (maxTrust === "low" && r.trustScore === "low") {
          reasons.push(`Package ${r.name} has prohibited trust score low`);
        } else if (maxTrust === "medium" && (r.trustScore === "low" || r.trustScore === "medium")) {
          reasons.push(`Package ${r.name} has prohibited trust score ${r.trustScore}`);
        }
      }
      if (minMaintainers && r.riskFactors.maintainersCount !== null && r.riskFactors.maintainersCount < minMaintainers) {
        reasons.push(`Package ${r.name} has ${r.riskFactors.maintainersCount} maintainers (minimum required: ${minMaintainers})`);
      }
      const repoActivity = (r.riskFactors as any).repoActivityScore;
      if (minActivity && repoActivity !== undefined && repoActivity !== null && repoActivity < minActivity) {
        reasons.push(`Package ${r.name} has repository activity score ${repoActivity} (minimum required: ${minActivity})`);
      }
      if (failOnOsv && r.reasonCodes.includes("osv_vulnerability")) {
        reasons.push(`Package ${r.name} has active OSV vulnerabilities`);
      }
    }
  }

  // 4. Outdated limits
  if (policy.outdated) {
    const maxMajor = policy.outdated.maxMajor;
    const maxMinor = policy.outdated.maxMinor;
    const maxPatch = policy.outdated.maxPatch;

    if (maxMajor !== undefined) {
      const count = result.outdated.filter((o) => o.updateType === "major").length;
      if (count > maxMajor) {
        reasons.push(`Found ${count} major outdated dependencies (limit: ${maxMajor})`);
      }
    }
    if (maxMinor !== undefined) {
      const count = result.outdated.filter((o) => o.updateType === "minor").length;
      if (count > maxMinor) {
        reasons.push(`Found ${count} minor outdated dependencies (limit: ${maxMinor})`);
      }
    }
    if (maxPatch !== undefined) {
      const count = result.outdated.filter((o) => o.updateType === "patch").length;
      if (count > maxPatch) {
        reasons.push(`Found ${count} patch outdated dependencies (limit: ${maxPatch})`);
      }
    }
  }

  return {
    passed: reasons.length === 0,
    reasons
  };
}
