import { spawn } from "node:child_process";
import type { FixPlan, FixPlanItem } from "./fix-plan.js";

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
}

export interface FixApplyResult {
  applied: FixPlanItem[];
  skipped: FixPlan["skipped"];
  failed: CommandResult | null;
  test: CommandResult | null;
  dirty: boolean;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string }
) => Promise<CommandResult>;

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

  const applied: FixPlanItem[] = [];
  for (const item of plan.items) {
    const [command, ...args] = item.args;
    const result = await runner(command, args, { cwd: options.rootDir });
    if (result.exitCode !== 0) {
      return {
        applied,
        skipped: plan.skipped,
        failed: result,
        test: null,
        dirty
      };
    }

    applied.push(item);
  }

  const test = options.testCommand
    ? await runShellCommand(options.testCommand, options.rootDir, runner)
    : null;

  return {
    applied,
    skipped: plan.skipped,
    failed: test && test.exitCode !== 0 ? test : null,
    test,
    dirty
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

  if (result.failed) {
    lines.push("");
    lines.push(`Failed: ${result.failed.command}`);
    if (result.failed.stderr) {
      lines.push(result.failed.stderr);
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

async function runShellCommand(
  commandLine: string,
  cwd: string,
  runner: CommandRunner
): Promise<CommandResult> {
  if (process.platform === "win32") {
    return runner("cmd", ["/c", commandLine], { cwd });
  }

  return runner("sh", ["-c", commandLine], { cwd });
}

async function runCommand(
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
