import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchConnectedGitHubPullRequest,
  listGitHubAccessibleRepositories,
  listOpenGitHubPullRequests,
  verifyGitHubRepositoryAccess,
} from "./connected-server";

const accessToken = "github-user-token";
const locator = {
  installationId: 987,
  repositoryId: 1296269,
  owner: "octocat",
  repository: "Hello-World",
};
const installationResponse = {
  total_count: 1,
  installations: [
    {
      id: locator.installationId,
      account: {
        login: locator.owner,
        avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
        html_url: "https://github.com/octocat",
      },
      repository_selection: "selected",
      html_url: "https://github.com/settings/installations/987",
      app_slug: "codelens-studio",
    },
  ],
};
const repositoryResponse = {
  total_count: 1,
  repositories: [
    {
      id: locator.repositoryId,
      name: locator.repository,
      full_name: `${locator.owner}/${locator.repository}`,
      private: false,
      archived: false,
      default_branch: "main",
      html_url: "https://github.com/octocat/Hello-World",
      owner: {
        login: locator.owner,
        avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
      },
    },
  ],
};
const openPullRequest = {
  number: 42,
  title: "Add review canvas",
  body: null,
  user: { login: "octocat", avatar_url: "https://avatars.githubusercontent.com/u/1?v=4" },
  state: "open",
  draft: false,
  base: { ref: "main", sha: "fedcba9876543210fedcba9876543210fedcba98" },
  head: { ref: "feature/review", sha: "0123456789abcdef0123456789abcdef01234567" },
  html_url: "https://github.com/octocat/Hello-World/pull/42",
  updated_at: "2026-07-19T12:00:00Z",
};
const pullRequestDetails = {
  ...openPullRequest,
  merged_at: null,
  base: {
    ...openPullRequest.base,
    repo: { full_name: "octocat/Hello-World", private: false },
  },
  additions: 18,
  deletions: 4,
  changed_files: 1,
};
const changedFile = {
  filename: "src/review.ts",
  status: "modified",
  additions: 18,
  deletions: 4,
  changes: 22,
  patch: "@@ -1 +1 @@\n-old\n+new",
  raw_url: "https://github.com/octocat/Hello-World/raw/sha/src/review.ts",
  blob_url: "https://github.com/octocat/Hello-World/blob/sha/src/review.ts",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("connected GitHub server API", () => {
  it("lists repositories from the user's GitHub App installations", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(installationResponse))
      .mockResolvedValueOnce(Response.json(repositoryResponse));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listGitHubAccessibleRepositories(accessToken);

    expect(result.installations).toHaveLength(1);
    expect(result.repositories[0]).toMatchObject({
      installationId: locator.installationId,
      repositoryId: locator.repositoryId,
      fullName: "octocat/Hello-World",
    });
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${accessToken}`);
    }
  });

  it("verifies repository id and full name within the exact installation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(repositoryResponse)));
    await expect(
      verifyGitHubRepositoryAccess(accessToken, { ...locator, repositoryId: 999999 }),
    ).rejects.toMatchObject({ code: "REPOSITORY_ACCESS_DENIED", status: 403 });
  });

  it("lists only open pull requests after verifying repository access", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(repositoryResponse))
      .mockResolvedValueOnce(Response.json([openPullRequest]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listOpenGitHubPullRequests(accessToken, locator);

    expect(result.repository.repositoryId).toBe(locator.repositoryId);
    expect(result.pullRequests).toEqual([
      expect.objectContaining({
        pullNumber: 42,
        state: "OPEN",
        headCommitSha: openPullRequest.head.sha,
      }),
    ]);
    expect(String(fetchMock.mock.calls[1][0])).toContain("state=open");
  });

  it("fetches authenticated pull request details and changed files", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(repositoryResponse))
      .mockResolvedValueOnce(Response.json(pullRequestDetails))
      .mockResolvedValueOnce(Response.json([changedFile]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchConnectedGitHubPullRequest(accessToken, {
      ...locator,
      pullNumber: 42,
    });

    expect(result.pullRequest).toMatchObject({
      repositoryFullName: "octocat/Hello-World",
      pullNumber: 42,
      baseCommitSha: pullRequestDetails.base.sha,
      headCommitSha: pullRequestDetails.head.sha,
    });
    expect(result.pullRequest.files[0]).toMatchObject({ filename: "src/review.ts" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("surfaces an expired GitHub user token without exposing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ message: "Bad credentials" }, { status: 401 })),
    );
    const error = await listGitHubAccessibleRepositories(accessToken).catch((caught) => caught);

    expect(error).toMatchObject({ code: "GITHUB_AUTH_EXPIRED", status: 401 });
    expect(String(error.message)).not.toContain(accessToken);
  });
});
