#!/usr/bin/env node

import { analyzeProject } from "./core/analyzer.js";
import type { DepBrainBaseline } from "./core/analyzer.js";
import { renderConsoleReport } from "./reporters/console.js";
import { renderJsonReport } from "./reporters/json.js";
import { renderMarkdownReport } from "./reporters/markdown.js";
import { renderSarifReport } from "./reporters/sarif.js";
import type { DepBrainConfig, DepBrainConfigOverrides } from "./utils/config.js";
import { promises as fs } from "node:fs";
import path from "node:path";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const firstArg = args[0];
  const command =
    firstArg && !firstArg.startsWith("--") ? firstArg : "analyze";
  const optionValues = new Map<string, string>();
  const flags = new Set<string>();
  const positionals: string[] = [];

  const startIndex = firstArg && !firstArg.startsWith("--") ? 1 : 0;

  for (let index = startIndex; index < args.length; index += 1) {
    const value = args[index];
    if (!value?.startsWith("--")) {
      positionals.push(value);
      continue;
    }

    const nextValue = args[index + 1];
    if (nextValue && !nextValue.startsWith("--")) {
      optionValues.set(value, nextValue);
      index += 1;
      continue;
    }

    flags.add(value);
  }

  const targetPath = positionals[0] ?? process.cwd();
  const showHelp = flags.has("--help") || command === "help";

  if (showHelp) {
    printHelp();
    return;
  }

  if (flags.has("--version")) {
    const version = await loadPackageVersion();
    console.log(version ?? "unknown");
    return;
  }

  if (command !== "analyze") {
    if (command === "report") {
      const fromPath = optionValues.get("--from") ?? positionals[0];
      if (!fromPath) {
        console.error("Missing --from <file> for report");
        printHelp();
        process.exitCode = 1;
        return;
      }

      try {
        const resolvedFrom = resolveUserPath(fromPath);
        const raw = await fs.readFile(resolvedFrom, "utf8");
        const reportData = JSON.parse(raw);
        const output = flags.has("--top")
          ? renderTopIssuesReport(reportData)
          : flags.has("--json")
            ? JSON.stringify(reportData, null, 2)
            : flags.has("--sarif")
              ? renderSarifReport(reportData)
            : renderMarkdownReport(reportData);
        await writeOutput(output, optionValues.get("--out"));
        return;
      } catch (error) {
        console.error("Failed to render report.");
        console.error(error);
        process.exitCode = 1;
        return;
      }
    }

    if (command === "config") {
      if (!(await hasPackageJson(targetPath))) {
        console.error(
          `No package.json found at ${sanitizeForLog(targetPath)}`
        );
        process.exitCode = 1;
        return;
      }

      try {
        const config = await analyzeProject({
          rootDir: targetPath,
          configPath: optionValues.get("--config"),
          config: buildCliConfig(flags, optionValues)
        });

        console.log(JSON.stringify(config.config, null, 2));
        return;
      } catch (error) {
        console.error("Failed to resolve config.");
        console.error(error);
        process.exitCode = 1;
        return;
      }
    }

    console.error(`Unknown command: ${sanitizeForLog(command)}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (!(await hasPackageJson(targetPath))) {
    console.error(`No package.json found at ${sanitizeForLog(targetPath)}`);
    process.exitCode = 1;
    return;
  }

  try {
    const cliConfig = buildCliConfig(flags, optionValues);
    const baseline = await loadBaseline(optionValues.get("--baseline"));
    const result = await analyzeProject({
      rootDir: targetPath,
      configPath: optionValues.get("--config"),
      config: cliConfig,
      baseline
    });

    let output: string;
    if (flags.has("--json")) {
      output = renderJsonReport(result);
    } else if (flags.has("--sarif")) {
      output = renderSarifReport(result);
    } else if (flags.has("--top")) {
      output = renderTopIssuesReport(result);
    } else if (flags.has("--md")) {
      output = renderMarkdownReport(result);
    } else {
      const consoleOutput = renderConsoleReport(result);
      output =
        !consoleOutput || consoleOutput.trim().length === 0
          ? renderJsonReport(result)
          : consoleOutput;
    }

    await writeOutput(output, optionValues.get("--out"));

    if (!result.policy.passed) {
      process.exitCode = 1;
    }
  } catch (error) {
    if (flags.has("--json")) {
      const payload = {
        error: "Analysis failed",
        message: error instanceof Error ? error.message : String(error)
      };
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      console.error("Analysis failed.");
      console.error(error);
    }
    process.exitCode = 1;
  }
}

void main();

function buildCliConfig(
  flags: Set<string>,
  optionValues: Map<string, string>
): DepBrainConfigOverrides {
  const minScore = optionValues.get("--min-score");
  const policy: Partial<DepBrainConfig["policy"]> = {};

  if (minScore) {
    policy.minScore = Number(minScore);
  }

  if (flags.has("--fail-on-duplicates")) {
    policy.failOnDuplicates = true;
  }

  if (flags.has("--fail-on-outdated")) {
    policy.failOnOutdated = true;
  }

  if (flags.has("--fail-on-risks")) {
    policy.failOnRisks = true;
  }

  if (flags.has("--fail-on-unused")) {
    policy.failOnUnused = true;
  }

  return {
    policy
  };
}

async function hasPackageJson(targetPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(targetPath, "package.json"));
    return true;
  } catch {
    return false;
  }
}

function printHelp(): void {
  console.log("Dependency Brain");
  console.log("");
  console.log("Usage:");
  console.log(
    "  dep-brain analyze [path] [--json] [--md] [--sarif] [--top] [--out path] [--config path] [--baseline path] [--min-score n] [--fail-on-risks]"
  );
  console.log("  dep-brain report --from <file> [--md] [--json] [--sarif] [--top] [--out path]");
  console.log("  dep-brain config [path] [--config path]");
  console.log("  dep-brain help");
  console.log("  dep-brain --version");
  console.log("");
  console.log("Options:");
  console.log("  --json              Output JSON for analysis");
  console.log("  --md                Output Markdown report");
  console.log("  --sarif             Output SARIF format for Code Scanning");
  console.log("  --top               Output the ranked top issues only");
  console.log("  --config <path>     Path to depbrain.config.json");
  console.log("  --baseline <path>   Ignore findings already present in a baseline JSON report");
  console.log("  --from <file>       Read analysis JSON from file");
  console.log("  --out <path>        Write output to a file");
  console.log("  --min-score <n>     Minimum score required to pass");
  console.log("  --fail-on-risks     Fail when risky dependencies exist");
  console.log("  --fail-on-outdated  Fail when outdated dependencies exist");
  console.log("  --fail-on-unused    Fail when unused dependencies exist");
  console.log("  --fail-on-duplicates Fail when duplicates exist");
  console.log("  --help              Show this help output");
  console.log("  --version           Show CLI version");
}

async function loadPackageVersion(): Promise<string | null> {
  try {
    const pkgPath = new URL("../package.json", import.meta.url);
    const content = await fs.readFile(pkgPath, "utf8");
    const pkg = JSON.parse(content) as { version?: string };
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

async function loadBaseline(baselinePath?: string): Promise<DepBrainBaseline | undefined> {
  if (!baselinePath) {
    return undefined;
  }

  const resolved = resolveUserPath(baselinePath);
  const raw = await fs.readFile(resolved, "utf8");
  const parsed = JSON.parse(raw) as DepBrainBaseline;
  return {
    duplicates: Array.isArray(parsed.duplicates) ? parsed.duplicates : [],
    unused: Array.isArray(parsed.unused) ? parsed.unused : [],
    outdated: Array.isArray(parsed.outdated) ? parsed.outdated : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks : []
  };
}

async function writeOutput(output: string, outPath?: string): Promise<void> {
  if (outPath) {
    const resolved = resolveUserPath(outPath);
    await fs.writeFile(resolved, `${output}\n`, "utf8");
    return;
  }

  process.stdout.write(`${output}\n`);
}

function sanitizeForLog(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function resolveUserPath(value: string): string {
  return path.resolve(process.cwd(), value);
}

function renderTopIssuesReport(result: Awaited<ReturnType<typeof analyzeProject>>): string {
  const lines: string[] = [];
  lines.push("Top Issues");
  lines.push("");

  if (!Array.isArray(result.topIssues) || result.topIssues.length === 0) {
    lines.push("No actionable issues found.");
    return lines.join("\n");
  }

  for (const [index, item] of result.topIssues.entries()) {
    lines.push(
      `${index + 1}. [${item.priority.toUpperCase()}] ${item.kind} ${item.name}${item.package ? ` [${item.package}]` : ""}`
    );
    lines.push(`   Confidence: ${Math.round(item.confidence * 100)}%`);
    lines.push(`   Next: ${item.recommendation.summary}`);
  }

  return lines.join("\n");
}
