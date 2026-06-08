import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface RuntimeTrace {
  version: "1.0";
  packages: string[];
  files: string[];
  startedAt: string;
  endedAt: string;
}

export interface RuntimeEvidence {
  tracePath: string;
  packages: string[];
  files: string[];
  packageCount: number;
  fileCount: number;
}

export interface RuntimeTraceRunResult {
  exitCode: number;
  outputPath: string;
  trace: RuntimeTrace | null;
}

export async function loadRuntimeTrace(
  tracePath: string
): Promise<RuntimeEvidence | null> {
  try {
    const raw = await fs.readFile(tracePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<RuntimeTrace>;
    const packages = normalizeStringList(parsed.packages);
    const files = normalizeStringList(parsed.files);

    if (packages.length === 0 && files.length === 0) {
      return null;
    }

    return {
      tracePath: path.resolve(tracePath),
      packages,
      files,
      packageCount: packages.length,
      fileCount: files.length
    };
  } catch {
    return null;
  }
}

export async function runRuntimeTrace(
  commandArgs: string[],
  options: { cwd: string; outputPath: string }
): Promise<RuntimeTraceRunResult> {
  if (commandArgs.length === 0) {
    throw new Error("Missing command after dep-brain trace --");
  }

  const resolvedOutput = path.resolve(options.cwd, options.outputPath);
  await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(options.cwd, ".depbrain-trace-"));
  const preloadPath = path.join(tempDir, "runtime-preload.cjs");
  const preloadOptionPath = preloadPath.replace(/\\/g, "/");
  await fs.writeFile(preloadPath, buildPreloadScript(), "utf8");

  const existingNodeOptions = process.env.NODE_OPTIONS?.trim();
  const nodeOptions = existingNodeOptions
    ? `${existingNodeOptions} --require "${preloadOptionPath}"`
    : `--require "${preloadOptionPath}"`;
  const exitCode = await spawnCommand(commandArgs, {
    cwd: options.cwd,
    env: {
      ...process.env,
      DEPBRAIN_RUNTIME_TRACE_OUT: resolvedOutput,
      NODE_OPTIONS: nodeOptions
    }
  });

  const evidence = await loadRuntimeTrace(resolvedOutput);
  await fs.rm(tempDir, { recursive: true, force: true });
  return {
    exitCode,
    outputPath: resolvedOutput,
    trace: evidence
      ? {
          version: "1.0",
          packages: evidence.packages,
          files: evidence.files,
          startedAt: "",
          endedAt: ""
        }
      : null
  };
}

function spawnCommand(
  commandArgs: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv }
): Promise<number> {
  return new Promise((resolve) => {
    const [command, ...args] = commandArgs;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: process.platform === "win32",
      stdio: "inherit"
    });

    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))]
    .sort((left, right) => left.localeCompare(right));
}

function buildPreloadScript(): string {
  return `
const Module = require("module");
const fs = require("fs");
const path = require("path");
const builtins = new Set(Module.builtinModules.concat(Module.builtinModules.map((name) => "node:" + name)));
const outputPath = process.env.DEPBRAIN_RUNTIME_TRACE_OUT;
const startedAt = new Date().toISOString();
const packages = new Set();
const files = new Set();

function normalizePackageName(request) {
  if (!request || request.startsWith(".") || request.startsWith("/") || request.startsWith("#") || builtins.has(request)) {
    return null;
  }
  if (request.startsWith("@")) {
    const parts = request.split("/");
    return parts[0] && parts[1] ? parts[0] + "/" + parts[1] : null;
  }
  return request.split("/")[0] || null;
}

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  const name = normalizePackageName(request);
  if (name) {
    packages.add(name);
  }
  try {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (typeof resolved === "string" && !builtins.has(resolved)) {
      files.add(path.resolve(resolved));
    }
  } catch {}
  return originalLoad.apply(this, arguments);
};

function writeTrace() {
  if (!outputPath) {
    return;
  }
  const payload = {
    version: "1.0",
    packages: Array.from(packages).sort(),
    files: Array.from(files).sort(),
    startedAt,
    endedAt: new Date().toISOString()
  };
  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + "\\n", "utf8");
  } catch {}
}

process.on("exit", writeTrace);
`;
}
