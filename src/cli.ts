#!/usr/bin/env node

import { analyzeProject } from "./core/analyzer.js";
import { renderConsoleReport } from "./reporters/console.js";

async function main(): Promise<void> {
  const [, , command = "analyze", targetPath = process.cwd()] = process.argv;

  if (command !== "analyze") {
    console.error(`Unknown command: ${command}`);
    console.error("Usage: dep-brain analyze [path]");
    process.exitCode = 1;
    return;
  }

  const result = await analyzeProject({ rootDir: targetPath });
  console.log(renderConsoleReport(result));
}

void main();
