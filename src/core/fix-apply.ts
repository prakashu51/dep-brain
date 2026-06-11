import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { findWorkspacePackages } from "../utils/workspaces.js";
import { detectPackageManager, type FixPlan, type FixPlanItem } from "./fix-plan.js";

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface FixApplyOptions {
  rootDir: string;
  allowDirty?: boolean;
  testCommand?: string;
  runner?: CommandRunner;
  noRollback?: boolean;
  cleanImports?: boolean;
  excludePaths?: string[];
}

export interface FixApplyResult {
  applied: FixPlanItem[];
  skipped: FixPlan["skipped"];
  failed: CommandResult | null;
  test: CommandResult | null;
  dirty: boolean;
  rolledBack?: boolean;
  cleanedImportsCount?: number;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string }
) => Promise<CommandResult>;

interface BackupFile {
  relativeSrc: string;
  backupName: string;
}

interface BackupManifest {
  timestamp: string;
  packageManager: string;
  files: BackupFile[];
}

export async function createBackup(rootDir: string): Promise<boolean> {
  try {
    const backupDir = path.join(rootDir, ".depbrain", "backup");
    await fs.mkdir(backupDir, { recursive: true });

    const packageManager = await detectPackageManager(rootDir);
    const filesToBackup: string[] = [];
    try {
      await fs.access(path.join(rootDir, "package.json"));
      filesToBackup.push("package.json");
    } catch {}
    
    // Add lockfiles if they exist
    for (const lockfile of ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]) {
      const lockPath = path.join(rootDir, lockfile);
      try {
        await fs.access(lockPath);
        filesToBackup.push(lockfile);
      } catch {}
    }

    // Add workspace package.json files
    try {
      const workspaces = await findWorkspacePackages(rootDir);
      for (const ws of workspaces) {
        const relPath = path.relative(rootDir, ws.packageJsonPath);
        filesToBackup.push(relPath);
      }
    } catch {}

    const backupFiles: BackupFile[] = [];
    for (const rel of filesToBackup) {
      const srcPath = path.join(rootDir, rel);
      const backupName = rel.replace(/[\/\\]/g, "___") + ".bak";
      const destPath = path.join(backupDir, backupName);
      
      await fs.copyFile(srcPath, destPath);
      backupFiles.push({
        relativeSrc: rel.replace(/\\/g, "/"),
        backupName
      });
    }

    const manifest: BackupManifest = {
      timestamp: new Date().toISOString(),
      packageManager,
      files: backupFiles
    };

    await fs.writeFile(
      path.join(backupDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8"
    );

    return true;
  } catch (err) {
    console.error("Failed to create backup:", err);
    return false;
  }
}

export async function addFileToBackup(rootDir: string, filePath: string): Promise<void> {
  try {
    const backupDir = path.join(rootDir, ".depbrain", "backup");
    const manifestPath = path.join(backupDir, "manifest.json");

    const raw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw) as BackupManifest;

    const rel = path.relative(rootDir, filePath).replace(/\\/g, "/");

    if (manifest.files.some((f) => f.relativeSrc === rel)) {
      return;
    }

    const backupName = rel.replace(/[\/\\]/g, "___") + ".bak";
    const destPath = path.join(backupDir, backupName);

    await fs.mkdir(backupDir, { recursive: true });
    await fs.copyFile(filePath, destPath);
    manifest.files.push({
      relativeSrc: rel,
      backupName
    });

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to add file to backup:", err);
  }
}

export async function rollbackLastFix(
  rootDir: string,
  runner: CommandRunner = runCommand
): Promise<boolean> {
  try {
    const backupDir = path.join(rootDir, ".depbrain", "backup");
    const manifestPath = path.join(backupDir, "manifest.json");

    try {
      await fs.access(manifestPath);
    } catch {
      console.error("No backup found to roll back.");
      return false;
    }

    const raw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw) as BackupManifest;

    // Restore files
    for (const file of manifest.files) {
      const srcPath = path.join(backupDir, file.backupName);
      const destPath = path.join(rootDir, file.relativeSrc);
      
      // Ensure target directory exists
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
    }

    // Delete backup dir
    await fs.rm(backupDir, { recursive: true, force: true });

    // Run package reinstalls
    console.error(`Restoring packages using ${manifest.packageManager}...`);
    const cmd = manifest.packageManager;
    let args = [manifest.packageManager === "npm" ? "ci" : "install"];
    
    if (manifest.packageManager === "npm") {
      const hasLock = manifest.files.some((f) => f.relativeSrc === "package-lock.json");
      if (!hasLock) {
        args = ["install"];
      }
    }

    const result = await runner(cmd, args, { cwd: rootDir });
    if (result.exitCode !== 0) {
      console.error(`Package reinstall failed with code ${result.exitCode}. Output:`);
      console.error(result.stderr);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Rollback failed:", err);
    return false;
  }
}

