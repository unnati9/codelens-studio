import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptGitHubSession } from "@/lib/github/auth/crypto";
import type { GitHubSession } from "@/lib/github/auth/schema";

const cookieMocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: cookieMocks.cookies }));

import { getGitHubSession } from "@/lib/github/auth/session";

const secret = "a-test-session-secret-that-is-at-least-32-bytes-long";
const now = Date.parse("2026-07-19T12:00:00.000Z");

function configureEnvironment() {
  vi.stubEnv("APP_URL", "https://codelens.example/");
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "Iv1.client-id");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
  vi.stubEnv("GITHUB_APP_SLUG", "codelens-studio");
  vi.stubEnv("GITHUB_SESSION_SECRET", secret);
}

function githubSession(overrides: Partial<GitHubSession> = {}): GitHubSession {
  return {
    version: 1,
    accessToken: "old-access-token",
    refreshToken: "refresh-token",
    accessTokenExpiresAt: new Date(now + 30_000).toISOString(),
    refreshTokenExpiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
    issuedAt: new Date(now - 60_000).toISOString(),
    user: {
      id: 1,
      login: "octocat",
      name: null,
      avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      htmlUrl: "https://github.com/octocat",
    },
    ...overrides,
  };
}

beforeEach(() => {
  configureEnvironment();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  cookieMocks.cookies.mockResolvedValue({ get: cookieMocks.get, set: cookieMocks.set });
  cookieMocks.get.mockReset();
  cookieMocks.set.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("getGitHubSession", () => {
  it("returns null for an absent or invalid encrypted cookie", async () => {
    cookieMocks.get.mockReturnValue(undefined);
    await expect(getGitHubSession()).resolves.toBeNull();

    cookieMocks.get.mockReturnValue({ value: "not-an-encrypted-session" });
    await expect(getGitHubSession()).resolves.toBeNull();
  });

  it("returns a valid server-only session without refreshing it", async () => {
    const session = githubSession({
      accessTokenExpiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
    });
    cookieMocks.get.mockReturnValue({ value: encryptGitHubSession(session, secret) });

    await expect(getGitHubSession()).resolves.toEqual(session);
    expect(cookieMocks.set).not.toHaveBeenCalled();
  });

  it("refreshes a token close to expiry and replaces the encrypted cookie", async () => {
    const session = githubSession();
    cookieMocks.get.mockReturnValue({ value: encryptGitHubSession(session, secret) });
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        access_token: "fresh-access-token",
        token_type: "bearer",
        expires_in: 28_800,
        refresh_token: "fresh-refresh-token",
        refresh_token_expires_in: 15_552_000,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getGitHubSession();

    expect(result?.accessToken).toBe("fresh-access-token");
    expect(result?.refreshToken).toBe("fresh-refresh-token");
    expect(cookieMocks.set).toHaveBeenCalledOnce();
    expect(JSON.stringify(cookieMocks.set.mock.calls)).not.toContain("fresh-access-token");
    const body = fetchMock.mock.calls[0][1].body.toString();
    expect(body).toContain("grant_type=refresh_token");
  });

  it("does not return an expired session without a usable refresh token", async () => {
    const session = githubSession({
      accessTokenExpiresAt: new Date(now - 1).toISOString(),
      refreshToken: null,
      refreshTokenExpiresAt: null,
    });
    cookieMocks.get.mockReturnValue({ value: encryptGitHubSession(session, secret) });

    await expect(getGitHubSession()).resolves.toBeNull();
  });
});
