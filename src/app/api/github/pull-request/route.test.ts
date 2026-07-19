import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const rawPullRequest = {
  number: 42,
  title: "Add review canvas",
  body: null,
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

function apiRequest() {
  return new Request("http://localhost/api/github/pull-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://github.com/octocat/Hello-World/pull/42" }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitHub pull-request API route", () => {
  it("fetches a public pull request using mocked GitHub responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(rawPullRequest))
      .mockResolvedValueOnce(
        Response.json([
          {
            filename: "src/review.ts",
            status: "modified",
            additions: 18,
            deletions: 4,
            changes: 22,
            patch: "@@ -1 +1 @@\n-old\n+new",
            raw_url: "https://github.com/octocat/Hello-World/raw/sha/src/review.ts",
            blob_url: "https://github.com/octocat/Hello-World/blob/sha/src/review.ts",
          },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(apiRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      pullRequest: { repositoryFullName: "octocat/Hello-World", changedFileCount: 1 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns a rate-limit response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { message: "API rate limit exceeded" },
            { status: 403, headers: { "x-ratelimit-remaining": "0" } },
          ),
        ),
    );
    const response = await POST(apiRequest());
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "RATE_LIMITED" } });
  });

  it("returns not found for an unavailable pull request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ message: "Not Found" }, { status: 404 })),
    );
    const response = await POST(apiRequest());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND_OR_PRIVATE" },
    });
  });
});
