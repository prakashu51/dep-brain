export interface PackageMetadata {
  latestVersion: string | null;
  repository: string | null;
  downloads: number | null;
  daysSincePublish: number | null;
}

const metadataCache = new Map<string, Promise<PackageMetadata | null>>();

export async function getLatestVersion(name: string): Promise<string | null> {
  const metadata = await getPackageMetadata(name);
  return metadata?.latestVersion ?? null;
}

export async function getPackageMetadata(
  name: string
): Promise<PackageMetadata | null> {
  const existing = metadataCache.get(name);
  if (existing) {
    return existing;
  }

  const request = fetchPackageMetadata(name);
  metadataCache.set(name, request);
  return request;
}

async function fetchPackageMetadata(name: string): Promise<PackageMetadata | null> {
  try {
    const [packageResponse, downloadsResponse] = await Promise.all([
      fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
        signal: AbortSignal.timeout(5000)
      }),
      fetch(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`, {
        signal: AbortSignal.timeout(5000)
      })
    ]);

    if (!packageResponse.ok) {
      return null;
    }

    const packageJson = (await packageResponse.json()) as {
      "dist-tags"?: { latest?: string };
      repository?: string | { url?: string };
      time?: Record<string, string>;
    };

    const downloadsJson = downloadsResponse.ok
      ? ((await downloadsResponse.json()) as { downloads?: number })
      : {};

    const latestVersion = packageJson["dist-tags"]?.latest ?? null;
    const latestPublishedAt =
      latestVersion && packageJson.time?.[latestVersion]
        ? new Date(packageJson.time[latestVersion])
        : null;

    const daysSincePublish =
      latestPublishedAt === null
        ? null
        : Math.floor(
            (Date.now() - latestPublishedAt.getTime()) / (1000 * 60 * 60 * 24)
          );

    const repository =
      typeof packageJson.repository === "string"
        ? packageJson.repository
        : packageJson.repository?.url ?? null;

    return {
      latestVersion,
      repository,
      downloads: downloadsJson.downloads ?? null,
      daysSincePublish
    };
  } catch {
    return null;
  }
}
