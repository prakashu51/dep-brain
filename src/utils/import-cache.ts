import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface ScanCacheEntry {
  hash: string;
  imports: string[];
}

export type ScanCache = Record<string, ScanCacheEntry>;

export function getHash(content: string): string {
  return crypto.createHash("sha1").update(content).digest("hex");
}

export async function loadScanCache(rootDir: string): Promise<ScanCache> {
  const cachePath = path.join(rootDir, ".depbrain", "scan-cache.json");
  try {
    const raw = await fs.readFile(cachePath, "utf8");
    return JSON.parse(raw) as ScanCache;
  } catch {
    return {};
  }
}

export async function saveScanCache(rootDir: string, cache: ScanCache): Promise<void> {
  const cachePath = path.join(rootDir, ".depbrain", "scan-cache.json");
  try {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write scan-cache.json:", err);
  }
}
