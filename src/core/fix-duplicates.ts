import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { buildDependencyGraph } from "./graph-builder.js";
import { findDuplicateDependencies } from "../checks/duplicate.js";
import { detectPackageManager } from "./fix-plan.js";
import type { CommandRunner, CommandResult } from "./fix-apply.js";

export interface DedupeResult {
  success: boolean;
  packageManager: string;
  beforeCount: number;
  afterCount: number;
  consolidatedCount: number;
  remainingDuplicates: string[];
  suggestedOverrides?: {
    npm?: Record<string, string>;
    pnpm?: Record<string, string>;
    yarn?: Record<string, string>;
  };
  commandsRun: string[];
  error?: string;
}

export async function applyDeduplication(
  rootDir: string,
  options: {
    dryRun?: boolean;
    runner?: CommandRunner;
    onBeforeModify?: (filePath: string) => Promise<void>;
  } = {}
): Promise<DedupeResult> {
  const runner = options.runner ?? defaultRunCommand;
  const packageManager = await detectPackageManager(rootDir);

  // 1. Build initial dependency graph and duplicates
  let beforeGraph;
  try {
    beforeGraph = await buildDependencyGraph(rootDir);
  } catch (err: any) {
    return {
      success: false,
      packageManager,
      beforeCount: 0,
      afterCount: 0,
      consolidatedCount: 0,
      remainingDuplicates: [],
      commandsRun: [],
      error: `Failed to build initial dependency graph: ${err.message}`
    };
  }

  const beforeDuplicates = await findDuplicateDependencies(beforeGraph);
  const beforeCount = beforeDuplicates.length;

  // Calculate initial total versions of duplicated packages
  let beforeVersionsTotal = 0;
  const beforeVersionsMap = new Map<string, string[]>();
  for (const d of beforeDuplicates) {
    beforeVersionsTotal += d.versions.length;
    beforeVersionsMap.set(d.name, d.versions);
  }

  // Determine commands to execute
  const commandsToRun: { cmd: string; args: string[] }[] = [];
  if (packageManager === "npm") {
    commandsToRun.push({ cmd: "npm", args: ["dedupe"] });
  } else if (packageManager === "pnpm") {
    commandsToRun.push({ cmd: "pnpm", args: ["dedupe"] });
  } else if (packageManager === "yarn") {
    const isClassic = await isYarnClassic(rootDir);
    if (isClassic) {
      commandsToRun.push({ cmd: "npx", args: ["yarn-deduplicate", "yarn.lock"] });
      commandsToRun.push({ cmd: "yarn", args: ["install"] });
    } else {
      commandsToRun.push({ cmd: "yarn", args: ["dedupe"] });
    }
  }

  const commandsRunStrings = commandsToRun.map((c) => `${c.cmd} ${c.args.join(" ")}`);

  if (options.dryRun) {
    // Dry run: calculate suggested overrides based on initial duplicates
    const suggestedOverrides = buildSuggestedOverrides(beforeDuplicates, packageManager);
    return {
      success: true,
      packageManager,
      beforeCount,
      afterCount: beforeCount,
      consolidatedCount: 0,
      remainingDuplicates: beforeDuplicates.map((d) => d.name),
      suggestedOverrides,
      commandsRun: commandsRunStrings
    };
  }

  // Backup callback if provided
  if (options.onBeforeModify) {
    // Files that might be modified: package-lock.json, pnpm-lock.yaml, yarn.lock, package.json
    for (const lockfile of ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "package.json"]) {
      const lockPath = path.join(rootDir, lockfile);
      try {
        await fs.access(lockPath);
        await options.onBeforeModify(lockPath);
      } catch {}
    }
  }

  // 2. Execute deduplication commands
  for (const command of commandsToRun) {
    const runResult = await runner(command.cmd, command.args, { cwd: rootDir });
    if (runResult.exitCode !== 0) {
      return {
        success: false,
        packageManager,
        beforeCount,
        afterCount: beforeCount,
        consolidatedCount: 0,
        remainingDuplicates: beforeDuplicates.map((d) => d.name),
        commandsRun: commandsRunStrings,
        error: `Command '${runResult.command}' failed with exit code ${runResult.exitCode}. Stderr: ${runResult.stderr}`
      };
    }
  }

  // 3. Build post dependency graph and count remaining duplicates
  let afterGraph;
  try {
    afterGraph = await buildDependencyGraph(rootDir);
  } catch (err: any) {
    return {
      success: false,
      packageManager,
      beforeCount,
      afterCount: beforeCount,
      consolidatedCount: 0,
      remainingDuplicates: beforeDuplicates.map((d) => d.name),
      commandsRun: commandsRunStrings,
      error: `Failed to build post dependency graph: ${err.message}`
    };
  }

  const afterDuplicates = await findDuplicateDependencies(afterGraph);
  const afterCount = afterDuplicates.length;

  // Calculate final total versions of packages that were duplicated before
  let afterVersionsTotal = 0;
  for (const name of beforeVersionsMap.keys()) {
    const matchedAfter = afterDuplicates.find((d) => d.name === name);
    if (matchedAfter) {
      afterVersionsTotal += matchedAfter.versions.length;
    } else {
      // If it's no longer duplicate, check if it exists in graph
      const instances = afterGraph.lockPackages[name] ?? [];
      const distinctVersions = Array.from(new Set(instances.map((i) => i.version)));
      afterVersionsTotal += Math.max(1, distinctVersions.length);
    }
  }

  const consolidatedCount = Math.max(0, beforeVersionsTotal - afterVersionsTotal);
  const remainingDuplicates = afterDuplicates.map((d) => d.name);
  const suggestedOverrides = buildSuggestedOverrides(afterDuplicates, packageManager);

  return {
    success: true,
    packageManager,
    beforeCount,
    afterCount,
    consolidatedCount,
    remainingDuplicates,
    suggestedOverrides,
    commandsRun: commandsRunStrings
  };
}

async function isYarnClassic(rootDir: string): Promise<boolean> {
  try {
    const lockPath = path.join(rootDir, "yarn.lock");
    const content = await fs.readFile(lockPath, "utf8");
    return content.includes("yarn lockfile v1");
  } catch {
    return false;
  }
}

function buildSuggestedOverrides(
  duplicates: ReturnType<typeof findDuplicateDependencies> extends Promise<infer U> ? U : never,
  packageManager: string
): DedupeResult["suggestedOverrides"] {
  if (duplicates.length === 0) {
    return undefined;
  }

  const overrides: Record<string, string> = {};
  for (const d of duplicates) {
    const highestVersion = d.versions[d.versions.length - 1];
    if (highestVersion) {
      overrides[d.name] = highestVersion;
    }
  }

  if (packageManager === "npm") {
    return { npm: overrides };
  } else if (packageManager === "pnpm") {
    return { pnpm: overrides };
  } else {
    return { yarn: overrides };
  }
}

async function defaultRunCommand(
  command: string,
  args: string[],
  options: { cwd: string }
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: true
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
