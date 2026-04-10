#!/usr/bin/env node

import { analyzeProject } from "./core/analyzer.js";
import { renderConsoleReport } from "./reporters/console.js";
import { renderJsonReport } from "./reporters/json.js";
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
    if (command === "config") {
      if (!(await hasPackageJson(targetPath))) {
        console.error(`No package.json found at ${targetPath}`);
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

    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (!(await hasPackageJson(targetPath))) {
    console.error(`No package.json found at ${targetPath}`);
    process.exitCode = 1;
    return;
  }

  try {
    const cliConfig = buildCliConfig(flags, optionValues);
    const result = await analyzeProject({
      rootDir: targetPath,
      configPath: optionValues.get("--config"),
      config: cliConfig
    });
    const output = flags.has("--json")
      ? renderJsonReport(result)
      : renderConsoleReport(result);
    if (!output || output.trim().length === 0) {
      console.log(renderJsonReport(result));
    } else {
      console.log(output);
    }

    if (!result.policy.passed) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("Analysis failed.");
    console.error(error);
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
    "  dep-brain analyze [path] [--json] [--config path] [--min-score n] [--fail-on-risks] [--fail-on-outdated] [--fail-on-unused] [--fail-on-duplicates]"
  );
  console.log("  dep-brain config [path] [--config path]");
  console.log("  dep-brain help");
  console.log("  dep-brain --version");
  console.log("");
  console.log("Options:");
  console.log("  --json              Output JSON for analysis");
  console.log("  --config <path>     Path to depbrain.config.json");
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
