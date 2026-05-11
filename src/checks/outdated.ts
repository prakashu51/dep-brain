import type {
  OutdatedDependency,
  OutdatedDependencyAdvice,
  Recommendation
} from "../core/analyzer.js";
import type { DependencyGraph } from "../core/graph-builder.js";
import type { CheckResult } from "../core/types.js";
import {
  getLatestVersion,
  getPackageMetadata,
  type PackageMetadata
} from "../utils/npm-api.js";

export interface OutdatedOptions {
  resolveLatestVersion?: (name: string) => Promise<string | null>;
  resolvePackageMetadata?: (name: string) => Promise<PackageMetadata | null>;
  resolveReleaseNotesText?: (url: string) => Promise<string | null>;
}

export async function findOutdatedDependencies(
  graph: DependencyGraph,
  options: OutdatedOptions = {}
): Promise<OutdatedDependency[]> {
  const resolveLatestVersion = options.resolveLatestVersion;
  const resolvePackageMetadata = options.resolvePackageMetadata;
  const combined = {
    ...graph.dependencies,
    ...graph.devDependencies
  };

  const results = await mapWithConcurrency(
    Object.entries(combined),
    8,
    async ([name, current]) => {
      const normalized = normalizeVersion(current);
      const metadata =
        resolvePackageMetadata
          ? await resolvePackageMetadata(name)
          : resolveLatestVersion
            ? null
            : await getPackageMetadata(name);
      const latest =
        resolveLatestVersion
          ? await resolveLatestVersion(name)
          : metadata?.latestVersion ?? await getLatestVersion(name);

      if (!latest || latest === normalized) {
        return null;
      }

      const updateType = classifyUpdateType(normalized, latest);
      const advice = await buildAdvice(
        name,
        current,
        normalized,
        latest,
        updateType,
        metadata,
        options.resolveReleaseNotesText
      );

      return {
        name,
        current,
        latest,
        updateType,
        confidence: advice.risk === "high" ? 0.98 : 0.97,
        reasonCodes: buildReasonCodes(updateType, advice),
        explanation: buildExplanation(updateType, advice),
        advice,
        recommendation: buildOutdatedRecommendation(updateType, advice)
      };
    }
  );

  return results
    .filter((item): item is OutdatedDependency => item !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

function buildOutdatedRecommendation(
  updateType: "major" | "minor" | "patch" | "unknown",
  advice: OutdatedDependencyAdvice
): Recommendation {
  return {
    action: "upgrade",
    priority:
      advice.risk === "high"
        ? "high"
        : updateType === "major"
          ? "high"
          : updateType === "minor"
            ? "medium"
            : "low",
    safety:
      advice.risk === "high"
        ? "unknown"
        : updateType === "patch"
          ? "safe"
          : updateType === "minor"
            ? "caution"
            : "unknown",
    summary:
      advice.risk === "high"
        ? `Upgrade in steps toward ${advice.recommendedTarget}; review breaking signals first.`
        : advice.risk === "medium"
          ? `Upgrade toward ${advice.recommendedTarget} after reviewing release notes.`
          : `Upgrade toward ${advice.recommendedTarget}.`,
    reasons: [
      `Latest registry version is ${advice.latestEvaluatedVersion}.`,
      ...advice.signals.map((signal) => formatAdviceSignal(signal))
    ]
  };
}

export async function runOutdatedCheck(
  graph: DependencyGraph,
  options: OutdatedOptions = {}
): Promise<CheckResult> {
  const outdated = await findOutdatedDependencies(graph, options);

  return {
    name: "outdated",
    summary: `${outdated.length} outdated dependencies found`,
    issues: outdated.map((item) => ({
      id: `outdated:${item.name}`,
      message: `${item.name} ${item.current} -> ${item.latest}`,
      severity: item.advice.risk === "high" || item.updateType === "major" ? "critical" : "warning",
      confidence: item.confidence,
      reasonCodes: item.reasonCodes,
      explanation: item.explanation,
      meta: {
        name: item.name,
        current: item.current,
        latest: item.latest,
        updateType: item.updateType,
        advice: item.advice
      }
    }))
  };
}

async function buildAdvice(
  name: string,
  currentRange: string,
  normalizedCurrent: string,
  latest: string,
  updateType: "major" | "minor" | "patch" | "unknown",
  metadata: PackageMetadata | null,
  resolveReleaseNotesText?: (url: string) => Promise<string | null>
): Promise<OutdatedDependencyAdvice> {
  const versions = (metadata?.versions ?? []).filter((version) => parseVersion(version) !== null);
  const repositoryUrl = normalizeRepositoryUrl(metadata?.repository ?? null);
  const releaseNotes = buildReleaseNoteUrls(repositoryUrl, latest, versions);
  const currentParsed = parseVersion(normalizedCurrent);
  const latestParsed = parseVersion(latest);
  const signals: OutdatedDependencyAdvice["signals"] = [];
  let recommendedTarget = latest;
  let intermediateSteps: string[] = [];

  if (updateType === "major" && currentParsed && latestParsed) {
    const stableTarget = findHighestVersionInMajor(versions, currentParsed[0]);
    if (stableTarget && stableTarget !== normalizedCurrent && stableTarget !== latest) {
      recommendedTarget = stableTarget;
      intermediateSteps = [stableTarget, latest];
      signals.push("semver_major");
    } else {
      intermediateSteps = [latest];
      signals.push("semver_major");
    }
  } else if (updateType !== "unknown") {
    intermediateSteps = [latest];
  }

  let hasBreakingKeyword = false;
  if (resolveReleaseNotesText && releaseNotes.length > 0) {
    const notesText = await resolveReleaseNotesText(releaseNotes[0]);
    if (notesText && /\bBREAKING\b/i.test(notesText)) {
      hasBreakingKeyword = true;
      signals.push("breaking_keyword");
    }
  }

  if (releaseNotes.length === 0) {
    signals.push("missing_changelog");
  }

  const risk = hasBreakingKeyword || updateType === "major"
    ? "high"
    : updateType === "minor"
      ? "medium"
      : "low";

  return {
    risk,
    recommendedTarget,
    latestEvaluatedVersion: latest,
    intermediateSteps: intermediateSteps.length > 0 ? intermediateSteps : [latest],
    releaseNotes,
    signals: dedupeSignals(signals),
    currentRange
  };
}

function buildReasonCodes(
  updateType: "major" | "minor" | "patch" | "unknown",
  advice: OutdatedDependencyAdvice
): string[] {
  const codes = [
    "latest_registry_version_newer",
    `update_type_${updateType}`,
    `advice_risk_${advice.risk}`
  ];

  for (const signal of advice.signals) {
    codes.push(`advice_signal_${signal}`);
  }

  return codes;
}

function buildExplanation(
  updateType: "major" | "minor" | "patch" | "unknown",
  advice: OutdatedDependencyAdvice
): string[] {
  const explanation = [
    "The npm registry reports a newer published version than the one declared in this project.",
    `The change is classified as a ${updateType} update.`,
    `Recommended target is ${advice.recommendedTarget}.`
  ];

  if (advice.intermediateSteps.length > 1) {
    explanation.push(`Suggested upgrade path: ${advice.intermediateSteps.join(" -> ")}.`);
  }

  if (advice.releaseNotes.length > 0) {
    explanation.push(`Release notes available at ${advice.releaseNotes[0]}.`);
  }

  for (const signal of advice.signals) {
    explanation.push(formatAdviceSignal(signal));
  }

  return explanation;
}

function normalizeVersion(versionRange: string): string {
  return versionRange.trim().replace(/^[~^><=\s]+/, "");
}

function classifyUpdateType(
  currentVersion: string,
  latestVersion: string
): "major" | "minor" | "patch" | "unknown" {
  const current = parseVersion(currentVersion);
  const latest = parseVersion(latestVersion);

  if (!current || !latest) {
    return "unknown";
  }

  if (latest[0] !== current[0]) {
    return "major";
  }

  if (latest[1] !== current[1]) {
    return "minor";
  }

  if (latest[2] !== current[2]) {
    return "patch";
  }

  return "unknown";
}

function parseVersion(version: string): [number, number, number] | null {
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);

  if (!match) {
    return null;
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function normalizeRepositoryUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value
    .replace(/^git\+/, "")
    .replace(/^git:\/\/github\.com\//, "https://github.com/")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
}

function buildReleaseNoteUrls(
  repositoryUrl: string | null,
  latestVersion: string,
  versions: string[]
): string[] {
  if (!repositoryUrl) {
    return [];
  }

  const urls: string[] = [];
  if (/github\.com\//.test(repositoryUrl)) {
    urls.push(`${repositoryUrl}/releases/tag/v${latestVersion}`);
    urls.push(`${repositoryUrl}/releases`);
  } else {
    urls.push(repositoryUrl);
  }

  if (versions.length === 0 && urls.length === 0) {
    return [];
  }

  return Array.from(new Set(urls));
}

function findHighestVersionInMajor(
  versions: string[],
  major: number
): string | null {
  const matching = versions
    .map((version) => ({ version, parsed: parseVersion(version) }))
    .filter(
      (entry): entry is { version: string; parsed: [number, number, number] } =>
        entry.parsed !== null && entry.parsed[0] === major
    )
    .sort((left, right) => compareParsedVersions(right.parsed, left.parsed));

  return matching[0]?.version ?? null;
}

function compareParsedVersions(
  left: [number, number, number],
  right: [number, number, number]
): number {
  if (left[0] !== right[0]) {
    return left[0] - right[0];
  }
  if (left[1] !== right[1]) {
    return left[1] - right[1];
  }
  return left[2] - right[2];
}

function dedupeSignals(
  values: OutdatedDependencyAdvice["signals"]
): OutdatedDependencyAdvice["signals"] {
  return Array.from(new Set(values));
}

function formatAdviceSignal(signal: OutdatedDependencyAdvice["signals"][number]): string {
  switch (signal) {
    case "semver_major":
      return "Major version gap detected.";
    case "breaking_keyword":
      return "Release notes include BREAKING markers.";
    case "missing_changelog":
      return "Release notes were not discovered automatically.";
    default:
      return signal;
  }
}
