#!/usr/bin/env node

import { analyzeProject } from "./core/analyzer.js";
import { renderConsoleReport } from "./reporters/console.js";
import { renderJsonReport } from "./reporters/json.js";
import type { DepBrainConfig, DepBrainConfigOverrides } from "./utils/config.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? "analyze";
  const optionValues = new Map<string, string>();
  const flags = new Set<string>();
  const positionals: string[] = [];

  for (let index = 1; index < args.length; index += 1) {
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

  if (command !== "analyze") {
    if (command === "config") {
      const config = await analyzeProject({
        rootDir: targetPath,
        configPath: optionValues.get("--config"),
        config: buildCliConfig(flags, optionValues)
      });

      console.log(JSON.stringify(config.config, null, 2));
      return;
    }

    console.error(`Unknown command: ${command}`);
    console.error(
      "Usage: dep-brain analyze [path] [--json] [--config path] [--min-score n] [--fail-on-risks] [--fail-on-outdated] [--fail-on-unused] [--fail-on-duplicates]"
    );
    console.error("       dep-brain config [path] [--config path]");
    process.exitCode = 1;
    return;
  }

  const cliConfig = buildCliConfig(flags, optionValues);
  const result = await analyzeProject({
    rootDir: targetPath,
    configPath: optionValues.get("--config"),
    config: cliConfig
  });
  console.log(
    flags.has("--json") ? renderJsonReport(result) : renderConsoleReport(result)
  );

  if (!result.policy.passed) {
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
