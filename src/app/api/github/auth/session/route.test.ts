import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubSession } from "@/lib/github/auth/schema";

const sessionMocks = vi.hoisted(() => ({ getGitHubSession: vi.fn() }));

vi.mock("@/lib/github/auth/session", () => ({
  getGitHubSession: sessionMocks.getGitHubSession,
}));

import { GET } from "./route";

const session: GitHubSession = {
  version: 1,
  accessToken: "must-never-be-returned",
  refreshToken: "also-must-never-be-returned",
  accessTokenExpiresAt: "2026-07-19T20:00:00.000Z",
  refreshTokenExpiresAt: "2027-01-19T12:00:00.000Z",
  issuedAt: "2026-07-19T12:00:00.000Z",
  user: {
    id: 1,
    login: "octocat",
    name: "The Octocat",
    avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
    htmlUrl: "https://github.com/octocat",
  },
};

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://codelens.example/");
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "Iv1.client-id");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
  vi.stubEnv("GITHUB_APP_SLUG", "codelens-studio");
  vi.stubEnv("GITHUB_SESSION_SECRET", "a-test-session-secret-that-is-at-least-32-bytes-long");
  sessionMocks.getGitHubSession.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GitHub auth session route", () => {
  it("returns only public status and profile fields for a connected user", async () => {
    sessionMocks.getGitHubSession.mockResolvedValue(session);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      connected: true,
      installUrl: "https://github.com/apps/codelens-studio/installations/new",
      user: session.user,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
    });
    expect(JSON.stringify(body)).not.toContain(session.accessToken);
    expect(JSON.stringify(body)).not.toContain(session.refreshToken);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns an installation URL when disconnected", async () => {
    sessionMocks.getGitHubSession.mockResolvedValue(null);

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      connected: false,
      installUrl: "https://github.com/apps/codelens-studio/installations/new",
      user: null,
      accessTokenExpiresAt: null,
    });
  });
});
