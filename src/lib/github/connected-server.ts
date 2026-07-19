import {
  githubInstallationApiResponseSchema,
  githubInstallationRepositoriesApiResponseSchema,
  githubOpenPullRequestsApiResponseSchema,
  githubRepositoryLocatorSchema,
  normalizeGitHubInstallations,
  normalizeGitHubPullRequestSummaries,
  normalizeGitHubRepositories,
  type GitHubInstallation,
  type GitHubPullRequestSummary,
  type GitHubRepository,
  type GitHubRepositoryLocator,
} from "@/lib/github/connected-schema";
import { githubApiBaseUrl, githubJson } from "@/lib/github/api-client";
import { GitHubImportError, asGitHubImportError } from "@/lib/github/pull-request";
import { githubPullRequestLocatorSchema, type GitHubPullRequest } from "@/lib/github/schema";
import { fetchGitHubPullRequest } from "@/lib/github/server";

const pageSize = 100;

function configuredInteger(name: string, fallback: number, maximum: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

function requireAccessToken(accessToken: string) {
  if (!accessToken.trim()) {
    throw new GitHubImportError("GITHUB_AUTH_REQUIRED", "Connect GitHub to continue.", 401);
  }
}

export async function listGitHubUserInstallations(
  accessToken: string,
): Promise<GitHubInstallation[]> {
  requireAccessToken(accessToken);
  const installationLimit = configuredInteger("GITHUB_INSTALLATION_LIST_LIMIT", 100, 1000);
  const installations: GitHubInstallation[] = [];

  try {
    for (let page = 1; installations.length < installationLimit; page += 1) {
      const body = githubInstallationApiResponseSchema.parse(
        await githubJson(
          `${githubApiBaseUrl}/user/installations?per_page=${pageSize}&page=${page}`,
          {
            accessToken,
          },
        ),
      );
      const normalized = normalizeGitHubInstallations(body);
      installations.push(...normalized.slice(0, installationLimit - installations.length));
      if (body.installations.length < pageSize) break;
    }
    return installations.sort((left, right) =>
      left.accountLogin.localeCompare(right.accountLogin, undefined, { sensitivity: "base" }),
    );
  } catch (error) {
    throw asGitHubImportError(error);
  }
}

export async function listGitHubInstallationRepositories(
  accessToken: string,
  installationId: number,
): Promise<GitHubRepository[]> {
  requireAccessToken(accessToken);
  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    throw new GitHubImportError("INVALID_REQUEST", "A valid installation is required.", 400);
  }
  const repositoryLimit = configuredInteger("GITHUB_REPOSITORY_LIST_LIMIT", 1000, 10_000);
  const repositories: GitHubRepository[] = [];

  try {
    for (let page = 1; repositories.length < repositoryLimit; page += 1) {
      const body = githubInstallationRepositoriesApiResponseSchema.parse(
        await githubJson(
          `${githubApiBaseUrl}/user/installations/${installationId}/repositories?per_page=${pageSize}&page=${page}`,
          {
            accessToken,
            notFoundCode: "INSTALLATION_NOT_FOUND",
            notFoundMessage: "The GitHub App installation is unavailable.",
          },
        ),
      );
      const normalized = normalizeGitHubRepositories(body, installationId);
      repositories.push(...normalized.slice(0, repositoryLimit - repositories.length));
      if (body.repositories.length < pageSize) break;
    }
    return repositories.sort((left, right) =>
      left.fullName.localeCompare(right.fullName, undefined, { sensitivity: "base" }),
    );
  } catch (error) {
    throw asGitHubImportError(error);
  }
}

export async function listGitHubAccessibleRepositories(accessToken: string): Promise<{
  installations: GitHubInstallation[];
  repositories: GitHubRepository[];
}> {
  const installations = await listGitHubUserInstallations(accessToken);
  const repositories = (
    await Promise.all(
      installations.map((installation) =>
        listGitHubInstallationRepositories(accessToken, installation.installationId),
      ),
    )
  )
    .flat()
    .sort((left, right) =>
      left.fullName.localeCompare(right.fullName, undefined, { sensitivity: "base" }),
    );
  return { installations, repositories };
}

