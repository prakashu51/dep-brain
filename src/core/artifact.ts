import { promises as fs } from "node:fs";
import path from "node:path";
import type { DepBrainConfig } from "../utils/config.js";

export interface BundleOptions {
  rootDir: string;
  config: DepBrainConfig;
  outPath?: string;
}

export interface BundleResult {
  success: boolean;
  outputPath: string;
  filesBundled: string[];
  isZip: boolean;
}

export async function bundleArtifacts(
  options: BundleOptions
): Promise<BundleResult> {
  const outDir = options.outPath ?? "depbrain-artifacts";
  const resolvedOut = path.resolve(options.rootDir, outDir);

  const filesToBundle: string[] = [];

  // 1. Dashboard HTML
  const dashboardPath = path.resolve(options.rootDir, options.config.dashboard.outputPath);
  try {
    await fs.access(dashboardPath);
    filesToBundle.push(dashboardPath);
  } catch {}

  // 2. Runtime trace JSON
  const tracePath = path.resolve(options.rootDir, options.config.runtimeTrace.outputPath);
  try {
    await fs.access(tracePath);
    filesToBundle.push(tracePath);
  } catch {}

  // 3. Look for standard JSON reports
  for (const file of ["depbrain.json", "depbrain-baseline.json", "depbrain-report.json"]) {
    const p = path.resolve(options.rootDir, file);
    try {
      await fs.access(p);
      filesToBundle.push(p);
    } catch {}
  }

  if (filesToBundle.length === 0) {
    return {
      success: false,
      outputPath: resolvedOut,
      filesBundled: [],
      isZip: false
    };
  }

  const isZipRequested = outDir.endsWith(".zip");
  if (isZipRequested) {
    const tempDir = path.join(options.rootDir, ".depbrain", "temp-artifacts");
    await fs.mkdir(tempDir, { recursive: true });
    const copied: string[] = [];
    for (const file of filesToBundle) {
      const dest = path.join(tempDir, path.basename(file));
      await fs.copyFile(file, dest);
      copied.push(path.basename(file));
    }

    try {
      const { execSync } = await import("node:child_process");
      if (process.platform === "win32") {
        execSync(
          `powershell -Command "Compress-Archive -Path '${tempDir}\\*' -DestinationPath '${resolvedOut}' -Force"`,
          { stdio: "ignore" }
        );
      } else {
        execSync(`tar -a -c -f "${resolvedOut}" -C "${tempDir}" .`, { stdio: "ignore" });
      }
      await fs.rm(tempDir, { recursive: true, force: true });
      return {
        success: true,
        outputPath: resolvedOut,
        filesBundled: copied,
        isZip: true
      };
    } catch (err) {
      console.error("Zip packaging failed, falling back to directory consolidation:", err);
      // Clean up temp dir if zipping failed
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // Fall back or default to directory copy
  const finalDir = isZipRequested ? resolvedOut.replace(/\.zip$/i, "") : resolvedOut;
  await fs.mkdir(finalDir, { recursive: true });
  const copied: string[] = [];
  for (const file of filesToBundle) {
    const dest = path.join(finalDir, path.basename(file));
    await fs.copyFile(file, dest);
    copied.push(path.relative(options.rootDir, dest));
  }

  return {
    success: true,
    outputPath: finalDir,
    filesBundled: copied,
    isZip: false
  };
}
