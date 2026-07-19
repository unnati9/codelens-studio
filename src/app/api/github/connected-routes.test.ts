import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getRepositories } from "./repositories/route";
import { POST as getPullRequests } from "./pull-requests/route";
import { POST as getConnectedPullRequest } from "./pull-request/connected/route";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listRepositories: vi.fn(),
  listPullRequests: vi.fn(),
  getPullRequest: vi.fn(),
}));

vi.mock("@/lib/github/auth", () => ({ getGitHubSession: mocks.getSession }));
vi.mock("@/lib/github/connected-server", () => ({
  listGitHubAccessibleRepositories: mocks.listRepositories,
  listOpenGitHubPullRequests: mocks.listPullRequests,
  fetchConnectedGitHubPullRequest: mocks.getPullRequest,
}));

const repositoryLocator = {
  installationId: 987,
  repositoryId: 1296269,
  owner: "octocat",
  repository: "Hello-World",
};
const repository = {
  ...repositoryLocator,
  name: repositoryLocator.repository,
  fullName: "octocat/Hello-World",
  isPrivate: false,
  isArchived: false,
  defaultBranch: "main",
  htmlUrl: "https://github.com/octocat/Hello-World",
  ownerAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
};
const session = {
  accessToken: "secret-server-token",
  user: { id: 1, login: "octocat" },
};

function postRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.listRepositories.mockReset();
  mocks.listPullRequests.mockReset();
  mocks.getPullRequest.mockReset();
});

describe("connected GitHub API routes", () => {
  it("requires a server-side GitHub session", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await getRepositories();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "GITHUB_AUTH_REQUIRED" },
    });
    expect(mocks.listRepositories).not.toHaveBeenCalled();
  });

  it("returns installations and repositories without the access token", async () => {
    mocks.getSession.mockResolvedValue(session);
    mocks.listRepositories.mockResolvedValue({
      installations: [
        {
          installationId: 987,
          accountLogin: "octocat",
          accountAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
          accountUrl: "https://github.com/octocat",
          repositorySelection: "SELECTED",
          appSlug: "codelens-studio",
        },
      ],
      repositories: [repository],
    });

    const response = await getRepositories();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.repositories[0]).toMatchObject({
      installationId: repository.installationId,
      repositoryId: repository.repositoryId,
      fullName: repository.fullName,
    });
    expect(JSON.stringify(body)).not.toContain(session.accessToken);
    expect(mocks.listRepositories).toHaveBeenCalledWith(session.accessToken);
  });

  it("validates the exact repository locator before listing pull requests", async () => {
    mocks.getSession.mockResolvedValue(session);

    const response = await getPullRequests(
      postRequest("/api/github/pull-requests", {
        ...repositoryLocator,
        owner: "invalid/owner",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.listPullRequests).not.toHaveBeenCalled();
  });

  it("passes a validated connected PR selection to the server layer", async () => {
    mocks.getSession.mockResolvedValue(session);
    mocks.getPullRequest.mockResolvedValue({
      repository,
      pullRequest: {
        repositoryFullName: repository.fullName,
        pullNumber: 42,
        title: "Add review canvas",
        description: null,
        authorLogin: "octocat",
        authorAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
        state: "OPEN",
        baseBranch: "main",
        baseCommitSha: "fedcba9876543210fedcba9876543210fedcba98",
        headBranch: "feature/review",
        headCommitSha: "0123456789abcdef0123456789abcdef01234567",
        htmlUrl: "https://github.com/octocat/Hello-World/pull/42",
        additions: 18,
        deletions: 4,
        changedFileCount: 0,
        files: [],
        truncated: false,
        fileLimit: 300,
        importLimit: 20,
        unusuallyLarge: false,
      },
    });

    const response = await getConnectedPullRequest(
      postRequest("/api/github/pull-request/connected", {
        ...repositoryLocator,
        pullNumber: 42,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.getPullRequest).toHaveBeenCalledWith(session.accessToken, {
      ...repositoryLocator,
      pullNumber: 42,
    });
  });
});
