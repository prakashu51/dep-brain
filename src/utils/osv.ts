export type OsvSeverity = "low" | "medium" | "high" | "critical" | "unknown";

export interface OsvVulnerability {
  id: string;
  severity: OsvSeverity;
  summary: string;
  affectedRanges: string[];
  fixedVersions: string[];
}

const osvCache = new Map<string, Promise<OsvVulnerability[]>>();

export async function getOsvVulnerabilities(
  name: string
): Promise<OsvVulnerability[]> {
  const existing = osvCache.get(name);
  if (existing) {
    return existing;
  }

  const request = fetchOsvVulnerabilities(name);
  osvCache.set(name, request);
  return request;
}

async function fetchOsvVulnerabilities(
  name: string
): Promise<OsvVulnerability[]> {
  try {
    const response = await fetch("https://api.osv.dev/v1/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        package: {
          ecosystem: "npm",
          name
        }
      }),
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { vulns?: unknown[] };
    return normalizeOsvVulnerabilities(payload.vulns);
  } catch {
    return [];
  }
}

function normalizeOsvVulnerabilities(value: unknown): OsvVulnerability[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeOsvVulnerability(entry))
    .filter((entry): entry is OsvVulnerability => entry !== null);
}

function normalizeOsvVulnerability(value: unknown): OsvVulnerability | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const vuln = value as {
    id?: unknown;
    summary?: unknown;
    severity?: Array<{ type?: unknown; score?: unknown }>;
    affected?: Array<{
      ranges?: Array<{ events?: Array<{ introduced?: unknown; fixed?: unknown }> }>;
    }>;
  };

  if (typeof vuln.id !== "string") {
    return null;
  }

  const affectedRanges: string[] = [];
  const fixedVersions: string[] = [];
  for (const affected of vuln.affected ?? []) {
    for (const range of affected.ranges ?? []) {
      const introduced = range.events?.find((event) => typeof event.introduced === "string");
      const fixed = range.events?.find((event) => typeof event.fixed === "string");
      if (typeof introduced?.introduced === "string" || typeof fixed?.fixed === "string") {
        affectedRanges.push(
          `${typeof introduced?.introduced === "string" ? introduced.introduced : "0"} - ${typeof fixed?.fixed === "string" ? fixed.fixed : "unfixed"}`
        );
      }
      if (typeof fixed?.fixed === "string") {
        fixedVersions.push(fixed.fixed);
      }
    }
  }

  return {
    id: vuln.id,
    summary: typeof vuln.summary === "string" ? vuln.summary : "",
    severity: normalizeSeverity(vuln.severity),
    affectedRanges: dedupeStrings(affectedRanges),
    fixedVersions: dedupeStrings(fixedVersions)
  };
}

function normalizeSeverity(
  value: Array<{ type?: unknown; score?: unknown }> | undefined
): OsvSeverity {
  const scores = value ?? [];
  for (const item of scores) {
    if (typeof item.score !== "string") {
      continue;
    }
    const upperScore = item.score.toUpperCase();
    if (upperScore.includes("CRITICAL")) {
      return "critical";
    }
    if (upperScore.includes("HIGH")) {
      return "high";
    }
    if (upperScore.includes("MEDIUM") || upperScore.includes("MODERATE")) {
      return "medium";
    }
    if (upperScore.includes("LOW")) {
      return "low";
    }
  }

  return "unknown";
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
