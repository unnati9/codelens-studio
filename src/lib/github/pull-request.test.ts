import { describe, expect, it } from "vitest";
import { parseGitHubPullRequestUrl } from "./pull-request";
import { normalizeGitHubPullRequest } from "./schema";

const rawPullRequest = {
  number: 42,
  title: "Add review canvas",
  body: "A public pull request",
  user: { login: "octocat", avatar_url: "https://avatars.githubusercontent.com/u/1?v=4" },
  state: "open",
  merged_at: null,
  base: {
    ref: "main",
    repo: { full_name: "octocat/Hello-World", private: false },
  },
  head: { ref: "feature/review", sha: "0123456789abcdef0123456789abcdef01234567" },
  html_url: "https://github.com/octocat/Hello-World/pull/42",
  additions: 18,
  deletions: 4,
  changed_files: 1,
};

const rawFile = {
  filename: "src/review.ts",
  status: "modified",
  additions: 18,
  deletions: 4,
  changes: 22,
  patch: "@@ -1 +1 @@\n-old\n+new",
  raw_url: "https://github.com/octocat/Hello-World/raw/sha/src/review.ts",
  blob_url: "https://github.com/octocat/Hello-World/blob/sha/src/review.ts",
};

describe("GitHub pull-request URL parsing", () => {
  it("extracts a supported public pull-request locator", () => {
    expect(parseGitHubPullRequestUrl("https://github.com/octocat/Hello-World/pull/42")).toEqual({
      owner: "octocat",
      repository: "Hello-World",
      pullNumber: 42,
      canonicalUrl: "https://github.com/octocat/Hello-World/pull/42",
    });
  });

  it.each([
    "not a url",
    "http://github.com/octocat/Hello-World/pull/42",
    "https://gitlab.com/octocat/Hello-World/pull/42",
    "https://github.com/octocat/Hello-World/issues/42",
    "https://github.com/octocat/Hello-World/pull/nope",
    "https://github.com/octocat/Hello-World/pull/42/files",
  ])("rejects unsupported URL %s", (url) => {
    expect(() => parseGitHubPullRequestUrl(url)).toThrow();
  });
});

describe("GitHub response normalization", () => {
  it("normalizes pull-request metadata and changed files", () => {
    const normalized = normalizeGitHubPullRequest({
      pullRequest: rawPullRequest,
      files: [rawFile],
      fileLimit: 300,
      importLimit: 20,
    });

    expect(normalized).toMatchObject({
      repositoryFullName: "octocat/Hello-World",
      pullNumber: 42,
      state: "OPEN",
      headCommitSha: rawPullRequest.head.sha,
      changedFileCount: 1,
      truncated: false,
    });
    expect(normalized.files[0]).toMatchObject({
      filename: "src/review.ts",
      previousFilename: null,
      patch: rawFile.patch,
    });
  });

  it("rejects malformed GitHub responses", () => {
    expect(() =>
      normalizeGitHubPullRequest({
        pullRequest: { ...rawPullRequest, head: { ref: "feature", sha: "invalid" } },
        files: [rawFile],
        fileLimit: 300,
        importLimit: 20,
      }),
    ).toThrow();
  });
});