export async function verifyGitHubRepositoryAccess(
  accessToken: string,
  input: GitHubRepositoryLocator,
): Promise<GitHubRepository> {
  const locator = githubRepositoryLocatorSchema.parse({
    installationId: input.installationId,
    repositoryId: input.repositoryId,
    owner: input.owner,
    repository: input.repository,
  });
  const repositories = await listGitHubInstallationRepositories(
    accessToken,
    locator.installationId,
  );
  const expectedFullName = `${locator.owner}/${locator.repository}`.toLowerCase();
  const repository = repositories.find(
    (candidate) =>
      candidate.repositoryId === locator.repositoryId &&
      candidate.fullName.toLowerCase() === expectedFullName,
  );
  if (!repository) {
    throw new GitHubImportError(
      "REPOSITORY_ACCESS_DENIED",
      "This GitHub App installation cannot access the selected repository.",
      403,
    );
  }
  return repository;
}

async function fetchOpenPullRequestSummaries(
  accessToken: string,
  repository: GitHubRepository,
): Promise<GitHubPullRequestSummary[]> {
  const pullRequestLimit = configuredInteger("GITHUB_OPEN_PR_LIST_LIMIT", 300, 1000);
  const pullRequests: GitHubPullRequestSummary[] = [];

  for (let page = 1; pullRequests.length < pullRequestLimit; page += 1) {
    const body = githubOpenPullRequestsApiResponseSchema.parse(
      await githubJson(
        `${githubApiBaseUrl}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/pulls?state=open&sort=updated&direction=desc&per_page=${pageSize}&page=${page}`,
        {
          accessToken,
          notFoundCode: "REPOSITORY_ACCESS_DENIED",
          notFoundMessage: "The selected repository is unavailable to this GitHub connection.",
        },
      ),
    );
    const normalized = normalizeGitHubPullRequestSummaries(body);
    pullRequests.push(...normalized.slice(0, pullRequestLimit - pullRequests.length));
    if (body.length < pageSize) break;
  }
  return pullRequests;
}

export async function listOpenGitHubPullRequests(
  accessToken: string,
  input: GitHubRepositoryLocator,
): Promise<{ repository: GitHubRepository; pullRequests: GitHubPullRequestSummary[] }> {
  try {
    const repository = await verifyGitHubRepositoryAccess(accessToken, input);
    const pullRequests = await fetchOpenPullRequestSummaries(accessToken, repository);
    return { repository, pullRequests };
  } catch (error) {
    throw asGitHubImportError(error);
  }
}

export async function fetchConnectedGitHubPullRequest(
  accessToken: string,
  input: GitHubRepositoryLocator & { pullNumber: number },
): Promise<{ repository: GitHubRepository; pullRequest: GitHubPullRequest }> {
  try {
    const repository = await verifyGitHubRepositoryAccess(accessToken, input);
    const locator = githubPullRequestLocatorSchema.parse({
      owner: repository.owner,
      repository: repository.name,
      pullNumber: input.pullNumber,
      canonicalUrl: `https://github.com/${repository.owner}/${repository.name}/pull/${input.pullNumber}`,
    });
    const pullRequest = await fetchGitHubPullRequest(locator, {
      accessToken,
      allowPrivate: true,
    });
    if (pullRequest.repositoryFullName.toLowerCase() !== repository.fullName.toLowerCase()) {
      throw new GitHubImportError(
        "REPOSITORY_MISMATCH",
        "GitHub returned a pull request from a different repository.",
        409,
      );
    }
    return { repository, pullRequest };
  } catch (error) {
    throw asGitHubImportError(error);
  }
}
