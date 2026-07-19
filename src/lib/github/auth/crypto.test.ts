import { afterEach, describe, expect, it, vi } from "vitest";
import { getGitHubAuthConfig, githubAppInstallUrl } from "@/lib/github/auth/config";
import {
  createCodeChallenge,
  createOAuthTransaction,
  decryptGitHubSession,
  encryptGitHubSession,
  signOAuthTransaction,
  verifyOAuthTransaction,
} from "@/lib/github/auth/crypto";
import type { GitHubSession } from "@/lib/github/auth/schema";

const secret = "a-test-session-secret-that-is-at-least-32-bytes-long";
const now = Date.parse("2026-07-19T12:00:00.000Z");

const session: GitHubSession = {
  version: 1,
  accessToken: "github-access-token",
  refreshToken: "github-refresh-token",
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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GitHub OAuth cryptography", () => {
  it("signs a short-lived state transaction and validates state in constant-time code", () => {
    const transaction = createOAuthTransaction(now, "/boards/board-1?panel=github");
    const signed = signOAuthTransaction(transaction, secret);

    expect(verifyOAuthTransaction(signed, transaction.state, secret, now + 30_000)).toEqual(
      transaction,
    );
    expect(
      verifyOAuthTransaction(signed, `${transaction.state}x`, secret, now + 30_000),
    ).toBeNull();
    expect(
      verifyOAuthTransaction(signed, transaction.state, secret, now + 10 * 60_000 + 1),
    ).toBeNull();
  });

  it("rejects a transaction whose signed payload was changed", () => {
    const transaction = createOAuthTransaction(now);
    const signed = signOAuthTransaction(transaction, secret);
    const [payload, signature] = signed.split(".");
    const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}`;

    expect(
      verifyOAuthTransaction(`${tamperedPayload}.${signature}`, transaction.state, secret, now),
    ).toBeNull();
  });

  it("generates an S256 PKCE challenge", () => {
    expect(createCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("round-trips an encrypted session without leaving tokens in plaintext", () => {
    const encrypted = encryptGitHubSession(session, secret);

    expect(encrypted).not.toContain(session.accessToken);
    expect(encrypted).not.toContain(session.refreshToken!);
    expect(decryptGitHubSession(encrypted, secret)).toEqual(session);
  });

  it("rejects tampered session ciphertext and the wrong secret", () => {
    const encrypted = encryptGitHubSession(session, secret);
    const [version, iv, ciphertext, tag] = encrypted.split(".");
    const tamperedCiphertext = `${ciphertext.slice(0, -1)}${ciphertext.endsWith("A") ? "B" : "A"}`;

    expect(
      decryptGitHubSession(`${version}.${iv}.${tamperedCiphertext}.${tag}`, secret),
    ).toBeNull();
    expect(decryptGitHubSession(encrypted, `${secret}-wrong`)).toBeNull();
  });
});

describe("GitHub auth configuration", () => {
  function configure() {
    vi.stubEnv("APP_URL", "https://codelens.example/");
    vi.stubEnv("GITHUB_APP_CALLBACK_URL", "https://codelens.example/api/github/auth/callback");
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "Iv1.client-id");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GITHUB_APP_SLUG", "codelens-studio");
    vi.stubEnv("GITHUB_SESSION_SECRET", secret);
  }

  it("accepts an exact fixed callback URL and creates the installation URL", () => {
    configure();

    const config = getGitHubAuthConfig();
    expect(config.callbackUrl.toString()).toBe("https://codelens.example/api/github/auth/callback");
    expect(githubAppInstallUrl(config.appSlug)).toBe(
      "https://github.com/apps/codelens-studio/installations/new",
    );
  });

  it("rejects a callback URL on a different origin", () => {
    configure();
    vi.stubEnv("GITHUB_APP_CALLBACK_URL", "https://attacker.example/api/github/auth/callback");

    expect(() => getGitHubAuthConfig()).toThrow(/must exactly match/);
  });

  it("rejects an application URL with a path", () => {
    configure();
    vi.stubEnv("APP_URL", "https://codelens.example/boards/1");

    expect(() => getGitHubAuthConfig()).toThrow(/only the application origin/);
  });
});
