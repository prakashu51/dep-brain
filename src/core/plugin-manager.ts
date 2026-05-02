import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AnalysisResult } from "./analyzer.js";
import type { DepBrainConfig } from "../utils/config.js";

export interface ProjectContext {
  rootDir: string;
  config: DepBrainConfig;
}

export interface DepBrainPlugin {
  name: string;
  preScan?: (context: ProjectContext) => Promise<void> | void;
  postScan?: (result: AnalysisResult) => Promise<AnalysisResult | void> | AnalysisResult | void;
  reportHook?: (result: AnalysisResult) => Promise<Record<string, unknown> | void> | Record<string, unknown> | void;
  cliCommands?: (cli: unknown) => void;
}

export class PluginManager {
  private constructor(private readonly plugins: DepBrainPlugin[]) {}

  static async load(rootDir: string, config: DepBrainConfig): Promise<PluginManager> {
    const specs = [
      ...config.plugins.enabled.map((name) => `dep-brain-plugin-${name}`),
      ...config.plugins.paths
    ];
    const plugins: DepBrainPlugin[] = [];

    for (const spec of specs) {
      const plugin = await loadPlugin(rootDir, spec);
      if (plugin) {
        plugins.push(plugin);
      }
    }

    return new PluginManager(plugins);
  }

  async runPreScan(context: ProjectContext): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.preScan?.(context);
    }
  }

  async runPostScan(result: AnalysisResult): Promise<AnalysisResult> {
    let current = result;

    for (const plugin of this.plugins) {
      const next = await plugin.postScan?.(current);
      if (next) {
        current = next;
      }

      const reportSection = await plugin.reportHook?.(current);
      if (reportSection) {
        current.extensions[plugin.name] = {
          ...(asRecord(current.extensions[plugin.name]) ?? {}),
          ...reportSection
        };
      }
    }

    return current;
  }
}

async function loadPlugin(rootDir: string, spec: string): Promise<DepBrainPlugin | null> {
  try {
    const resolved = spec.startsWith(".") || path.isAbsolute(spec)
      ? path.resolve(rootDir, spec)
      : spec;
    const moduleUrl = path.isAbsolute(resolved) ? pathToFileURL(resolved).href : resolved;
    const mod = await import(moduleUrl);
    const exported = mod.default ?? mod.plugin ?? mod;
    const candidate = typeof exported === "function" ? new exported() : exported;

    return isPlugin(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function isPlugin(value: unknown): value is DepBrainPlugin {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as DepBrainPlugin).name === "string"
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
