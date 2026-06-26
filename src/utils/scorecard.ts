import { promises as fs } from "node:fs";
import path from "node:path";

export interface ScorecardInfo {
  score: number;
  maintainedScore: number | null;
}

const CACHE_DIR = path.join(".depbrain", "scorecard-cache");
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export function parseGithubUrl(repoUrl: string | null): { owner: string; repo: string } | null {
  if (!repoUrl) return null;
  const cleaned = repoUrl
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^github:/, "")
    .replace(/.*github\.com[\/:]/, "github.com/");

  const match = cleaned.match(/(?:github\.com\/|^)([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  return null;
}

export async function getScorecardInfo(
  rootDir: string,
  repoUrl: string | null
): Promise<ScorecardInfo | null> {
  const parsed = parseGithubUrl(repoUrl);
  if (!parsed) return null;

  const { owner, repo } = parsed;
  const cacheFile = path.join(rootDir, CACHE_DIR, `${encodeURIComponent(owner)}-${encodeURIComponent(repo)}.json`);

  // 1. Try local cache
  try {
    const stat = await fs.stat(cacheFile);
    if (Date.now() - stat.mtime.getTime() < CACHE_TTL) {
      const raw = await fs.readFile(cacheFile, "utf8");
      return JSON.parse(raw) as ScorecardInfo;
    }
  } catch {}

  // 2. Fetch from API
  try {
    const response = await fetch(`https://api.scorecard.dev/projects/github.com/${owner}/${repo}`, {
      signal: AbortSignal.timeout(5000)
    });
    if (response.ok) {
      const data = (await response.json()) as any;
      const score = typeof data.score === "number" ? data.score : 0;
      const checks = Array.isArray(data.checks) ? data.checks : [];
      const maintainedCheck = checks.find((c: any) => c.name === "Maintained");
      const maintainedScore = maintainedCheck && typeof maintainedCheck.score === "number" ? maintainedCheck.score : null;

      const info: ScorecardInfo = { score, maintainedScore };
      await fs.mkdir(path.dirname(cacheFile), { recursive: true });
      await fs.writeFile(cacheFile, JSON.stringify(info, null, 2), "utf8");
      return info;
    }
  } catch {}

  // 3. Fallback to expired cache
  try {
    const raw = await fs.readFile(cacheFile, "utf8");
    return JSON.parse(raw) as ScorecardInfo;
  } catch {}

  return null;
}
