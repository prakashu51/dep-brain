import type { AnalysisResult, TopIssue } from "../core/analyzer.js";
import type { DepBrainConfig } from "./config.js";

export type NotificationChannel = "slack" | "discord";

export interface NotificationSendInput {
  channel: NotificationChannel;
  webhookUrl: string;
  payload: unknown;
}

export interface NotificationResult {
  channel: NotificationChannel;
  status: "sent" | "skipped" | "failed";
  reason?: string;
}

export type NotificationSender = (
  input: NotificationSendInput
) => Promise<void>;

export async function sendConfiguredNotifications(
  result: AnalysisResult,
  options: {
    env?: Record<string, string | undefined>;
    sender?: NotificationSender;
  } = {}
): Promise<NotificationResult[]> {
  const config = result.config.notifications;
  if (!shouldSendNotification(result, config)) {
    return [
      {
        channel: "slack",
        status: "skipped",
        reason: "notification trigger did not match analysis result"
      },
      {
        channel: "discord",
        status: "skipped",
        reason: "notification trigger did not match analysis result"
      }
    ];
  }

  const env = options.env ?? process.env;
  const sender = options.sender ?? postWebhook;
  const message = renderNotificationMessage(result);
  const targets = [
    {
      channel: "slack" as const,
      webhookUrl: env[config.slackWebhookEnv],
      payload: { text: message }
    },
    {
      channel: "discord" as const,
      webhookUrl: env[config.discordWebhookEnv],
      payload: { content: message }
    }
  ];
  const results: NotificationResult[] = [];

  for (const target of targets) {
    if (!target.webhookUrl) {
      results.push({
        channel: target.channel,
        status: "skipped",
        reason: `${target.channel} webhook env is not set`
      });
      continue;
    }

    try {
      await sender({
        channel: target.channel,
        webhookUrl: target.webhookUrl,
        payload: target.payload
      });
      results.push({ channel: target.channel, status: "sent" });
    } catch (error) {
      results.push({
        channel: target.channel,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return results;
}

export function shouldSendNotification(
  result: AnalysisResult,
  config: DepBrainConfig["notifications"]
): boolean {
  if (!config.enabled || config.on === "never") {
    return false;
  }

  return config.on === "always" || !result.policy.passed;
}

export function renderNotificationMessage(result: AnalysisResult): string {
  const status = result.policy.passed ? "PASS" : "FAIL";
  const counts = [
    `duplicates ${result.duplicates.length}`,
    `unused ${result.unused.length}`,
    `outdated ${result.outdated.length}`,
    `risks ${result.risks.length}`
  ].join(", ");
  const lines = [
    `dep-brain ${status}: score ${result.score}/100`,
    `path: ${result.rootDir}`,
    `findings: ${counts}`
  ];
  const upgradePriorities = buildUpgradePriorityText(result);

  if (result.policy.reasons.length > 0) {
    lines.push(`policy: ${result.policy.reasons.join("; ")}`);
  }

  if (result.newFindings) {
    lines.push(
      `new: duplicates ${result.newFindings.counts.duplicates}, unused ${result.newFindings.counts.unused}, outdated ${result.newFindings.counts.outdated}, risks ${result.newFindings.counts.risks}`
    );
  }

  if (result.topIssues.length > 0) {
    lines.push("top issues:");
    for (const issue of result.topIssues.slice(0, 3)) {
      lines.push(`- ${formatTopIssue(issue)}`);
    }
  }

  if (upgradePriorities) {
    lines.push(`upgrades: ${upgradePriorities}`);
  }

  return lines.join("\n");
}

async function postWebhook(input: NotificationSendInput): Promise<void> {
  const response = await fetch(input.webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input.payload)
  });

  if (!response.ok) {
    throw new Error(
      `${input.channel} webhook failed with HTTP ${response.status}`
    );
  }
}

function formatTopIssue(issue: TopIssue): string {
  const owner = issue.package ? ` [${issue.package}]` : "";
  return `[${issue.priority}] ${issue.kind} ${issue.name}${owner}: ${issue.summary}`;
}

function buildUpgradePriorityText(result: AnalysisResult): string {
  const counts = result.outdated.reduce(
    (acc, item) => {
      acc[item.advice.risk] += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );

  return [`high ${counts.high}`, `medium ${counts.medium}`, `low ${counts.low}`]
    .filter((entry) => !entry.endsWith(" 0"))
    .join(", ");
}
