import { promises as fs } from "node:fs";
import path from "node:path";
import { buildDependencyGraph } from "./graph-builder.js";

const CACHE_DIR = path.join(".depbrain", "license-cache");
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export interface LicenseAuditOptions {
  allow?: string[];
  deny?: string[];
  failOnDeny?: boolean;
}

export interface PackageLicenseInfo {
  name: string;
  version: string;
  license: string;
  allowed: boolean;
  prohibited: boolean;
}

export interface LicenseAuditResult {
  success: boolean;
  packages: PackageLicenseInfo[];
  counts: {
    total: number;
    allowed: number;
    denied: number;
    unknown: number;
  };
  summary: string;
}

export async function auditLicenses(
  rootDir: string,
  options: LicenseAuditOptions = {}
): Promise<LicenseAuditResult> {
  const graph = await buildDependencyGraph(rootDir);
  const allPackages: { name: string; version: string; path: string }[] = [];

  for (const [name, instances] of Object.entries(graph.lockPackages ?? {})) {
    for (const inst of instances) {
      allPackages.push({
        name,
        version: inst.version,
        path: inst.path
      });
    }
  }

  // Deduplicate by name and version
  const uniquePackagesMap = new Map<string, { name: string; version: string; path: string }>();
  for (const pkg of allPackages) {
    uniquePackagesMap.set(`${pkg.name}@${pkg.version}`, pkg);
  }
  const uniquePackages = Array.from(uniquePackagesMap.values()).sort((left, right) =>
    left.name.localeCompare(right.name) || left.version.localeCompare(right.version)
  );

  const packagesInfo: PackageLicenseInfo[] = [];
  const cacheDirAbs = path.join(rootDir, CACHE_DIR);
  await fs.mkdir(cacheDirAbs, { recursive: true });

  // Resolve licenses in parallel with concurrency limit of 10
  const concurrency = 10;
  for (let i = 0; i < uniquePackages.length; i += concurrency) {
    const batch = uniquePackages.slice(i, i + concurrency);
    const resolvedBatch = await Promise.all(
      batch.map(async (pkg) => {
        const license = await resolveLicense(rootDir, pkg.name, pkg.version, pkg.path);
        
        let allowed = true;
        let prohibited = false;

        const normalizedLicense = license.toUpperCase();

        if (options.deny && options.deny.length > 0) {
          const isDenied = options.deny.some((d) => normalizedLicense.includes(d.toUpperCase()));
          if (isDenied) {
            prohibited = true;
            allowed = false;
          }
        }

        if (options.allow && options.allow.length > 0) {
          const isAllowed = options.allow.some((a) => normalizedLicense.includes(a.toUpperCase()));
          if (!isAllowed) {
            allowed = false;
          }
        }

        return {
          name: pkg.name,
          version: pkg.version,
          license,
          allowed,
          prohibited
        };
      })
    );
    packagesInfo.push(...resolvedBatch);
  }

  let allowedCount = 0;
  let deniedCount = 0;
  let unknownCount = 0;

  for (const info of packagesInfo) {
    if (info.license === "UNKNOWN") {
      unknownCount++;
    }
    if (info.prohibited || (!info.allowed && options.allow && options.allow.length > 0)) {
      deniedCount++;
    } else {
      allowedCount++;
    }
  }

  const success = deniedCount === 0;
  const summary = success
    ? `License compliance check passed. Total: ${packagesInfo.length}, Allowed: ${allowedCount}, Unknown: ${unknownCount}.`
    : `License compliance check failed. Prohibited/Unapproved licenses detected: ${deniedCount}.`;

  return {
    success,
    packages: packagesInfo,
    counts: {
      total: packagesInfo.length,
      allowed: allowedCount,
      denied: deniedCount,
      unknown: unknownCount
    },
    summary
  };
}

