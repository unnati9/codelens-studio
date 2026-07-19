import { z } from "zod";
import { githubPullRequestLocatorSchema, type GitHubPullRequestLocator } from "@/lib/github/schema";

export class GitHubImportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryAt: string | null = null,
  ) {
    super(message);
    this.name = "GitHubImportError";
  }
}

const ownerPattern = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const repositoryPattern = /^[a-z\d._-]+$/i;

export function parseGitHubPullRequestUrl(input: string): GitHubPullRequestLocator {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new GitHubImportError("INVALID_URL", "Enter a valid GitHub pull-request URL.", 400);
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const pullNumber = Number(segments[3]);
  const supported =
    url.protocol === "https:" &&
    url.hostname.toLowerCase() === "github.com" &&
    segments.length === 4 &&
    segments[2] === "pull" &&
    ownerPattern.test(segments[0] ?? "") &&
    repositoryPattern.test(segments[1] ?? "") &&
    Number.isSafeInteger(pullNumber) &&
    pullNumber > 0;

  if (!supported) {
    throw new GitHubImportError(
      "UNSUPPORTED_URL",
      "Use https://github.com/{owner}/{repository}/pull/{pullNumber}.",
      400,
    );
  }

  return githubPullRequestLocatorSchema.parse({
    owner: segments[0],
    repository: segments[1],
    pullNumber,
    canonicalUrl: `https://github.com/${segments[0]}/${segments[1]}/pull/${pullNumber}`,
  });
}

export function asGitHubImportError(error: unknown): GitHubImportError {
  if (error instanceof GitHubImportError) return error;
  if (error instanceof z.ZodError) {
    return new GitHubImportError(
      "MALFORMED_RESPONSE",
      "GitHub returned data that CodeLens Studio could not validate.",
      502,
    );
  }
  return new GitHubImportError(
    "NETWORK_FAILURE",
    error instanceof Error ? error.message : "Could not reach GitHub.",
    502,
  );
}