export async function applyFixPlan(
  plan: FixPlan,
  options: FixApplyOptions
): Promise<FixApplyResult> {
  const runner = options.runner ?? runCommand;
  const dirty = await isGitWorktreeDirty(options.rootDir, runner);

  if (dirty && !options.allowDirty) {
    return {
      applied: [],
      skipped: plan.skipped,
      failed: {
        command: "git status --porcelain",
        exitCode: 1,
        stdout: "",
        stderr: "Git worktree is dirty. Re-run with --allow-dirty to apply anyway."
      },
      test: null,
      dirty
    };
  }

  // Create backup before mutations
  const backedUp = options.noRollback ? false : await createBackup(options.rootDir);

  const applied: FixPlanItem[] = [];
  for (const item of plan.items) {
    const [command, ...args] = item.args;
    const result = await runner(command, args, { cwd: options.rootDir });
    if (result.exitCode !== 0) {
      let rolledBack = false;
      if (backedUp && !options.noRollback) {
        rolledBack = await rollbackLastFix(options.rootDir, runner);
      }
      return {
        applied,
        skipped: plan.skipped,
        failed: result,
        test: null,
        dirty,
        rolledBack
      };
    }

    applied.push(item);
  }

  let cleanedImportsCount = 0;
  if (options.cleanImports && applied.length > 0) {
    try {
      const { cleanUnusedImports } = await import("./codemod.js");
      const codemodRes = await cleanUnusedImports({
        rootDir: options.rootDir,
        packageNames: applied.map((item) => item.name),
        excludePaths: options.excludePaths,
        onBeforeModify: async (file) => {
          if (backedUp) {
            await addFileToBackup(options.rootDir, file);
          }
        }
      });
      cleanedImportsCount = codemodRes.filesModified.length;
    } catch (err) {
      console.error("Failed to run codemod cleaning:", err);
    }
  }

  const test = options.testCommand
    ? await runShellCommand(options.testCommand, options.rootDir, runner)
    : null;

  if (test && test.exitCode !== 0) {
    let rolledBack = false;
    if (backedUp && !options.noRollback) {
      rolledBack = await rollbackLastFix(options.rootDir, runner);
    }
    return {
      applied,
      skipped: plan.skipped,
      failed: test,
      test,
      dirty,
      rolledBack,
      cleanedImportsCount
    };
  }

  return {
    applied,
    skipped: plan.skipped,
    failed: null,
    test,
    dirty,
    cleanedImportsCount
  };
}

export function renderFixApplyResult(result: FixApplyResult): string {
  const lines = ["Dependency Brain Fix Apply", ""];

  if (result.failed?.command === "git status --porcelain") {
    lines.push(result.failed.stderr);
    return lines.join("\n");
  }

  if (result.applied.length === 0) {
    lines.push("No commands applied.");
  } else {
    lines.push("Applied:");
    for (const item of result.applied) {
      lines.push(`- ${item.command}`);
    }
  }

  if (result.cleanedImportsCount && result.cleanedImportsCount > 0) {
    lines.push("");
    lines.push(`Cleaned unused imports in ${result.cleanedImportsCount} source files.`);
  }

  if (result.failed) {
    lines.push("");
    lines.push(`Failed: ${result.failed.command}`);
    if (result.failed.stderr) {
      lines.push(result.failed.stderr);
    }
    if (result.rolledBack) {
      lines.push("Changes rolled back to clean state.");
    }
  }

  if (result.test) {
    lines.push("");
    lines.push(
      `Test command: ${result.test.command} (${result.test.exitCode === 0 ? "passed" : "failed"})`
    );
  }

  if (result.skipped.length > 0) {
    lines.push("");
    lines.push("Skipped:");
    for (const item of result.skipped) {
      lines.push(`- ${item.name}: ${item.reason}`);
    }
  }

  return lines.join("\n");
}

export async function isGitWorktreeDirty(
  rootDir: string,
  runner: CommandRunner = runCommand
): Promise<boolean> {
  const result = await runner("git", ["status", "--porcelain"], { cwd: rootDir });
  return result.exitCode !== 0 || result.stdout.trim().length > 0;
}

export async function runShellCommand(
  commandLine: string,
  cwd: string,
  runner: CommandRunner
): Promise<CommandResult> {
  if (process.platform === "win32") {
    return runner("cmd", ["/c", commandLine], { cwd });
  }

  return runner("sh", ["-c", commandLine], { cwd });
}

export async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string }
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) =>
      resolve({
        command: [command, ...args].join(" "),
        exitCode: 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: error.message
      })
    );
    child.on("close", (code) =>
      resolve({
        command: [command, ...args].join(" "),
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      })
    );
  });
}
