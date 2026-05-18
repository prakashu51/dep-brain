import { promises as fs } from "node:fs";
import { PR_COMMENT_MARKER } from "../reporters/pr-comment.js";

export type PrCommentTrigger = "always" | "failure" | "new-findings";

export interface GitHubPrCommentInput {
  body: string;
  env?: Record<string, string | undefined>;
  request?: GitHubRequest;
}

export interface GitHubPrCommentResult {
  status: "created" | "updated" | "skipped";
  reason?: string;
}

export type GitHubRequest = (
  url: string,
  init: {
    method: "GET" | "POST" | "PATCH";
    headers: Record<string, string>;
    body?: string;
  }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

interface PullRequestEvent {
  number?: number;
  pull_request?: {
    number?: number;
  };
}

interface GitHubComment {
  id: number;
  body?: string;
}

export async function upsertGitHubPrComment(
  input: GitHubPrCommentInput
): Promise<GitHubPrCommentResult> {
  const env = input.env ?? process.env;
  const token = env.GITHUB_TOKEN;
  const repository = env.GITHUB_REPOSITORY;
  const eventPath = env.GITHUB_EVENT_PATH;

  if (!token) {
    return { status: "skipped", reason: "GITHUB_TOKEN is not set" };
  }

  if (!repository) {
    return { status: "skipped", reason: "GITHUB_REPOSITORY is not set" };
  }

  if (!eventPath) {
    return { status: "skipped", reason: "GITHUB_EVENT_PATH is not set" };
  }

  const pullNumber = await readPullNumber(eventPath);
  if (!pullNumber) {
    return { status: "skipped", reason: "pull request event not found" };
  }

  const request = input.request ?? defaultGitHubRequest;
  const commentsUrl = `https://api.github.com/repos/${repository}/issues/${pullNumber}/comments`;
  const headers = buildHeaders(token);
  const existingResponse = await request(commentsUrl, {
    method: "GET",
    headers
  });

  if (!existingResponse.ok) {
    return {
      status: "skipped",
      reason: `failed to list comments: HTTP ${existingResponse.status}`
    };
  }

  const comments = normalizeComments(await existingResponse.json());
  const existing = comments.find((comment) =>
    typeof comment.body === "string" && comment.body.includes(PR_COMMENT_MARKER)
  );

  if (existing) {
    const updateResponse = await request(
      `https://api.github.com/repos/${repository}/issues/comments/${existing.id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ body: input.body })
      }
    );
    return updateResponse.ok
      ? { status: "updated" }
      : {
          status: "skipped",
          reason: `failed to update comment: HTTP ${updateResponse.status}`
        };
  }

  const createResponse = await request(commentsUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ body: input.body })
  });

  return createResponse.ok
    ? { status: "created" }
    : {
        status: "skipped",
        reason: `failed to create comment: HTTP ${createResponse.status}`
      };
}

export function shouldPostPrComment(input: {
  trigger: PrCommentTrigger;
  policyPassed: boolean;
  newFindingsCount: number;
}): boolean {
  if (input.trigger === "always") {
    return true;
  }

  if (input.trigger === "failure") {
    return !input.policyPassed;
  }

  return input.newFindingsCount > 0;
}

async function readPullNumber(eventPath: string): Promise<number | null> {
  try {
    const raw = await fs.readFile(eventPath, "utf8");
    const event = JSON.parse(raw) as PullRequestEvent;
    const value = event.pull_request?.number ?? event.number;
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

async function defaultGitHubRequest(
  url: string,
  init: {
    method: "GET" | "POST" | "PATCH";
    headers: Record<string, string>;
    body?: string;
  }
): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
  const response = await fetch(url, init);
  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json()
  };
}

function buildHeaders(token: string): Record<string, string> {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28"
  };
}

function normalizeComments(value: unknown): GitHubComment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): GitHubComment | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const comment = item as Partial<GitHubComment>;
      return typeof comment.id === "number"
        ? { id: comment.id, body: comment.body }
        : null;
    })
    .filter((item): item is GitHubComment => item !== null);
}
