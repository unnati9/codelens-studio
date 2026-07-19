import { describe, expect, it } from "vitest";
import {
  githubConnectedPullRequestRequestSchema,
  normalizeGitHubInstallations,
  normalizeGitHubPullRequestSummaries,
  normalizeGitHubRepositories,
} from "./connected-schema";

describe("connected GitHub response normalization", () => {
  it("normalizes installations and repositories without token data", () => {
    const [installation] = normalizeGitHubInstallations({
      installations: [
        {
          id: 987,
          account: {
            login: "octocat",
            avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
            html_url: "https://github.com/octocat",
          },
          repository_selection: "selected",
          html_url: "https://github.com/settings/installations/987",
          app_slug: "codelens-studio",
        },
      ],
    });
    const [repository] = normalizeGitHubRepositories(
      {
        repositories: [
          {
            id: 1296269,
            name: "Hello-World",
            full_name: "octocat/Hello-World",
            private: true,
            archived: false,
            default_branch: "main",
            html_url: "https://github.com/octocat/Hello-World",
            owner: {
              login: "octocat",
              avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
            },
          },
        ],
      },
      installation.installationId,
    );

    expect(installation).toMatchObject({
      installationId: 987,
      accountLogin: "octocat",
      repositorySelection: "SELECTED",
    });
    expect(repository).toMatchObject({
      installationId: 987,
      repositoryId: 1296269,
      fullName: "octocat/Hello-World",
      isPrivate: true,
    });
    expect(repository).not.toHaveProperty("accessToken");
  });

  it("normalizes open pull requests with both immutable commit SHAs", () => {
    const [pullRequest] = normalizeGitHubPullRequestSummaries([
      {
        number: 42,
        title: "Add review canvas",
        body: "Review this change",
        user: {
          login: "octocat",
          avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
        },
        state: "open",
        draft: false,
        base: { ref: "main", sha: "fedcba9876543210fedcba9876543210fedcba98" },
        head: { ref: "feature/review", sha: "0123456789abcdef0123456789abcdef01234567" },
        html_url: "https://github.com/octocat/Hello-World/pull/42",
        updated_at: "2026-07-19T12:00:00Z",
      },
    ]);

    expect(pullRequest).toMatchObject({
      pullNumber: 42,
      baseBranch: "main",
      baseCommitSha: "fedcba9876543210fedcba9876543210fedcba98",
      headBranch: "feature/review",
      headCommitSha: "0123456789abcdef0123456789abcdef01234567",
    });
  });

  it("rejects ambiguous or malformed repository locators", () => {
    expect(
      githubConnectedPullRequestRequestSchema.safeParse({
        installationId: 987,
        repositoryId: 1296269,
        owner: "octocat",
        repository: "Hello-World/other",
        pullNumber: 42,
      }).success,
    ).toBe(false);
  });
});
