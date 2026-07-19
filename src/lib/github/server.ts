import {
  githubChangedFileApiArraySchema,
  githubPullRequestSchema,
  normalizeGitHubPullRequest,
  type GitHubPullRequest,
  type GitHubPullRequestLocator,
} from "@/lib/github/schema";
import { asGitHubImportError, GitHubImportError } from "@/lib/github/pull-request";

const githubApiBaseUrl = "https://api.github.com";
const githubApiVersion = "2026-03-10";

function configuredInteger(name: string, fallback: number, maximum: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

function requestHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "CodeLens-Studio",
    "X-GitHub-Api-Version": githubApiVersion,
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new GitHubImportError(
      "MALFORMED_RESPONSE",
      "GitHub returned an unreadable response.",
      502,
    );
  }
}

function retryAtFromResponse(response: Response): string | null {
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) return new Date(reset * 1000).toISOString();
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return new Date(Date.now() + retryAfter * 1000).toISOString();
  }
  return null;
}

async function githubJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: requestHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new GitHubImportError(
      "NETWORK_FAILURE",
      error instanceof Error
        ? `Could not reach GitHub: ${error.message}`
        : "Could not reach GitHub.",
      502,
    );
  }

  if (response.ok) return responseBody(response);

  const remaining = response.headers.get("x-ratelimit-remaining");
  if (response.status === 429 || (response.status === 403 && remaining === "0")) {
    throw new GitHubImportError(
      "RATE_LIMITED",
      "GitHub's API rate limit has been reached. Try again later or configure GITHUB_TOKEN.",
      429,
      retryAtFromResponse(response),
    );
  }
  if (response.status === 404) {
    throw new GitHubImportError(
      "NOT_FOUND_OR_PRIVATE",
      "The pull request was not found, or its repository is private.",
      404,
    );
  }

  const body = await responseBody(response);
  const message =
    typeof body === "object" && body && "message" in body && typeof body.message === "string"
      ? body.message
      : `GitHub returned status ${response.status}.`;
  throw new GitHubImportError("GITHUB_API_ERROR", message, 502);
}

export async function fetchPublicGitHubPullRequest(
  locator: GitHubPullRequestLocator,
): Promise<GitHubPullRequest> {
  const fileLimit = configuredInteger("GITHUB_PR_MAX_FILES", 300, 3000);
  const importLimit = configuredInteger("GITHUB_IMPORT_LIMIT", 20, 100);
  const basePath = `${githubApiBaseUrl}/repos/${encodeURIComponent(locator.owner)}/${encodeURIComponent(locator.repository)}/pulls/${locator.pullNumber}`;

  try {
    const pullRequest = await githubJson(basePath);
    const privateRepository =
      typeof pullRequest === "object" &&
      pullRequest !== null &&
      "base" in pullRequest &&
      typeof pullRequest.base === "object" &&
      pullRequest.base !== null &&
      "repo" in pullRequest.base &&
      typeof pullRequest.base.repo === "object" &&
      pullRequest.base.repo !== null &&
      "private" in pullRequest.base.repo &&
      pullRequest.base.repo.private === true;
    if (privateRepository) {
      throw new GitHubImportError(
        "PRIVATE_REPOSITORY",
        "Private repositories are not supported by this importer.",
        403,
      );
    }

    const rawFiles: unknown[] = [];
    const pageCount = Math.ceil(fileLimit / 100);
    for (let page = 1; page <= pageCount; page += 1) {
      const pageData = githubChangedFileApiArraySchema.parse(
        await githubJson(`${basePath}/files?per_page=100&page=${page}`),
      );
      rawFiles.push(...pageData.slice(0, fileLimit - rawFiles.length));
      if (pageData.length < 100 || rawFiles.length >= fileLimit) break;
    }

    return githubPullRequestSchema.parse(
      normalizeGitHubPullRequest({ pullRequest, files: rawFiles, fileLimit, importLimit }),
    );
  } catch (error) {
    throw asGitHubImportError(error);
  }
}
