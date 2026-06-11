import { promises as fs } from "node:fs";
import path from "node:path";
import type { OsvVulnerability } from "./osv.js";

const CACHE_DIR = path.join(".depbrain", "osv-cache");
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export interface OsvCacheEntry {
  timestamp: string;
  name: string;
  vulnerabilities: OsvVulnerability[];
}

function getCachePath(rootDir: string, name: string): string {
  // Safe filename encoding
  const safeName = encodeURIComponent(name);
  return path.join(rootDir, CACHE_DIR, `${safeName}.json`);
}

export async function getCachedVulnerabilities(
  rootDir: string,
  name: string
): Promise<{ vulnerabilities: OsvVulnerability[]; isFresh: boolean } | null> {
  const cachePath = getCachePath(rootDir, name);
  try {
    const stat = await fs.stat(cachePath);
    const raw = await fs.readFile(cachePath, "utf8");
    const entry = JSON.parse(raw) as OsvCacheEntry;

    const isFresh = Date.now() - stat.mtime.getTime() < CACHE_TTL;
    return {
      vulnerabilities: entry.vulnerabilities,
      isFresh
    };
  } catch {
    return null;
  }
}

export async function setCachedVulnerabilities(
  rootDir: string,
  name: string,
  vulnerabilities: OsvVulnerability[]
): Promise<void> {
  const cachePath = getCachePath(rootDir, name);
  try {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    const entry: OsvCacheEntry = {
      timestamp: new Date().toISOString(),
      name,
      vulnerabilities
    };
    await fs.writeFile(cachePath, JSON.stringify(entry, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write OSV cache:", err);
  }
}
