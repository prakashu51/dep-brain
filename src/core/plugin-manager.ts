import { promises as fs } from "node:fs";
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

export interface PluginDiagnostic {
  spec: string;
  code: "load_failed" | "invalid_plugin" | "hook_failed";
  message: string;
  plugin?: string;
  hook?: "preScan" | "postScan" | "reportHook";
}

export class PluginManager {
  private constructor(
    private readonly plugins: DepBrainPlugin[],
    private readonly diagnostics: PluginDiagnostic[]
  ) {}

  static async load(rootDir: string, config: DepBrainConfig): Promise<PluginManager> {
    const specs = [
      ...config.plugins.enabled.map((name) => `dep-brain-plugin-${name}`),
      ...config.plugins.paths
    ];
    const plugins: DepBrainPlugin[] = [];
    const diagnostics: PluginDiagnostic[] = [];

    for (const spec of specs) {
      const result = await loadPlugin(rootDir, spec);
      if (result.plugin) {
        plugins.push(result.plugin);
      }
      if (result.diagnostic) {
        diagnostics.push(result.diagnostic);
      }
    }

    return new PluginManager(plugins, diagnostics);
  }

  async runPreScan(context: ProjectContext): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        await plugin.preScan?.(context);
      } catch (error) {
        this.diagnostics.push(buildHookDiagnostic(plugin.name, "preScan", error));
      }
    }
  }

  async runPostScan(result: AnalysisResult): Promise<AnalysisResult> {
    let current = result;

    for (const plugin of this.plugins) {
      try {
        const next = await plugin.postScan?.(current);
        if (next) {
          current = next;
        }
      } catch (error) {
        this.diagnostics.push(buildHookDiagnostic(plugin.name, "postScan", error));
      }

      try {
        const reportSection = await plugin.reportHook?.(current);
        if (reportSection) {
          current.extensions[plugin.name] = {
            ...(asRecord(current.extensions[plugin.name]) ?? {}),
            ...reportSection
          };
        }
      } catch (error) {
        this.diagnostics.push(buildHookDiagnostic(plugin.name, "reportHook", error));
      }
    }

    return this.attachDiagnostics(current);
  }

  private attachDiagnostics(result: AnalysisResult): AnalysisResult {
    if (this.diagnostics.length === 0) {
      return result;
    }

    result.extensions.depBrain = {
      ...(asRecord(result.extensions.depBrain) ?? {}),
      plugins: this.diagnostics
    };

    return result;
  }
}

async function loadPlugin(
  rootDir: string,
  spec: string
): Promise<{ plugin: DepBrainPlugin | null; diagnostic?: PluginDiagnostic }> {
  const builtIn = getBuiltInPlugin(spec);
  if (builtIn) {
    return { plugin: builtIn };
  }

  try {
    const resolved = spec.startsWith(".") || path.isAbsolute(spec)
      ? path.resolve(rootDir, spec)
      : spec;
    const moduleUrl = path.isAbsolute(resolved) ? pathToFileURL(resolved).href : resolved;
    const mod = await import(moduleUrl);
    const exported = mod.default ?? mod.plugin ?? mod;
    const candidate = typeof exported === "function" ? new exported() : exported;

    if (isPlugin(candidate)) {
      return { plugin: candidate };
    }

    return {
      plugin: null,
      diagnostic: {
        spec,
        code: "invalid_plugin",
        message: "Plugin must export an object with a string name."
      }
    };
  } catch (error) {
    return {
      plugin: null,
      diagnostic: {
        spec,
        code: "load_failed",
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

function getBuiltInPlugin(spec: string): DepBrainPlugin | null {
  if (spec !== "license" && spec !== "dep-brain-plugin-license") {
    return null;
  }

  return {
    name: "license",
    reportHook: async (result) => {
      const packages = await collectLicensePackages(result.rootDir);
      const licenses = packages.reduce<Record<string, number>>((acc, item) => {
        acc[item.license] = (acc[item.license] ?? 0) + 1;
        return acc;
      }, {});

      return {
        summary: {
          total: packages.length,
          unknown: packages.filter((item) => item.license === "UNKNOWN").length,
          licenses
        },
        packages
      };
    }
  };
}

async function collectLicensePackages(rootDir: string): Promise<Array<{ name: string; license: string }>> {
  const raw = await fs.readFile(path.join(rootDir, "package.json"), "utf8");
  const pkg = JSON.parse(raw) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const names = Object.keys({
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {})
  }).sort();

  return Promise.all(
    names.map(async (name) => ({
      name,
      license: await readPackageLicense(rootDir, name)
    }))
  );
}

async function readPackageLicense(rootDir: string, name: string): Promise<string> {
  try {
    const raw = await fs.readFile(
      path.join(rootDir, "node_modules", name, "package.json"),
      "utf8"
    );
    const pkg = JSON.parse(raw) as { license?: unknown; licenses?: unknown };
    if (typeof pkg.license === "string" && pkg.license.trim().length > 0) {
      return pkg.license;
    }
    if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
      const licenses = pkg.licenses
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }
          if (item && typeof item === "object" && typeof (item as { type?: unknown }).type === "string") {
            return (item as { type: string }).type;
          }
          return null;
        })
        .filter((item): item is string => Boolean(item));

      return licenses.length > 0 ? licenses.join(", ") : "UNKNOWN";
    }
  } catch {
    return "UNKNOWN";
  }

  return "UNKNOWN";
}

function buildHookDiagnostic(
  plugin: string,
  hook: PluginDiagnostic["hook"],
  error: unknown
): PluginDiagnostic {
  return {
    spec: plugin,
    plugin,
    hook,
    code: "hook_failed",
    message: error instanceof Error ? error.message : String(error)
  };
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
