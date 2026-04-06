#!/usr/bin/env node

import { analyzeProject } from "./core/analyzer.js";
import { renderConsoleReport } from "./reporters/console.js";
import { renderJsonReport } from "./reporters/json.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? "analyze";
  const flags = new Set(args.filter((value) => value.startsWith("--")));
  const targetPath = args.find((value, index) => {
    if (index === 0 || value.startsWith("--")) {
      return false;
    }

    return true;
  }) ?? process.cwd();

  if (command !== "analyze") {
    console.error(`Unknown command: ${command}`);
    console.error("Usage: dep-brain analyze [path] [--json]");
    process.exitCode = 1;
    return;
  }

  const result = await analyzeProject({ rootDir: targetPath });
  console.log(
    flags.has("--json") ? renderJsonReport(result) : renderConsoleReport(result)
  );
}

void main();
