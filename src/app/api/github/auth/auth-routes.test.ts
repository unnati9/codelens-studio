import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as startAuthorization } from "./start/route";
import { GET as finishAuthorization } from "./callback/route";
import { POST as disconnect } from "./disconnect/route";
import { GITHUB_OAUTH_COOKIE, GITHUB_SESSION_COOKIE } from "@/lib/github/auth/cookies";
import {
  createOAuthTransaction,
  decryptGitHubSession,
  signOAuthTransaction,
  verifyOAuthTransaction,
} from "@/lib/github/auth/crypto";

const secret = "a-test-session-secret-that-is-at-least-32-bytes-long";

function configureEnvironment() {
  vi.stubEnv("APP_URL", "https://codelens.example/");
  vi.stubEnv("GITHUB_APP_CALLBACK_URL", "https://codelens.example/api/github/auth/callback");
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "Iv1.client-id");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
  vi.stubEnv("GITHUB_APP_SLUG", "codelens-studio");
  vi.stubEnv("GITHUB_SESSION_SECRET", secret);
  vi.stubEnv("NODE_ENV", "production");
}

function setCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
}

function cookieValue(cookies: string[], name: string): string | undefined {
  for (const cookie of cookies) {
    const match = cookie.match(new RegExp(`(?:^|,\\s*)${name}=([^;]*)`));
    if (match) return match[1];
  }
  return undefined;
}

beforeEach(() => {
  configureEnvironment();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GitHub auth routes", () => {
  it("starts GitHub App authorization with state, PKCE, and a secure transient cookie", async () => {
    const response = await startAuthorization(
      new Request(
        "https://codelens.example/api/github/auth/start?returnTo=%2Fboards%2Fboard-1%3Fdrawer%3Dgithub",
      ),
    );

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("Iv1.client-id");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toBeTruthy();

    const cookies = setCookies(response);
    const transactionCookie = cookieValue(cookies, GITHUB_OAUTH_COOKIE);
    expect(cookies.join("\n")).toMatch(/HttpOnly/i);
    expect(cookies.join("\n")).toMatch(/SameSite=lax/i);
    expect(cookies.join("\n")).toMatch(/Secure/i);
    expect(
      verifyOAuthTransaction(
        transactionCookie,
        location.searchParams.get("state")!,
        secret,
        Date.now(),
      )?.returnTo,
    ).toBe("/boards/board-1?drawer=github");
  });

  it("does not accept an external return URL", async () => {
    const response = await startAuthorization(
      new Request(
        "https://codelens.example/api/github/auth/start?returnTo=https%3A%2F%2Fattacker.example",
      ),
    );
    const location = new URL(response.headers.get("location")!);
    const transaction = verifyOAuthTransaction(
      cookieValue(setCookies(response), GITHUB_OAUTH_COOKIE),
      location.searchParams.get("state")!,
      secret,
    );
    expect(transaction?.returnTo).toBe("/");
  });

  it("exchanges the code, validates /user, and stores only an encrypted session cookie", async () => {
    const transaction = createOAuthTransaction(Date.now(), "/boards/board-1?drawer=github");
    const oauthCookie = signOAuthTransaction(transaction, secret);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "server-only-access-token",
          token_type: "bearer",
          expires_in: 28_800,
          refresh_token: "server-only-refresh-token",
          refresh_token_expires_in: 15_552_000,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: 1,
          login: "octocat",
          name: "The Octocat",
          avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
          html_url: "https://github.com/octocat",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await finishAuthorization(
      new Request(
        `https://codelens.example/api/github/auth/callback?code=oauth-code&state=${transaction.state}`,
        { headers: { cookie: `${GITHUB_OAUTH_COOKIE}=${oauthCookie}` } },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://codelens.example/boards/board-1?drawer=github&github=connected",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const tokenRequest = fetchMock.mock.calls[0][1] as RequestInit;
    expect(tokenRequest.body?.toString()).toContain(`code_verifier=${transaction.codeVerifier}`);
    const cookies = setCookies(response);
    const encryptedSession = cookieValue(cookies, GITHUB_SESSION_COOKIE);
    expect(cookies.join("\n")).not.toContain("server-only-access-token");
    expect(cookies.join("\n")).not.toContain("server-only-refresh-token");
    expect(decryptGitHubSession(encryptedSession, secret)?.user.login).toBe("octocat");
    expect(cookies.join("\n")).toContain(`${GITHUB_OAUTH_COOKIE}=;`);
  });

  it("rejects a callback with a mismatched state before contacting GitHub", async () => {
    const transaction = createOAuthTransaction();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await finishAuthorization(
      new Request(
        "https://codelens.example/api/github/auth/callback?code=oauth-code&state=wrong-state-that-is-long-enough-123456",
        {
          headers: {
            cookie: `${GITHUB_OAUTH_COOKIE}=${signOAuthTransaction(transaction, secret)}`,
          },
        },
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_OAUTH_STATE" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed authenticated-user response", async () => {
    const transaction = createOAuthTransaction();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ access_token: "token", token_type: "bearer", expires_in: 3600 }),
        )
        .mockResolvedValueOnce(Response.json({ login: "missing-required-fields" })),
    );

    const response = await finishAuthorization(
      new Request(
        `https://codelens.example/api/github/auth/callback?code=oauth-code&state=${transaction.state}`,
        {
          headers: {
            cookie: `${GITHUB_OAUTH_COOKIE}=${signOAuthTransaction(transaction, secret)}`,
          },
        },
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "MALFORMED_GITHUB_RESPONSE" },
    });
  });

  it("clears both auth cookies on disconnect", async () => {
    const response = await disconnect();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ disconnected: true });
    const cookies = setCookies(response).join("\n");
    expect(cookies).toContain(`${GITHUB_SESSION_COOKIE}=;`);
    expect(cookies).toContain(`${GITHUB_OAUTH_COOKIE}=;`);
    expect(cookies).toMatch(/HttpOnly/i);
  });
});