async function resolveLicense(
  rootDir: string,
  name: string,
  version: string,
  installPath: string
): Promise<string> {
  // 1. Local node_modules package.json lookup
  const localPkgPath = path.join(rootDir, installPath, "package.json");
  try {
    const raw = await fs.readFile(localPkgPath, "utf8");
    const license = parseLicenseJson(raw);
    if (license !== "UNKNOWN") {
      return license;
    }
  } catch {}

  // 2. Cache lookup
  const cacheFile = path.join(rootDir, CACHE_DIR, `${encodeURIComponent(name)}-${version}.json`);
  try {
    const stat = await fs.stat(cacheFile);
    if (Date.now() - stat.mtime.getTime() < CACHE_TTL) {
      const raw = await fs.readFile(cacheFile, "utf8");
      const cached = JSON.parse(raw) as { license: string };
      return cached.license;
    }
  } catch {}

  // 3. Registry query lookup
  try {
    const response = await fetch(`https://registry.npmjs.org/${name}/${version}`, {
      signal: AbortSignal.timeout(5000)
    });
    if (response.ok) {
      const payload = (await response.json()) as any;
      const license = parseLicense(payload);
      await fs.writeFile(cacheFile, JSON.stringify({ license }, null, 2), "utf8");
      return license;
    }
  } catch {}

  // 4. Fallback to expired cache if registry lookup fails
  try {
    const raw = await fs.readFile(cacheFile, "utf8");
    const cached = JSON.parse(raw) as { license: string };
    return cached.license;
  } catch {}

  return "UNKNOWN";
}

function parseLicenseJson(raw: string): string {
  try {
    const pkg = JSON.parse(raw);
    return parseLicense(pkg);
  } catch {
    return "UNKNOWN";
  }
}

function parseLicense(pkg: any): string {
  if (typeof pkg.license === "string" && pkg.license.trim().length > 0) {
    return pkg.license;
  }
  if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
    const licenses = pkg.licenses
      .map((item: any) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && typeof item.type === "string") {
          return item.type;
        }
        return null;
      })
      .filter((item: any): item is string => Boolean(item));

    return licenses.length > 0 ? licenses.join(", ") : "UNKNOWN";
  }
  if (pkg.license && typeof pkg.license === "object" && typeof pkg.license.type === "string") {
    return pkg.license.type;
  }
  return "UNKNOWN";
}

export function renderLicensesText(result: LicenseAuditResult): string {
  const lines = ["Dependency Brain License Audit", ""];
  
  // Build a simple padded table
  const colWidths = { name: 30, version: 12, license: 15, status: 10 };
  const header = 
    "Package".padEnd(colWidths.name) + " " +
    "Version".padEnd(colWidths.version) + " " +
    "License".padEnd(colWidths.license) + " " +
    "Status".padEnd(colWidths.status);
  
  lines.push(header);
  lines.push("-".repeat(header.length));

  for (const pkg of result.packages) {
    const isDenied = pkg.prohibited || (!pkg.allowed && result.counts.denied > 0);
    const statusText = isDenied ? "DENIED" : "APPROVED";
    
    lines.push(
      pkg.name.substring(0, colWidths.name - 1).padEnd(colWidths.name) + " " +
      pkg.version.substring(0, colWidths.version - 1).padEnd(colWidths.version) + " " +
      pkg.license.substring(0, colWidths.license - 1).padEnd(colWidths.license) + " " +
      statusText.padEnd(colWidths.status)
    );
  }

  lines.push("");
  lines.push(`Summary: ${result.summary}`);
  return lines.join("\n");
}

export function renderLicensesMarkdown(result: LicenseAuditResult): string {
  const lines = ["### 📜 License Compliance Report", ""];
  
  lines.push("| Package | Version | License | Status |");
  lines.push("| :--- | :--- | :--- | :--- |");

  for (const pkg of result.packages) {
    const isDenied = pkg.prohibited || (!pkg.allowed && result.counts.denied > 0);
    const statusText = isDenied ? "❌ **DENIED**" : "✅ APPROVED";
    lines.push(`| ${pkg.name} | ${pkg.version} | ${pkg.license} | ${statusText} |`);
  }

  lines.push("");
  lines.push(`**Summary**: ${result.summary}`);
  return lines.join("\n");
}
