import {
  githubChangedFileApiArraySchema,
  githubPullRequestSchema,
  normalizeGitHubPullRequest,
  type GitHubPullRequest,
  type GitHubPullRequestLocator,
} from "@/lib/github/schema";
import { asGitHubImportError, GitHubImportError } from "@/lib/github/pull-request";
import { githubApiBaseUrl, githubJson } from "@/lib/github/api-client";

function configuredInteger(name: string, fallback: number, maximum: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

export async function fetchGitHubPullRequest(
  locator: GitHubPullRequestLocator,
  options: { accessToken?: string; allowPrivate?: boolean } = {},
): Promise<GitHubPullRequest> {
  const fileLimit = configuredInteger("GITHUB_PR_MAX_FILES", 300, 3000);
  const importLimit = configuredInteger("GITHUB_IMPORT_LIMIT", 20, 100);
  const basePath = `${githubApiBaseUrl}/repos/${encodeURIComponent(locator.owner)}/${encodeURIComponent(locator.repository)}/pulls/${locator.pullNumber}`;

  try {
    const pullRequest = await githubJson(basePath, {
      accessToken: options.accessToken,
      notFoundCode: "NOT_FOUND_OR_PRIVATE",
      notFoundMessage: "The pull request was not found, or its repository is private.",
    });
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
    if (privateRepository && !options.allowPrivate) {
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
        await githubJson(`${basePath}/files?per_page=100&page=${page}`, {
          accessToken: options.accessToken,
          notFoundCode: "NOT_FOUND_OR_PRIVATE",
          notFoundMessage: "The pull request was not found, or its repository is private.",
        }),
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

export async function fetchPublicGitHubPullRequest(
  locator: GitHubPullRequestLocator,
): Promise<GitHubPullRequest> {
  return fetchGitHubPullRequest(locator);
}
